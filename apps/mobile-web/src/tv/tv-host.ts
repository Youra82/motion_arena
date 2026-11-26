import { create } from "zustand";
import type { Landmark } from "@motion-arena/shared";
import { PROTOCOL_VERSION, decodePose, isPhoneMessage, newPairCode, newPairSecret, type TvState } from "./protocol";
import { hostLink, type Link, type LinkStatus } from "./transport";

/** TV-Seite: nimmt Gelenkpunkte und Anzeigewerte vom Handy entgegen. */
export interface TvHostState {
  code: string | null;
  /** Geheimer Schlüssel für den QR-Code (sofortige Kopplung ohne Bestätigung). */
  secret: string | null;
  status: LinkStatus | "off";
  detail: string | null;
  state: TvState | null;
  pose: Landmark[] | null;
  aspect: number;
  mirror: boolean;
  lastPoseAt: number;
  /** Zeitstempel der zuletzt übernommenen Pose (Handy-Uhr) – ältere Bilder werden verworfen. */
  poseT: number;
  /** Live-Bild vom Handy (nur mit Zustimmung am Handy). */
  stream: MediaStream | null;
  phoneApp: string | null;
}

export const useTvHost = create<TvHostState>(() => ({
  code: null,
  secret: null,
  status: "off",
  detail: null,
  state: null,
  pose: null,
  aspect: 9 / 16,
  mirror: true,
  lastPoseAt: 0,
  poseT: -1,
  stream: null,
  phoneApp: null,
}));

let link: Link | null = null;
let session = 0;
let expiry: ReturnType<typeof setTimeout> | null = null;
/** Unbenutzter Code wird nach 10 Minuten erneuert (begrenzt das Erraten des Kurzcodes). */
const CODE_TTL_MS = 10 * 60_000;
/** Verbindungsaufbau zum Vermittlungsdienst: danach Fehler anzeigen. */
const CONNECT_TIMEOUT_MS = 30_000;
/** Offene Bestätigung am Fernseher: danach automatisch ablehnen. */
const APPROVAL_TIMEOUT_MS = 2 * 60_000;
let phaseTimer: ReturnType<typeof setTimeout> | null = null;

/** Frist für den aktuellen Zustand (Aufbau bzw. offene Bestätigung). */
function armPhase(my: number, status: string): void {
  if (phaseTimer) clearTimeout(phaseTimer);
  phaseTimer = null;
  if (status === "connecting")
    phaseTimer = setTimeout(() => {
      if (my === session && useTvHost.getState().status === "connecting")
        useTvHost.setState({ status: "error", detail: "Zeitüberschreitung beim Verbindungsaufbau" });
    }, CONNECT_TIMEOUT_MS);
  if (status === "approval")
    phaseTimer = setTimeout(() => {
      if (my === session && useTvHost.getState().status === "approval") rejectPhone();
    }, APPROVAL_TIMEOUT_MS);
}

const cleared = { state: null, pose: null, stream: null, poseT: -1, phoneApp: null } as const;

function armExpiry(my: number): void {
  if (expiry) clearTimeout(expiry);
  expiry = setTimeout(() => {
    const st = useTvHost.getState().status;
    if (my === session && (st === "waiting" || st === "error")) void startTvHost();
  }, CODE_TTL_MS);
}

export async function startTvHost(code = newPairCode(), secret = newPairSecret()): Promise<void> {
  stopTvHost();
  const my = ++session;
  useTvHost.setState({ code, secret, status: "connecting", detail: null, ...cleared });
  armExpiry(my);
  armPhase(my, "connecting");
  let created: Link;
  try {
    created = await hostLink(
    code,
    {
      onStatus: (status, detail) => {
        if (my !== session) return;
        useTvHost.setState({ status, detail: detail ?? null });
        armPhase(my, status);
        if (status === "connected") {
          if (expiry) clearTimeout(expiry);
          link?.send({ k: "hello-tv", v: PROTOCOL_VERSION });
        }
        if (status === "waiting") {
          useTvHost.setState(cleared);
          armExpiry(my);
        }
      },
      onStream: (stream) => {
        if (my === session) useTvHost.setState({ stream });
      },
      onMessage: (m) => {
        if (my !== session || !isPhoneMessage(m)) return; // fremde/kaputte Nachrichten verwerfen
        switch (m.k) {
          case "hello":
            useTvHost.setState({ phoneApp: m.app });
            break;
          case "pose":
            if (m.t < useTvHost.getState().poseT) break; // älteres Bild (Reihenfolge vertauscht)
            useTvHost.setState({ pose: decodePose(m.p), aspect: m.a, mirror: m.m === 1, lastPoseAt: performance.now(), poseT: m.t });
            break;
          case "state":
            useTvHost.setState({ state: m.s });
            break;
          case "bye":
            useTvHost.setState(cleared);
            break;
        }
      },
    },
    { secret },
    );
  } catch (e) {
    // Aufbau gescheitert (z. B. Modul nicht ladbar): Fehler zeigen, "Neuer Code" startet neu.
    if (my === session) {
      if (phaseTimer) clearTimeout(phaseTimer);
      useTvHost.setState({ status: "error", detail: e instanceof Error ? e.message : String(e) });
    }
    return;
  }
  if (my !== session) {
    created.close(); // während des Aufbaus ersetzt oder beendet
    return;
  }
  link = created;
}

/** Wartende Kopplung (nur Code eingegeben) am Fernseher annehmen oder ablehnen. */
export function approvePhone(): void {
  link?.approve?.();
}
export function rejectPhone(): void {
  link?.reject?.();
}

export function stopTvHost(): void {
  session++;
  if (expiry) clearTimeout(expiry);
  expiry = null;
  if (phaseTimer) clearTimeout(phaseTimer);
  phaseTimer = null;
  link?.close();
  link = null;
  useTvHost.setState({ status: "off", ...cleared });
}
