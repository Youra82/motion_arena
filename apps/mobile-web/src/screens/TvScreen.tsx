import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import type { Landmark } from "@motion-arena/shared";
import { BrandMark } from "../components/common";
import { LiveHud, QualityChip } from "../components/LiveHud";
import { drawFrame } from "../render/draw";
import { roomById } from "../render/rooms";
import { avatarById } from "../render/avatars";
import { VIEW_MODES, actions, type ViewMode } from "../store";
import { approvePhone, rejectPhone, startTvHost, stopTvHost, useTvHost } from "../tv/tv-host";
import { transportKind } from "../tv/transport";
import { VERSION_LABEL } from "../version";
import { ArenaRenderer, arenaDpr } from "../arena/arena-renderer";
import { ARENA_ROOMS } from "../arena/rooms";
import { hasLiveStage } from "../view-modes";
import { BodyLoadAnalyzer } from "@motion-arena/motion-scoring";

/** Link im QR-Code: Code + geheimer Schlüssel (wer den QR-Code sieht, koppelt ohne Rückfrage). */
function pairUrl(code: string, secret: string | null): string {
  const base = `${location.origin}${import.meta.env.BASE_URL}`;
  const local = transportKind() === "local" ? "&transport=local" : "";
  return `${base}?pair=${code}${secret ? `&k=${secret}` : ""}${local}`;
}

