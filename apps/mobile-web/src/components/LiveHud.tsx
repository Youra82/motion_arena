import { useEffect, useRef, useState } from "react";
import { DEFAULT_SQUAT_OPTIONS } from "@motion-arena/motion-scoring";
import { BodyDiagram } from "./BodyDiagram";
import { ArenaHud } from "./ArenaHud";
import type { HudView } from "./hud-view";

const QUALITY_LABEL: Record<HudView["quality"], [string, string]> = {
  ok: ["Erkennung gut", "var(--success)"],
  "low-confidence": ["Erkennung unsicher", "var(--warning)"],
  partial: ["Teilkörper", "var(--warning)"],
  "no-person": ["Keine Person", "var(--error)"],
};

/**
 * Für Screenreader nur ansagen, was sich mindestens `holdMs` lang nicht geändert hat –
 * das HUD aktualisiert sich bis zu zehnmal pro Sekunde, die Ansage soll das nicht.
 */
function useStableText(text: string, holdMs = 2000): string {
  const [stable, setStable] = useState(text);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStable(text), holdMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [text, holdMs]);
  return stable;
}

export function QualityChip({ view }: { view: HudView }) {
  const q = QUALITY_LABEL[view.quality];
  return (
    <span className="chip" role="status">
      <span className="dot" style={{ background: q[1] }} />
      {q[0]}
    </span>
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

/**
 * Live-Anzeige über dem Kamerabild (Zähler, Tiefe, Analyse, Rückmeldungen, Kalibrierung, Countdown).
 * Wird am Handy UND am Fernseher mit denselben Daten gerendert – deshalb sieht beides gleich aus.
 * Bedienelemente (Knöpfe) liegen außerhalb, nur am Handy.
 */
export function LiveHud({ view, bannerAction, arena = false }: { view: HudView; bannerAction?: React.ReactNode; arena?: boolean }) {
  const depthPct = view.depth === null ? 0 : Math.min(100, Math.max(0, (view.depth / 1.2) * 100));
  const goodPct = (DEFAULT_SQUAT_OPTIONS.goodDepth / 1.2) * 100;
  const countPct = (DEFAULT_SQUAT_OPTIONS.minCountDepth / 1.2) * 100;
  const bl = view.bodyLoad;
  return (
    <>
      {arena && <ArenaHud view={view} />}
      {!arena && view.stage === "training" && (
        <>
          <div className="hud" aria-live="polite">
            <span className="hud-label">Wiederholungen</span>
            <span className="hud-reps">
              {view.reps}
              <small> / {view.targetReps}</small>
            </span>
            <span className="hud-points">{view.points} Punkte</span>
            {view.combo > 1 && <span className="hud-combo">Combo ×{view.combo}</span>}
            {view.lastScore !== null && <span className="muted">Letzte: {view.lastScore}/100 (geschätzt)</span>}
            {view.phaseText && <span className="muted">{view.phaseText}</span>}
          </div>
          <div className="depth" aria-label="Beugetiefe">
            <div className="depth-fill" style={{ height: `${depthPct}%` }} />
            <div className="depth-line" style={{ top: `${goodPct}%` }} title="gute Tiefe" />
            <div className="depth-line" style={{ top: `${countPct}%`, background: "var(--muted)" }} title="zählt ab hier" />
          </div>
          <div className="depth-caption">Tiefe</div>
        </>
      )}

      {view.stage === "analysis" && (
        <>
          <div className="hud analysis-hud">
            <span className="hud-label">Vermutete Bewegung</span>
            <span className="analysis-movement">{bl?.movement.label ?? "…"}</span>
            {bl && bl.movement.id !== "keine-person" && (
              <span className="muted small">{bl.movement.confidence >= 0.6 ? "sicher erkannt" : "unsicher – Haltung kurz halten"}</span>
            )}
            <span className="analysis-intensity">
              Bewegungsintensität: <b>{bl?.intensity.level ?? "unsicher"}</b>
            </span>
          </div>
          <AnalysisAnnouncer text={bl ? `${bl.movement.label}, Intensität ${bl.intensity.level}` : ""} />
          <aside className="analysis-panel" aria-label="Geschätzte Beanspruchung">
            <p className="eyebrow">Geschätzte Beanspruchung</p>
            <BodyDiagram load={bl} />
          </aside>
          <p className="analysis-disclaimer">
            Grobe Schätzung aus Haltung und Bewegung – keine Messung von Muskelkraft, Belastung oder Verletzungsrisiko.
          </p>
        </>
      )}

      {view.feedback && !(arena && view.feedback.tone === "good") && (
        <div key={view.feedback.id} className={`toast ${view.feedback.tone}`} role="status">
          {view.feedback.text}
        </div>
      )}

      {view.bannerText && (
        <div className="banner" role="alert">
          {view.bannerText}
          {view.bannerRecalibrate && bannerAction}
        </div>
      )}

      {view.calib && (
        <div className="calib" role="status">
          <ProgressRing value={view.calib.progress} />
          <div>
            <div className="calib-title">Kalibrierung</div>
            <div className="muted">{view.calib.message}</div>
          </div>
        </div>
      )}

      {view.stage === "countdown" && (
        <div className="overlay" style={{ background: "transparent" }}>
          <div style={{ textAlign: "center" }}>
            <div className="countdown" aria-live="assertive">
              {view.countdown > 0 ? view.countdown : "Los!"}
            </div>
            {view.countdownHold && <div className="chip">Im Bild bleiben – Countdown wartet</div>}
          </div>
        </div>
      )}
    </>
  );
}

/** Unsichtbare, ruhige Ansage der Analyse (nur stabile Wechsel). */
function AnalysisAnnouncer({ text }: { text: string }) {
  const stable = useStableText(text);
  return (
    <p className="sr-only" aria-live="polite">
      {stable}
    </p>
  );
}
