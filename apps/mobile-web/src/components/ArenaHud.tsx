import type { HudView } from "./hud-view";
import { arenaChecks, CHECK_KEYS, GUIDE_CYCLE_MS } from "../arena/metrics";
import "./arena-hud.css";

const CHECK_TEXT = {
  posture: ["Rücken gerade", "Oberkörper aufrechter", "Abgeleitet aus der Vorneigung des Oberkörpers"],
  symmetry: ["Knie stabil", "Knie gleichmäßiger beugen", "Abgeleitet aus der Links-Rechts-Symmetrie der Kniewinkel"],
  depth: ["Tiefe gut", "Tiefer beugen", "Abgeleitet aus der Beugetiefe"],
} as const;
const formatKcal = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });

function time(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function ArenaHud({ view }: { view: HudView }) {
  const arena = view.arena;
  const active = arena?.activeMs ?? 0;
  const guide = view.targetReps * GUIDE_CYCLE_MS;
  const checks = arena?.checks ?? arenaChecks(undefined);
  const progress = Math.min(1, view.reps / Math.max(1, view.targetReps));
  const remaining = Math.max(0, view.targetReps - view.reps);
  const positive = !view.bannerText && view.feedback?.tone === "good";
  return (
    <>
      <div className="arena-exercise arena-panel">
        <svg viewBox="0 0 40 40" width="36" height="36" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="19" cy="9" r="4" />
          <path d="m17 16-4 10 13-2 2 10h6M13 26l-6 7m13-16 5 4 6-4" />
        </svg>
        <div><b>Kniebeugen</b><span>Ganzkörper</span></div>
      </div>
      <div className="arena-brand" aria-label="Motion Arena · Kinetic Studio">
        <b>Motion Arena</b><span>Kinetic Studio</span>
      </div>
      {view.stage === "training" && (
        <>
          <div className="arena-stats arena-panel">
            <div className="arena-rep-ring" aria-live="polite">
              <svg viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="55" className="arena-ring-track" />
                <circle cx="60" cy="60" r="55" pathLength="100" strokeDasharray={`${progress * 100} 100`} className="arena-ring-fill" />
              </svg>
              <span className="hud-reps">{view.reps}<small> / {view.targetReps}</small></span>
              <span className="hud-label">Wiederholungen</span>
            </div>
            <div className="arena-stat-line"><span aria-hidden="true">★</span><b className="hud-points">{view.points} <small>Punkte</small></b></div>
            <div className="arena-stat-line" title="Referenzschätzung für 70 kg, aus der Dauer gezählter Wiederholungen">
              <span aria-hidden="true">♨</span><b>{formatKcal.format(arena?.kcal ?? 0)} <small>kcal geschätzt</small></b>
            </div>
            {view.combo > 1 && <span className="hud-combo">Combo ×{view.combo}</span>}
          </div>
          <div className="arena-timer arena-panel">
            <b>{time(active)} / {time(guide)}</b>
            <span>Aktive Zeit / Richtzeit</span>
            <progress aria-label="Aktive Zeit im Verhältnis zur Richtzeit" max={Math.max(1, guide)} value={Math.min(guide, active)} />
          </div>
          <aside className="arena-checks" aria-label="Haltungs-Checks der letzten Wiederholung">
            <p>Letzte Wiederholung · geschätzt</p>
            {CHECK_KEYS.map((key) => {
              const [good, improve, explanation] = CHECK_TEXT[key];
              const state = checks[key];
              return (
                <div key={key} className={`arena-panel arena-check ${state}`} title={explanation}>
                  <span aria-hidden="true">{state === "good" ? "✓" : state === "improve" ? "↗" : "–"}</span>
                  {state === "good" ? good : state === "improve" ? improve : `${key === "depth" ? "Tiefe" : key === "posture" ? "Haltung" : "Symmetrie"} offen`}
                </div>
              );
            })}
          </aside>
          <div className="arena-precision" aria-label={view.lastScore === null ? "Präzision noch offen" : `Präzision ${view.lastScore} Prozent, geschätzt`}>
            <b>{view.lastScore === null ? "–" : `${view.lastScore} %`}</b><span>Präzision</span>
          </div>
          {positive && (
            <div className="arena-feedback arena-panel" role="status" key={view.feedback?.id}>
              <span aria-hidden="true">✓</span>
              <b>{remaining === 0 ? "Ziel erreicht!" : (view.lastScore ?? 0) >= 85 ? "Sehr gut!" : "Gezählt!"}</b>
              {remaining > 0 && <span>{(view.lastScore ?? 0) >= 85 ? "Saubere Bewegung. " : ""}Noch {remaining} {remaining === 1 ? "Wiederholung" : "Wiederholungen"}.</span>}
            </div>
          )}
        </>
      )}
    </>
  );
}
