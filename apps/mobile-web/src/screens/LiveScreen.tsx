import { useEffect, useRef } from "react";
import { DEFAULT_SQUAT_OPTIONS } from "@motion-arena/motion-scoring";
import type { TrackingQuality } from "@motion-arena/shared";
import { LiveEngine } from "../engine/LiveEngine";
import { VIEW_MODES, actions, useApp } from "../store";

const QUALITY_LABEL: Record<TrackingQuality["status"], [string, string]> = {
  ok: ["Erkennung gut", "var(--success)"],
  "low-confidence": ["Erkennung unsicher", "var(--warning)"],
  partial: ["Teilkörper", "var(--warning)"],
  "no-person": ["Keine Person", "var(--error)"],
};

const PHASE_LABEL = { standing: "Bereit", descending: "Runter", ascending: "Hoch", uncertain: "Unsicher" } as const;

function qualityHint(q: TrackingQuality): string {
  if (q.status === "no-person") return "Keine Person erkannt – stell dich ins Bild. Es wird nichts gewertet.";
  if (q.status === "partial") return `Nicht sichtbar: ${q.missing.join(", ")} – keine Wertung, bis alles im Bild ist.`;
  return "Erkennung unsicher – mehr Licht oder etwas Abstand. Keine Wertung.";
}

