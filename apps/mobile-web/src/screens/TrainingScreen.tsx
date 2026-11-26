import { MainLayout } from "../components/common";
import { actions, useApp } from "../store";

const TARGETS = [5, 10, 15, 20];

/** Workouts: Übungsbibliothek. In Phase 1 ist nur die Kniebeuge mit Bewertung verfügbar. */
export function TrainingScreen() {
  const target = useApp((s) => s.targetReps);
  return (
    <MainLayout className="training">
      <h1 className="page-title">Workouts</h1>

      <section className="card workout-card">
        <div className="row-between">
          <div>
            <p className="eyebrow">Core Studio · Kraft &amp; Stabilität</p>
            <h2>Kniebeugen</h2>
            <p className="muted">Kamera zählt Wiederholungen und bewertet Tiefe, Tempo, Gleichmäßigkeit und Haltung (geschätzt).</p>
          </div>
        </div>
        <p className="eyebrow">Ziel</p>
        <div className="segmented" role="group" aria-label="Anzahl Wiederholungen">
          {TARGETS.map((t) => (
            <button key={t} aria-pressed={t === target} onClick={() => actions.setTarget(t)}>
              {t}
            </button>
          ))}
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => actions.openLive("camera", target)}>
            ▶ Training starten
          </button>
          <button className="btn btn-ghost" onClick={() => actions.openLive("demo", target)}>
            Demo ohne Kamera ansehen
          </button>
        </div>
      </section>

      <section className="card analysis-entry" aria-label="Live-Körperanalyse">
        <div>
          <p className="eyebrow">Live-Körperanalyse</p>
          <p className="muted small">Freie Bewegung ohne Übungsauswahl: erkennt Haltung und Bewegung und zeigt grob, welche Körperzonen vermutlich beansprucht werden (geschätzt).</p>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => actions.openLive("camera", target, "analysis")}>
            Analyse starten
          </button>
          <button className="link-btn" onClick={() => actions.openLive("demo", target, "analysis")}>
            Analyse-Demo ohne Kamera
          </button>
        </div>
      </section>

      <section className="card">
        <p className="eyebrow">So klappt die Erkennung</p>
        <ul className="tips">
          <li>Handy etwa auf Hüfthöhe aufstellen, 2–3 m Abstand.</li>
          <li>Ganzer Körper im Bild – Kopf bis Füße.</li>
          <li>Gutes Licht von vorne, ruhiger Hintergrund hilft.</li>
          <li>Leicht schräg oder seitlich zur Kamera ist am genauesten.</li>
        </ul>
      </section>

      <section className="card muted-card">
        <p className="eyebrow">Weitere Übungen</p>
        <p className="muted">
          Weitere Übungen und Trainingsräume folgen. Für jede neue Übung braucht es eine eigene, getestete Bewertung –
          deshalb erscheinen sie erst, wenn sie zuverlässig zählt.
        </p>
      </section>
    </MainLayout>
  );
}
