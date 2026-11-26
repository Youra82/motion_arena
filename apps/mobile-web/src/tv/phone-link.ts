import { create } from "zustand";
import { summarize } from "@motion-arena/motion-scoring";
import type { Landmark } from "@motion-arena/shared";
import { hudViewFrom } from "../components/hud-view";
import { actions, useApp, type AppState } from "../store";
import { forgetSettings } from "../persist";
import { VERSION_LABEL } from "../version";
import { PROTOCOL_VERSION, encodePose, normalizeCode, normalizeSecret, type PhoneMessage, type TvState } from "./protocol";
import { joinLink, type Link, type LinkStatus } from "./transport";

/**
 * Handy-Seite der TV-Kopplung. Der Fernseher zeigt dasselbe wie die App:
 *  - Anzeigewerte (gleiche Live-Anzeige) und Gelenkpunkte über den Datenkanal,
 *  - mit Zustimmung das Live-Bild als Videostream (direkt zwischen den Geräten, verschlüsselt).
 *
 * Jede Kopplung ist eine Sitzung mit eigener Nummer. Rückrufe, Timer und Verbindungen älterer Sitzungen
 * werden verworfen; beim Trennen wird alles aufgeräumt (Anruf, eigene Videospuren, Timer).
 */
interface PhoneLinkState {
  code: string | null;
  status: LinkStatus | "off";
  detail: string | null;
  /** Videostream läuft gerade. */
  streaming: boolean;
}

export const usePhoneLink = create<PhoneLinkState>(() => ({ code: null, status: "off", detail: null, streaming: false }));

let session = 0;
let link: Link | null = null;
let unsub: (() => void) | null = null;
let stateTimer: ReturnType<typeof setTimeout> | null = null;
let lastStateJson = "";
let lastPoseAt = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retries = 0;
let canvas: HTMLCanvasElement | null = null;
let video: { stop: () => void } | null = null;
/**
 * Widerruf in dieser App-Sitzung: gilt auch dann, wenn der Browser das Speichern verweigert hat
 * (sonst könnte eine alte gespeicherte Freigabe beim nächsten Koppeln wieder senden).
 */
let revoked = false;

const POSE_INTERVAL_MS = 66; // ~15 Bilder/s für die Darstellung ohne Video

const videoAllowed = () => !revoked && useApp.getState().settings.tvVideo === "on";

function send(m: PhoneMessage): void {
  link?.send(m);
}

/** Anzeigewerte für den TV aus dem App-Zustand (dieselben wie am Handy). */
export function tvStateFrom(s: AppState): TvState {
  const screen: TvState["screen"] = s.screen === "live" ? "live" : s.screen === "result" ? "result" : "idle";
  const sum = screen === "result" ? summarize(s.session) : null;
  return {
    screen,
    hud: screen === "live" ? hudViewFrom(s) : null,
    viewport: {
      w: Math.round(typeof innerWidth === "number" ? innerWidth : 390),
      h: Math.round(typeof innerHeight === "number" ? innerHeight : 844),
    },
    viewMode: s.viewMode,
    video: usePhoneLink.getState().streaming,
    demo: s.source === "demo",
    summary: sum
      ? {
          reps: sum.reps,
          targetReps: sum.targetReps,
          points: sum.points,
          averageScore: sum.averageScore,
          bestCombo: sum.bestCombo,
          activeSeconds: sum.activeSeconds,
          failedAttempts: sum.failedAttempts,
          scores: s.session.reps.slice(-200).map((r) => r.score.total),
        }
      : null,
    room: s.settings.room,
    avatar: s.settings.avatar,
  };
}

function pushState(force = false): void {
  if (!link || usePhoneLink.getState().status !== "connected") return;
  const json = JSON.stringify(tvStateFrom(useApp.getState()));
  if (!force && json === lastStateJson) return;
  lastStateJson = json;
  link.send({ k: "state", s: JSON.parse(json) } satisfies PhoneMessage);
}

/** Laufenden Videostream vollständig beenden: Anruf schließen UND eigene Capture-Spuren stoppen. */
function stopVideo(): void {
  if (!video) return;
  const v = video;
  video = null;
  v.stop();
  usePhoneLink.setState({ streaming: false });
}

/** Startet oder beendet den Videostream je nach Verbindung, Zustimmung und aktiver Live-Ansicht. */
function syncVideo(): void {
  const want = usePhoneLink.getState().status === "connected" && videoAllowed() && !!canvas && !!link?.call;
  if (want && !video && canvas) {
    let stream: MediaStream | null = null;
    try {
      stream = canvas.captureStream(24);
      const endCall = link!.call!(stream);
      if (endCall) {
        const own = stream;
        video = {
          stop: () => {
            endCall();
            own.getTracks().forEach((t) => t.stop());
          },
        };
        usePhoneLink.setState({ streaming: true });
      } else stream.getTracks().forEach((t) => t.stop());
    } catch {
      // Kein captureStream / Anruf fehlgeschlagen: Training läuft weiter, der TV zeigt die Figur.
      stream?.getTracks().forEach((t) => t.stop());
      video = null;
    }
  } else if (!want) stopVideo();
  pushState(true);
}