export function LiveScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<LiveEngine | null>(null);

  const source = useApp((s) => s.source);
  const runId = useApp((s) => s.runId);
  const engineStatus = useApp((s) => s.engineStatus);
  const error = useApp((s) => s.error);
  const stage = useApp((s) => s.stage);
  const countdown = useApp((s) => s.countdown);
  const calib = useApp((s) => s.calibrationProgress);
  const calibration = useApp((s) => s.calibration);
  const hud = useApp((s) => s.hud);
  const session = useApp((s) => s.session);
  const viewMode = useApp((s) => s.viewMode);
  const feedback = useApp((s) => s.feedback);
  const recording = useApp((s) => s.recording);
  const recordedFrames = useApp((s) => s.recordedFrames);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const engine = new LiveEngine(canvas, videoRef.current!, source);
    engineRef.current = engine;
    void engine.start();
    return () => {
      ro.disconnect();
      engine.stop();
      engineRef.current = null;
    };
  }, [source, runId]);

  const now = () => performance.now();
  const running = session.status === "running";
  const paused = session.status === "paused";
  const q = QUALITY_LABEL[hud.quality.status];
  const depthPct = hud.depth === null ? 0 : Math.min(100, Math.max(0, (hud.depth / 1.2) * 100));
  const goodPct = (DEFAULT_SQUAT_OPTIONS.goodDepth / 1.2) * 100;
  const countPct = (DEFAULT_SQUAT_OPTIONS.minCountDepth / 1.2) * 100;
  const lastRep = session.reps[session.reps.length - 1];

  const toggleRecording = () => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.recorder.active) {
      eng.exportRecording();
    } else {
      eng.recorder.start();
      useApp.setState({ recording: true, recordedFrames: 0 });
    }
  };

  return (
    <div className="live">
      <video ref={videoRef} playsInline muted />
      <canvas ref={canvasRef} aria-label="Live-Ansicht mit Körpererkennung" />

      <div className="topbar">
        <button className="icon-btn" aria-label="Training beenden" onClick={() => actions.finish(now())}>
          ✕
        </button>
        {source === "demo" && <span className="chip chip-demo" title="Synthetische Bewegungsdaten, keine Kamera">DEMO</span>}
        <div className="spacer" />
        {engineStatus === "running" && (
          <span className="chip" role="status">
            <span className="dot" style={{ background: q[1] }} />
            {q[0]}
          </span>
        )}
        {engineStatus === "running" && <span className="chip muted">{hud.fps} fps</span>}
      </div>

      {stage === "training" && (
        <>
          <div className="hud" aria-live="polite">
            <span className="hud-label">Wiederholungen</span>
            <span className="hud-reps">
              {session.reps.length}
              <small> / {session.targetReps}</small>
            </span>
            <span className="hud-points">{session.points} Punkte</span>
            {session.combo > 1 && <span className="hud-combo">Combo ×{session.combo}</span>}
            {lastRep && <span className="muted">Letzte: {lastRep.score.total}/100 (geschätzt)</span>}
            {hud.phase && (
              <span className="muted">
                {hud.phase === "standing" && !hud.armed ? "Aufrecht hinstellen" : PHASE_LABEL[hud.phase]}
              </span>
            )}
          </div>
          <div className="depth" aria-label="Beugetiefe">
            <div className="depth-fill" style={{ height: `${depthPct}%` }} />
            <div className="depth-line" style={{ top: `${goodPct}%` }} title="gute Tiefe" />
            <div className="depth-line" style={{ top: `${countPct}%`, background: "var(--muted)" }} title="zählt ab hier" />
          </div>
          <div className="depth-caption">Tiefe</div>
        </>
      )}

      {feedback && (
        <div key={feedback.id} className={`toast ${feedback.tone}`} role="status">
          {feedback.text}
        </div>
      )}

      {stage === "training" && running && (hud.quality.status !== "ok" || hud.issue) && (
        <div className="banner" role="alert">
          {hud.quality.status !== "ok"
            ? qualityHint(hud.quality)
            : `Keine Wertung: ${hud.issue!.join(", ")}. Zurück in die Ausgangsposition und aufrecht hinstellen.`}
          {hud.issue?.includes("Blickwinkel geändert") && (
            <button className="btn btn-ghost" style={{ marginTop: 8, minHeight: 40 }} onClick={() => actions.recalibrate(now())}>
              Neu kalibrieren
            </button>
          )}
        </div>
      )}

      {stage === "calibrating" && engineStatus === "running" && (
        <div className="calib" role="status">
          <ProgressRing value={calib?.progress ?? 0} />
          <div>
            <div className="calib-title">Kalibrierung</div>
            <div className="muted">{calib?.message ?? "Stell dich vor die Kamera."}</div>
          </div>
        </div>
      )}

      {stage === "countdown" && (
        <div className="overlay" style={{ background: "transparent" }}>
          <div style={{ textAlign: "center" }}>
            <div className="countdown" aria-live="assertive">
              {countdown > 0 ? countdown : "Los!"}
            </div>
            {hud.quality.status !== "ok" && <div className="chip">Im Bild bleiben – Countdown wartet</div>}
          </div>
        </div>
      )}

      {(engineStatus === "requesting-camera" || engineStatus === "loading-model") && (
        <div className="overlay">
          <div className="panel" role="status">
            <div className="spinner" />
            <h2>{engineStatus === "requesting-camera" ? "Kamera wird gestartet" : "Körpererkennung wird geladen"}</h2>
            <p>{engineStatus === "requesting-camera" ? "Bitte den Kamerazugriff erlauben." : "Einmalig einige Sekunden."}</p>
            <button className="btn btn-ghost" onClick={() => actions.home()}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {engineStatus === "error" && error && (
        <div className="overlay">
          <div className="panel" role="alert">
            <h2>{error.kind === "camera-denied" ? "Kein Kamerazugriff" : "Start nicht möglich"}</h2>
            <p>{error.message}</p>
            {error.kind === "camera-denied" && (
              <p>In den Browser-Einstellungen die Kamera für diese Seite erlauben und neu laden.</p>
            )}
            <button className="btn btn-primary" onClick={() => actions.openLive(source, session.targetReps)}>
              Erneut versuchen
            </button>
            <button className="btn" onClick={() => actions.openLive("demo", session.targetReps)}>
              Demo ohne Kamera
            </button>
            <button className="btn btn-ghost" onClick={() => actions.home()}>
              Zurück
            </button>
          </div>
        </div>
      )}

      {paused && stage === "training" && (
        <div className="overlay">
          <div className="panel">
            <h2>Pausiert</h2>
            <p>
              {session.reps.length} von {session.targetReps} Wiederholungen · {session.points} Punkte
            </p>
            <button className="btn btn-primary" onClick={() => actions.resume(now())}>
              Fortsetzen
            </button>
            <button className="btn" onClick={() => actions.recalibrate(now())}>
              Neu kalibrieren
            </button>
            <button className="btn btn-ghost" onClick={() => actions.finish(now())}>
              Training beenden
            </button>
          </div>
        </div>
      )}

      <div className="bottombar">
        <div className="modes" role="group" aria-label="Darstellung">
          {VIEW_MODES.map((m) => {
            const unavailable = m.needsCamera && source === "demo";
            return (
              <button
                key={m.id}
                aria-pressed={viewMode === m.id}
                disabled={unavailable}
                title={unavailable ? "Im Demo-Modus nicht verfügbar" : m.note}
                onClick={() => actions.setViewMode(m.id)}
              >
                {m.label}
                {m.id === "avatar" ? " (Platzhalter)" : ""}
              </button>
            );
          })}
        </div>
        <div className="controls">
          {stage === "training" && running && (
            <button className="btn" onClick={() => actions.pause(now())}>
              ❚❚ Pause
            </button>
          )}
          {stage !== "training" && calibration === null && (
            <span className="muted" style={{ alignSelf: "center", flex: 1, fontSize: 13 }}>
              Aufrecht und ruhig stehen – der ganze Körper muss sichtbar sein.
            </span>
          )}
          <button className="btn btn-ghost" onClick={toggleRecording} aria-pressed={recording}>
            {recording ? `■ Aufnahme (${recordedFrames})` : "● Posen aufnehmen"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProgressRing({ value }: { value: number }) {
  const r = 20;
  const c = 2 * Math.PI * r;
  return (
    <svg width="52" height="52" viewBox="0 0 52 52" aria-label={`${Math.round(value * 100)} %`}>
      <circle cx="26" cy="26" r={r} fill="none" stroke="var(--surface-raised)" strokeWidth="5" />
      <circle
        cx="26"
        cy="26"
        r={r}
        fill="none"
        stroke="var(--motion)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - value)}
        transform="rotate(-90 26 26)"
      />
    </svg>
  );
}
