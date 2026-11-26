import { useEffect, useRef } from "react";
import { LiveEngine } from "../engine/LiveEngine";
import { VIEW_MODES, actions, useApp } from "../store";
import { LiveHud, QualityChip } from "../components/LiveHud";
import { hudViewFrom } from "../components/hud-view";
import { TvVideoConsent } from "../components/TvLink";
import { StagePicker } from "../components/StagePicker";
import { usePhoneLink } from "../tv/phone-link";
import { arenaDpr } from "../arena/arena-renderer";
import { hasLiveStage } from "../view-modes";

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
  const liveMode = useApp((s) => s.liveMode);
  const avatar = useApp((s) => s.settings.avatar);
  const arena = viewMode === "arena" && liveMode === "squat";

  useEffect(() => {
    const canvas = canvasRef.current!;
    const resize = () => {
      const { clientWidth, clientHeight } = canvas;
      const pixelRatio = window.devicePixelRatio || 1;
      const current = useApp.getState();
      const dpr = hasLiveStage(current.viewMode, current.settings.avatar)
        ? arenaDpr(clientWidth, clientHeight, pixelRatio)
        : Math.min(2, pixelRatio);
      const w = Math.round(clientWidth * dpr);
      const h = Math.round(clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const unsubscribe = useApp.subscribe((s, prev) => {
      if (s.viewMode !== prev.viewMode) resize();
    });
    const engine = new LiveEngine(canvas, videoRef.current!, source);
    engineRef.current = engine;
    void engine.start();
    return () => {
      ro.disconnect();
      unsubscribe();
      engine.stop();
      engineRef.current = null;
    };
  }, [source, runId]);

  const now = () => performance.now();
  const running = session.status === "running";
  const paused = session.status === "paused";
  const appState = useApp();
  const view = hudViewFrom(appState);

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

  const tvLinked = usePhoneLink((s) => s.status === "connected");
  const tvStreaming = usePhoneLink((s) => s.streaming);

  return (
    <div className={`live${arena ? " arena-live" : ""}`}>
      <video ref={videoRef} playsInline muted />
      <canvas ref={canvasRef} aria-label="Live-Ansicht mit Körpererkennung" />

      <h1 className="sr-only">{liveMode === "analysis" ? "Live-Körperanalyse" : "Live-Training Kniebeugen"}</h1>
      <div className="topbar">
        <button className="icon-btn" aria-label={liveMode === "analysis" ? "Analyse beenden" : "Training beenden"} onClick={() => actions.finish(now())}>
          ✕
        </button>
        {source === "demo" && <span className="chip chip-demo" title="Synthetische Bewegungsdaten, keine Kamera">DEMO</span>}
        {tvLinked && (
          <span className="chip chip-tv" role="status" title="Live-Anzeige wird an den gekoppelten Fernseher gesendet">
            📺 {tvStreaming ? "TV: Bild" : "TV: Figur"}
          </span>
        )}
        <div className="spacer" />
        {engineStatus === "running" && <QualityChip view={view} />}
        {engineStatus === "running" && <span className="chip muted" title="Bilder pro Sekunde der Körpererkennung">{hud.fps} fps</span>}
      </div>

      {hasLiveStage(viewMode, avatar) && <StagePicker />}

      <div className="live-consent">
        <TvVideoConsent />
      </div>

      <LiveHud
        view={view}
        arena={arena}
        bannerAction={
          <button className="btn btn-ghost" style={{ marginTop: 8, minHeight: 40 }} onClick={() => actions.recalibrate(now())}>
            Neu kalibrieren
          </button>
        }
      />

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
          {VIEW_MODES.filter((m) => liveMode === "squat" || m.id !== "arena").map((m) => {
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
          {(stage === "calibrating" || stage === "countdown") && calibration === null && (
            <span className="muted" style={{ alignSelf: "center", flex: 1, fontSize: 13 }}>
              Aufrecht und ruhig stehen – der ganze Körper muss sichtbar sein.
            </span>
          )}
          {stage === "analysis" && (
            <button className="btn" onClick={() => actions.finish(now())}>
              Analyse beenden
            </button>
          )}
          <button
            className="btn btn-ghost"
            onClick={toggleRecording}
            aria-pressed={recording}
            title="Zeichnet nur Körperpunkte mit Zeitstempel auf (kein Kamerabild) und lädt sie beim Stoppen als JSON-Datei auf dieses Gerät herunter."
          >
            {recording ? `■ Aufnahme stoppen & speichern (${recordedFrames})` : "● Posen aufnehmen"}
          </button>
          {recording && (
            <p className="small muted rec-note">Nur Körperpunkte, kein Kamerabild – Download als Datei beim Stoppen.</p>
          )}
        </div>
      </div>
    </div>
  );
}

