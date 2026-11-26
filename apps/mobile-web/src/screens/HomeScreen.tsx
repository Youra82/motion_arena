import { challenge30, movementSummary, progressStats } from "@motion-arena/motion-scoring";
import { BrandHeader, HeroFigure, MainLayout, Ring } from "../components/common";
import { actions, useApp } from "../store";
import { InstallCard } from "./InstallCard";
import { TvLinkCard, TvVideoConsent } from "../components/TvLink";

const TARGETS = [5, 10, 15, 20];

function TileIcon({ d }: { d: string }) {
  return (
    <svg className="tile-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Startseite (Hauptmenü) im Kinetic-Studio-Stil – zeigt nur echte, gespeicherte Daten. */
export function HomeScreen() {
  const target = useApp((s) => s.targetReps);
  const history = useApp((s) => s.history);
  const now = new Date();
  const stats = progressStats(history, now);
  const challenge = challenge30(history, now);
  const last = stats.last;
  const summary = movementSummary(last);
  const minutes = Math.max(1, Math.round((target * 3.2 + 15) / 60));

  return (
    <MainLayout className="home">
      <BrandHeader />
      <InstallCard />
      <TvVideoConsent />

      <section className="hero-card">
        <HeroFigure />
        <div className="hero-content">
          <p className="eyebrow">Dein nächstes Training</p>
          <h1>Kniebeugen</h1>
          <div className="hero-meta">
            <span>⏱ ca. {minutes} Min</span>
            <span>Core Studio</span>
          </div>
        </div>
        <div className="hero-actions">
          <div className="segmented compact" role="group" aria-label="Anzahl Wiederholungen">
            {TARGETS.map((t) => (
              <button key={t} aria-pressed={t === target} onClick={() => actions.setTarget(t)}>
                {t}
              </button>
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => actions.openLive("camera", target)}>
            ▶ Training starten
          </button>
          <button className="link-btn" onClick={() => actions.openLive("demo", target)}>
            Demo ohne Kamera ansehen
          </button>
        </div>
      </section>

      <section className="card precision-card" aria-label="Bewegungspräzision">
        <p className="eyebrow precision-title">Bewegungspräzision</p>
        <div className="precision-ring">
          <Ring size={104} value={last?.averageScore != null ? last.averageScore / 100 : null} label="Geschätzte Trainingsbewertung des letzten Trainings" />
          <span className="muted tiny">{last ? "letztes Training · geschätzt" : "noch keine Daten"}</span>
        </div>
        <div className="precision-text">
          <b>Deine Bewegung</b>
          {summary.length ? (
            <ul className="quality-list">
              {summary.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          ) : (
            <span className="muted">Starte dein erstes Training – danach siehst du hier, wie sauber du dich bewegst.</span>
          )}
          {last && (
            <span className="muted small">
              {last.reps} Wiederholungen · {last.points} Punkte
            </span>
          )}
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

      <TvLinkCard />

      <nav className="tiles" aria-label="Bereiche">
        <button className="tile" onClick={() => actions.navigate("training")}>
          <TileIcon d="M2 12h3M19 12h3M5 8v8M19 8v8M8 6v12M16 6v12M8 12h8" />Workouts
        </button>
        <button className="tile" onClick={() => actions.navigate("progress")}>
          <TileIcon d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" />Trainingsplan
        </button>
        <button className="tile" onClick={() => actions.navigate("progress")}>
          <TileIcon d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M12 14v4M8 21h8M9 18h6" />Challenges
        </button>
        <button className="tile" onClick={() => actions.navigate("studio")}>
          <TileIcon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21a7 7 0 0 1 14 0M3 21h18" />Avatar &amp; Raum
        </button>
      </nav>

      <section className="card challenge-card" aria-label="Aktive Challenge">
        <div className="row-between">
          <p className="eyebrow">Aktive Challenge</p>
          <button className="link-btn small" onClick={() => actions.navigate("progress")}>
            Mehr anzeigen ›
          </button>
        </div>
        <h2>{challenge.title}</h2>
        <p className="muted">
          An {challenge.goalDays} von {challenge.length} Tagen trainieren
        </p>
        <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(challenge.progress * 100)}>
          <div className="bar-fill" style={{ width: `${challenge.progress * 100}%` }} />
        </div>
        <div className="row-between small">
          <span>{challenge.day ? `Tag ${challenge.day} von ${challenge.length}` : "Startet mit deinem ersten Training"}</span>
          <span>
            {challenge.trainedDays}/{challenge.goalDays} Tage
          </span>
        </div>
      </section>

      <p className="privacy">
        <span aria-hidden="true">🔒</span>
        <span>
          Kamerabild und Trainingsverlauf bleiben auf diesem Gerät – außer du koppelst einen Fernseher, dann geht die
          Live-Anzeige direkt an ihn. Bewertungen sind Schätzungen aus dem Kamerabild – keine medizinische Beurteilung.
        </span>
      </p>
    </MainLayout>
  );
}