/** Vom LiveEngine aufgerufen, sobald das Live-Bild läuft bzw. endet. */
export function attachLiveCanvas(c: HTMLCanvasElement): void {
  canvas = c;
  syncVideo();
}
export function detachLiveCanvas(c: HTMLCanvasElement): void {
  if (canvas !== c) return;
  canvas = null;
  syncVideo();
}

/**
 * Zustimmung zum Mitsenden des Live-Bildes (inkl. Kamerabild) setzen. Ein Widerruf wirkt sofort und für die
 * ganze App-Sitzung – auch wenn das Speichern scheitert. Rückgabe: dauerhaft gespeichert?
 */
export function setTvVideo(choice: "on" | "off"): boolean {
  const saved = actions.updateSettings({ tvVideo: choice });
  // Widerruf nicht speicherbar: gespeicherte Freigabe entfernen (beim nächsten Start wird wieder gefragt)
  if (!saved && choice === "off") forgetSettings();
  // Gespeicherter Widerruf ist maßgeblich; ein NICHT gespeicherter Widerruf wird zusätzlich hier gemerkt.
  revoked = choice === "off" && !saved;
  syncVideo();
  return saved;
}

/** Vom LiveEngine je Bild aufgerufen – sendet höchstens ~15× pro Sekunde, nur wenn verbunden. */
export function sendPoseToTv(lms: Landmark[] | null, aspect: number, mirror: boolean, now: number): void {
  if (!link || usePhoneLink.getState().status !== "connected" || now - lastPoseAt < POSE_INTERVAL_MS) return;
  lastPoseAt = now;
  send({ k: "pose", t: Math.max(0, Math.round(now)), a: aspect, m: mirror ? 1 : 0, p: encodePose(lms) });
}

const REJECT_TEXT: Record<string, string> = {
  busy: "Der Fernseher ist schon mit einem anderen Handy verbunden.",
  declined: "Am Fernseher abgelehnt.",
  closed: "Der Fernseher hat die Verbindung beendet.",
};

/**
 * Mit dem Fernseher koppeln. `rawSecret` stammt aus dem QR-Code (sofortige Kopplung); ohne Schlüssel muss
 * die Kopplung am Fernseher bestätigt werden.
 */
export async function connectToTv(rawCode: string, rawSecret?: string | null, isRetry = false): Promise<boolean> {
  const code = normalizeCode(rawCode);
  if (!code) {
    usePhoneLink.setState({ status: "off", detail: "Ungültiger Code – 6 Zeichen vom Fernseher eingeben." });
    return false;
  }
  const secret = normalizeSecret(rawSecret);
  teardown();
  if (!isRetry) retries = 0;
  const my = ++session;
  usePhoneLink.setState({ code, status: "connecting", detail: null, streaming: false });
  let created: Link;
  try {
    created = await joinLink(
      code,
      {
        onMessage: () => {
          /* TV sendet nur Steuernachrichten (im Transport behandelt) */
        },
        onStatus: (status, detail) => {
          if (my !== session) return; // Rückruf einer beendeten Sitzung
          if (status !== "connected") stopVideo();
          usePhoneLink.setState({
            status,
            detail: status === "rejected" ? (REJECT_TEXT[detail ?? ""] ?? "Kopplung nicht möglich.") : (detail ?? null),
          });
          if (status === "connected") {
            retries = 0;
            if (link) {
              send({ k: "hello", v: PROTOCOL_VERSION, app: VERSION_LABEL.slice(0, 64) });
              syncVideo();
            }
          }
          if ((status === "disconnected" || status === "error") && retries < 5) {
            // Automatisch neu verbinden (z. B. WLAN kurz weg, TV-Seite neu geladen)
            retries++;
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = setTimeout(() => {
              if (my === session) void connectToTv(code, secret, true);
            }, 3000);
          }
        },
      },
      { secret },
    );
  } catch (e) {
    if (my === session) usePhoneLink.setState({ status: "error", detail: String(e) });
    return false;
  }
  if (my !== session) {
    // Während des Aufbaus getrennt oder neu gekoppelt: verspätete Verbindung sofort schließen.
    created.close();
    return false;
  }
  link = created;
  unsub = useApp.subscribe(() => {
    if (stateTimer || my !== session) return;
    stateTimer = setTimeout(() => {
      stateTimer = null;
      if (my === session) pushState();
    }, 100);
  });
  if (usePhoneLink.getState().status === "connected") {
    // Verbindung stand schon während des Aufbaus (lokaler Kanal): Begrüßung jetzt nachholen.
    send({ k: "hello", v: PROTOCOL_VERSION, app: VERSION_LABEL.slice(0, 64) });
    syncVideo();
  }
  return true;
}

/** Alles der aktuellen Sitzung beenden (Video, Timer, Abo, Verbindung). */
function teardown(): void {
  session++;
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  if (stateTimer) clearTimeout(stateTimer);
  stateTimer = null;
  unsub?.();
  unsub = null;
  stopVideo();
  if (link) {
    link.send({ k: "bye" } satisfies PhoneMessage);
    link.close();
  }
  link = null;
  lastStateJson = "";
}

export function disconnectTv(byUser = true): void {
  teardown();
  usePhoneLink.setState({ streaming: false, ...(byUser ? { code: null, status: "off" as const, detail: null } : {}) });
}