const fmtTime = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, "0")}`;

/** Glättet Posen zwischen den ~15 Aktualisierungen pro Sekunde (nur für die Darstellung ohne Video). */
function lerpPose(prev: Landmark[] | null, next: Landmark[], a: number): Landmark[] {
  if (!prev || prev.length !== next.length) return next;
  return next.map((p, i) => ({ x: prev[i]!.x + (p.x - prev[i]!.x) * a, y: prev[i]!.y + (p.y - prev[i]!.y) * a, z: p.z, visibility: p.visibility }));
}

/** Ohne Kamerabild nicht darstellbare Ansichten fallen auf das Skelett zurück. */
function figureMode(mode: string): ViewMode {
  const m = VIEW_MODES.find((v) => v.id === mode);
  if (!m) return "skelett";
  if (m.id === "echtbild" || m.id === "hybrid" || m.id === "silhouette") return "skelett";
  return m.id;
}

/** Bühnengröße: Handy-Ansicht im gleichen Seitenverhältnis, so groß wie möglich. */
function useStageScale(w: number, h: number): number {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const f = () => setScale(Math.min(innerWidth / w, innerHeight / h));
    f();
    addEventListener("resize", f);
    return () => removeEventListener("resize", f);
  }, [w, h]);
  return scale;
}

/**
 * TV-Modus: zeigt dasselbe wie die Handy-App – das Live-Bild (als Videostream, mit Zustimmung am Handy) und
 * dieselbe Live-Anzeige, im gleichen Seitenverhältnis, nur groß.
 */
export function TvScreen() {
  const host = useTvHost();
  const [qr, setQr] = useState<string | null>(null);
  const approveRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const st = host.state;
  const vw = st?.viewport.w ?? 390;
  const vh = st?.viewport.h ?? 844;
  const scale = useStageScale(vw, vh);
  const showVideo = !!host.stream && !!st?.video;

  useEffect(() => {
    void startTvHost();
    return () => stopTvHost();
  }, []);

  useEffect(() => {
    if (!host.code) return;
    void QRCode.toDataURL(pairUrl(host.code, host.secret), { margin: 1, width: 520, color: { dark: "#101A1D", light: "#F4F2EC" } }).then(setQr);
  }, [host.code, host.secret]);

  // Fokus folgt dem Zustand: Bestätigung → "Annehmen" (Fernbedienung), Verbunden → Hauptbereich
  useEffect(() => {
    if (host.status === "approval") approveRef.current?.focus();
    else if (host.status === "connected") mainRef.current?.focus();
  }, [host.status]);

  useEffect(() => {
    const v = videoRef.current;
    if (v && v.srcObject !== host.stream) v.srcObject = host.stream;
  }, [host.stream, showVideo]);

  // Ersatzdarstellung ohne Video: Figur aus den Gelenkpunkten in der Ansicht des Handys
  useEffect(() => {
    if (showVideo) return;
    let raf = 0;
    let shown: Landmark[] | null = null;
    // Bewegungsspur wie am Handy: alle ~90 ms eine Pose, die letzten 10
    let trail: Landmark[][] = [];
    let lastTrail = 0;
    const arena = new ArenaRenderer();
    const analysis = new BodyLoadAnalyzer();
    let zonePacket = -1;
    let arenaCanvas: HTMLCanvasElement | null = null;
    let arenaTime = 0;
    let arenaTimeReceived = 0;
    const loop = () => {
      const c = canvasRef.current;
      const s = useTvHost.getState();
      if (arenaCanvas && (arenaCanvas !== c || !s.state)) {
        arena.leave(arenaCanvas);
        arenaCanvas = null;
        analysis.reset();
        zonePacket = -1;
      }
      if (c && s.state) {
        arenaCanvas = c;
        const mode = figureMode(s.state.viewMode);
        const k = Math.min(innerWidth / s.state.viewport.w, innerHeight / s.state.viewport.h);
        const width = s.state.viewport.w * k;
        const height = s.state.viewport.h * k;
        const pixelRatio = window.devicePixelRatio || 1;
        const dpr = mode === "arena" ? arenaDpr(width, height, pixelRatio) : Math.min(2, pixelRatio);
        const w = Math.round(width * dpr);
        const h = Math.round(height * dpr);
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
        const fresh = s.pose && performance.now() - s.lastPoseAt < 1500 ? s.pose : null;
        if (mode === "zonen" && s.lastPoseAt > zonePacket && fresh) {
          zonePacket = s.lastPoseAt;
          analysis.update({ t: zonePacket, landmarks: fresh, worldLandmarks: null, aspect: s.aspect });
        } else if ((mode !== "zonen" || !fresh) && zonePacket >= 0) {
          zonePacket = -1;
          analysis.reset();
        }
        shown = fresh ? lerpPose(shown, fresh, 0.5) : null; // weich, aber ohne spürbare Verzögerung
        const now = performance.now();
        if (!shown || mode !== "spur") trail = [];
        else if (now - lastTrail > 90) {
          trail.push(shown);
          if (trail.length > 10) trail.shift();
          lastTrail = now;
        }
        const ctx = c.getContext("2d");
        if (ctx) {
          const v = { cw: w, ch: h, sw: s.aspect * 1000, sh: 1000, mirror: s.mirror, fit: "contain" as const };
          const hud = s.state.hud;
          const received = hud?.arena?.activeMs ?? 0;
          if (received !== arenaTime) {
            arenaTime = received;
            arenaTimeReceived = now;
          }
          const running = hud?.stage === "training" && hud.running;
          const onStage = hasLiveStage(mode, s.state.avatar ?? "lukas");
          const drawn = onStage && arena.draw(ctx, {
            v, room: s.state.arenaRoom ?? ARENA_ROOMS[0].id, studioRoom: roomById(s.state.room), avatar: s.state.avatar, trainer: s.state.trainer, mode,
            pose: shown, mask: null, bodyLoad: hud?.bodyLoad,
            speeds: mode === "zonen" ? analysis.jointSpeeds() : undefined,
            demo: s.state.demo, now, running, precision: hud?.lastScore ?? null,
            activeMs: arenaTime + (running && received > 0 ? Math.min(150, now - arenaTimeReceived) : 0),
          });
          if (!onStage) arena.leave(c);
          if (!drawn) drawFrame({
            ctx,
            v,
            mode: mode === "arena" ? "hologramm" : mode,
            room: s.state.room ? roomById(s.state.room) : null,
            avatar: s.state.avatar ? avatarById(s.state.avatar) : null,
            video: null,
            landmarks: shown,
            mask: null,
            trail: mode === "spur" ? trail : [],
            bodyLoad: s.state.hud?.bodyLoad ?? null,
            ring: { depth: s.state.hud?.depth ?? null, goodDepth: 0.85, repFlashAt: -1e9, now: performance.now() },
          });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      if (arenaCanvas) arena.leave(arenaCanvas);
    };
  }, [showVideo]);

  if (host.status !== "connected") {
    return (
      <main className="tv tv-pair">
        <header className="tv-brand">
          <BrandMark />
          <span>Motion Arena · TV</span>
          <span className="app-version">{VERSION_LABEL}</span>
        </header>
        <section className="tv-pair-body">
          <div className="tv-qr">
            {qr ? (
              <img src={qr} alt="QR-Code zum Koppeln" data-pair-url={host.code ? pairUrl(host.code, host.secret) : undefined} />
            ) : (
              <div className="spinner" />
            )}
          </div>
          <div className="tv-pair-text">
            <h1>Mit dem Handy koppeln</h1>
            <ol>
              <li>Handy-Kamera auf den QR-Code richten und den Link öffnen.</li>
              <li>Motion Arena verbindet sich automatisch mit diesem Bildschirm.</li>
              <li>Der Fernseher zeigt dann dasselbe wie die App.</li>
            </ol>
            <p className="tv-code-label">Oder Code in der App eingeben (Start → Auf dem Fernseher anzeigen):</p>
            <p className="tv-code" aria-label="Kopplungscode">
              {host.code ? `${host.code.slice(0, 3)} ${host.code.slice(3)}` : "…"}
            </p>
            {host.status === "approval" && (
              <div className="tv-approval" role="alertdialog" aria-labelledby="tv-approval-title" aria-describedby="tv-approval-text">
                <b id="tv-approval-title">Ein Handy möchte sich verbinden</b>
                <span id="tv-approval-text">
                  Es hat den Code eingetippt. Nur annehmen, wenn es dein Handy ist – danach zeigt dieser Bildschirm seine
                  Trainingsanzeige.
                </span>
                <div className="tv-actions">
                  <button ref={approveRef} className="btn btn-primary" onClick={() => approvePhone()}>
                    Annehmen
                  </button>
                  <button className="btn btn-ghost" onClick={() => rejectPhone()}>
                    Ablehnen
                  </button>
                </div>
              </div>
            )}
            <p className="tv-status" role="status">
              {host.status === "waiting" && "Bereit – warte auf das Handy …"}
              {host.status === "connecting" && "Verbinde mit dem Vermittlungsdienst …"}
              {host.status === "error" && `Verbindung nicht möglich (${host.detail ?? "Fehler"}).`}
            </p>
            <div className="tv-actions">
              <button className="btn" onClick={() => void startTvHost()}>
                Neuer Code
              </button>
              <button className="btn btn-ghost" onClick={() => actions.home()}>
                TV-Modus beenden
              </button>
            </div>
            <p className="tv-note">
              Zum Finden der Geräte dienen der Vermittlungsdienst 0.peerjs.com und ein STUN-Server von Google (nennt jedem
              Gerät seine Netzadresse); dieser Bildschirm bleibt dafür dort angemeldet, solange er wartet. Körperpunkte,
              Anzeigewerte und – nur mit Erlaubnis am Handy – das Bild gehen danach verschlüsselt direkt vom Handy zu
              diesem Gerät, ohne Umweg über einen Server. Der QR-Code koppelt sofort; ein eingetippter Code muss hier
              bestätigt werden. Unbenutzte Codes werden nach 10 Minuten erneuert.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="tv tv-mirror" ref={mainRef} tabIndex={-1} aria-label="Fernseher – Anzeige des Handys">
      {st?.screen === "live" && st.hud ? (
        <div
          className="tv-stage"
          style={{ width: vw, height: vh, transform: `translate(-50%, -50%) scale(${scale})` }}
          aria-label="Ansicht des Handys"
        >
          <video ref={videoRef} className="tv-video" autoPlay muted playsInline style={{ display: showVideo ? "block" : "none" }} />
          <canvas ref={canvasRef} className="tv-video" aria-hidden="true" style={{ display: showVideo ? "none" : "block" }} />
          <div className={`live live-embedded${st.viewMode === "arena" ? " arena-live" : ""}`}>
            <div className="topbar">
              {st.demo && <span className="chip chip-demo">DEMO</span>}
              <div className="spacer" />
              {st.hud.engineRunning && <QualityChip view={st.hud} />}
            </div>
            <LiveHud view={st.hud} arena={st.viewMode === "arena"} />
            {!showVideo && (
              <p className="tv-hint">
                Darstellung aus Gelenkpunkten{st.video ? " – Bild wird verbunden …" : " – Kamerabild am Handy nicht freigegeben"}
                {!st.video && ["echtbild", "hybrid", "silhouette"].includes(st.viewMode) ? " (Kamera-Ansicht hier als Skelett)" : ""}
              </p>
            )}
          </div>
        </div>
      ) : st?.screen === "result" && st.summary ? (
        <div className="tv-result">
          <p className="eyebrow">Ergebnis · Kniebeugen{st.demo ? " · DEMO" : ""}</p>
          <h1>{st.summary.reps >= st.summary.targetReps ? "Ziel erreicht" : "Training beendet"}</h1>
          <div className="tv-result-grid">
            <div>
              <b>
                {st.summary.reps}/{st.summary.targetReps}
              </b>
              <span>Wiederholungen</span>
            </div>
            <div>
              <b>{st.summary.points}</b>
              <span>Punkte</span>
            </div>
            <div>
              <b>{st.summary.averageScore ?? "–"}</b>
              <span>Ø Bewertung (geschätzt)</span>
            </div>
            <div>
              <b>{st.summary.bestCombo ? `×${st.summary.bestCombo}` : "–"}</b>
              <span>Beste Combo</span>
            </div>
            {st.summary.activeSeconds !== undefined && (
              <div>
                <b>{fmtTime(st.summary.activeSeconds)}</b>
                <span>Aktive Zeit</span>
              </div>
            )}
            {st.summary.failedAttempts !== undefined && (
              <div>
                <b>{st.summary.failedAttempts}</b>
                <span>Nicht gezählt</span>
              </div>
            )}
          </div>
          {!!st.summary.scores?.length && (
            <p className="tv-scores" aria-label="Einzelwertungen">
              {st.summary.scores.map((x, i) => (
                <span key={i} className={x >= 70 ? "good" : "warn"}>
                  {x}
                </span>
              ))}
            </p>
          )}
        </div>
      ) : (
        <div className="tv-center-msg" role="status">
          <BrandMark />
          <b>Handy verbunden</b>
          <span>Starte auf dem Handy ein Training oder die Körperanalyse – hier erscheint dasselbe Bild.</span>
        </div>
      )}
      <button className="tv-exit" onClick={() => actions.home()}>
        TV-Modus beenden
      </button>
    </main>
  );
}
