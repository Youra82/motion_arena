import { useState } from "react";
import { ICONS, Icon, MainLayout, trainerPhoto } from "../components/common";
import { actions, useApp } from "../store";
import { EXERCISES, type Exercise } from "../program/catalog";
import { AVATARS, avatarById } from "../render/avatars";

const TARGETS = [5, 10, 15, 20];

const FILTERS: Array<{ id: string; label: string; keep: (e: Exercise) => boolean }> = [
  { id: "alle", label: "Alle", keep: () => true },
  { id: "kamera", label: "Mit Kamera", keep: (e) => e.tracked },
  { id: "knie", label: "Knieschonend", keep: (e) => !e.strain.knee && !e.strain.jump },
  { id: "leise", label: "Leise (Wohnung)", keep: (e) => e.quiet },
  { id: "beine", label: "Beine & Po", keep: (e) => e.area === "Beine" || e.area === "Po" },
  { id: "rumpf", label: "Rumpf", keep: (e) => e.area === "Rumpf" },
  { id: "oben", label: "Oberkörper", keep: (e) => e.area === "Oberkörper" || e.area === "Schultern" },
];

const AREA_ICON: Record<Exercise["area"], string> = {
  Beine: "M9 3v7l-3 11M15 3v7l3 11M9 10h6",
  Po: "M5 12a7 7 0 0 0 14 0M12 5v7",
  Rumpf: "M8 3h8l1 9-1 9H8l-1-9z",
  Oberkörper: "M4 8l8-4 8 4M6 8v6M18 8v6M9 21h6",
  Schultern: "M3 10c3-5 15-5 18 0M7 10v9M17 10v9",
  Ausdauer: "M3 12h4l2-6 4 12 2-6h6",
  Mobilität: "M12 3a9 9 0 1 0 9 9M21 3v6h-6",
};

/** Übungen: Suche, Trainer wählen, Filter, Übungskarten mit Anleitung – plus freie Körperanalyse. */
export function TrainingScreen() {
  const target = useApp((s) => s.targetReps);
  const trainerId = useApp((s) => s.settings.trainer);
  const trainer = avatarById(trainerId);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("alle");
  const [open, setOpen] = useState<string | null>("squat");
  const f = FILTERS.find((x) => x.id === filter)!;
  const query = q.trim().toLowerCase();
  const items = EXERCISES.filter((e) => f.keep(e) && (!query || e.name.toLowerCase().includes(query) || e.area.toLowerCase().includes(query)));

  return (
    <MainLayout className="nx-library">
      <h1 className="page-title">Übungen</h1>
      <div className="nx-search">
        <Icon d={ICONS.search} size={18} />
        <label className="sr-only" htmlFor="ex-search">
          Übung suchen
        </label>
        <input id="ex-search" type="search" placeholder="Suchen, z. B. „Po“ oder „Rumpf“" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <section aria-labelledby="mit-wem">
        <h2 id="mit-wem" className="nx-section-title">
          Mit wem trainierst du?
        </h2>
        <div className="nx-trainer-row" role="radiogroup" aria-label="Trainer">
          {AVATARS.map((a) => (
            <button key={a.id} role="radio" aria-checked={a.id === trainerId} onClick={() => actions.updateSettings({ trainer: a.id })}>
              <span className="nx-trainer-face">
                <img src={trainerPhoto(a.id)} alt="" loading="lazy" />
              </span>
              <small>{a.name}</small>
            </button>
          ))}
        </div>
      </section>

      <div className="nx-filter" role="group" aria-label="Filter">
        {FILTERS.map((x) => (
          <button key={x.id} aria-pressed={x.id === filter} onClick={() => setFilter(x.id)}>
            {x.label}
          </button>
        ))}
      </div>

      <div className="nx-ex-grid">
        {items.length === 0 && <p className="muted">Keine Übung gefunden.</p>}
        {items.map((e) => {
          const isOpen = open === e.id;
          return (
            <article key={e.id} className={`nx-ex ${isOpen ? "open" : ""}`}>
              <button className="nx-ex-head" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : e.id)}>
                <span className="nx-ex-img">
                  {e.tracked ? <img src={trainerPhoto(trainer.id)} alt="" /> : <Icon d={AREA_ICON[e.area]} size={34} />}
                  <span className="nx-ex-area">{e.area}</span>
                  {e.tracked && <span className="nx-ex-tag">KAMERA ZÄHLT</span>}
                </span>
                <span className="nx-ex-title">
                  <b>{e.name}</b>
                  <small>
                    {e.measure === "reps" ? "Wiederholungen" : "auf Zeit"}
                    {e.quiet ? " · leise" : " · mit Sprung"}
                  </small>
                </span>
              </button>
              {isOpen && (
                <div className="nx-ex-body">
                  <ol className="nx-cues">
                    {e.cues.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ol>
                  {e.tracked ? (
                    <>
                      <p className="muted small">Die Kamera zählt Wiederholungen und bewertet Tiefe, Tempo, Gleichmäßigkeit und Haltung (geschätzt).</p>
                      <div className="segmented compact" role="group" aria-label="Anzahl Wiederholungen">
                        {TARGETS.map((t) => (
                          <button key={t} aria-pressed={t === target} onClick={() => actions.setTarget(t)}>
                            {t}
                          </button>
                        ))}
                      </div>
                      <div className="actions">
                        <button className="btn btn-primary" onClick={() => actions.openLive("camera", target)}>
                          ▶ Mit Kamera starten
                        </button>
                        <button className="btn btn-ghost" onClick={() => actions.openLive("demo", target)}>
                          Demo
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="muted small">Geführte Übung mit Anleitung und Timer – die Kamera-Zählung folgt später.</p>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>

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
    </MainLayout>
  );
}
