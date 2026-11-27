import { ICONS, Icon, MainLayout, trainerPhoto } from "../components/common";
import { actions, useApp } from "../store";
import { createPlan, sessionAt, type Answers } from "../program/planner";
import { programView } from "../program/view";
import { useStage } from "./HomeScreen";

/** Fertige Programme – gleiche Planer-Logik, nur mit vorgegebenen Antworten. */
export const PRESETS: Array<{ id: string; name: string; trainer: string; text: string; answers: Answers }> = [
  { id: "kraft-start", name: "Kraft-Start", trainer: "david", text: "Ganzkörper für Einsteiger",
    answers: { goal: "kraft", level: "neu", days: 3, minutes: 20, focus: ["ganzkoerper"], pain: "keine" } },
  { id: "ruecken", name: "Rücken entlasten", trainer: "aiko", text: "Rumpf stärken, Rücken schonen",
    answers: { goal: "beweglich", level: "neu", days: 4, minutes: 10, focus: ["rumpf"], pain: "ruecken" } },
  { id: "beine-po", name: "Beine & Po", trainer: "sara", text: "Kniebeugen mit Kamera-Zählung",
    answers: { goal: "kraft", level: "manchmal", days: 3, minutes: 30, focus: ["beine"], pain: "keine" } },
  { id: "puls", name: "Puls & Power", trainer: "finn", text: "Kurz, schweißtreibend",
    answers: { goal: "ausdauer", level: "manchmal", days: 4, minutes: 20, focus: ["ganzkoerper"], pain: "keine" } },
];

/** Programme: drei Wege zu einem Plan – für mich planen lassen, selbst bauen, fertig wählen. */
export function ProgramsScreen() {
  const program = useApp((s) => s.program);
  const { trainer, backdrop } = useStage();
  const view = program ? programView(program) : null;
  return (
    <MainLayout className="nx-programs">
      <header>
        <h1 className="page-title">Programme</h1>
        <p className="muted">Ein Programm plant deine Wochen – du trainierst nur noch.</p>
      </header>

      <button className="nx-plan-hero" onClick={() => actions.navigate("planner")}>
        <img className="nx-plan-hero-bg" src={backdrop} alt="" />
        <img className="nx-plan-hero-trainer" src={trainerPhoto(trainer.id)} alt="" />
        <span className="nx-plan-hero-text">
          <span className="nx-badge">Empfohlen</span>
          <b>Für mich planen</b>
          <span>6 kurze Fragen – {trainer.name} baut dir ein Programm passend zu Ziel, Zeit und Körper.</span>
          <span className="nx-plan-hero-go">Los, 1 Minute ›</span>
        </span>
      </button>

      <div className="nx-actions">
        <button className="nx-action" onClick={() => actions.navigate("builder")}>
          <Icon d={ICONS.blocks} />
          <b>Selbst bauen</b>
          <span>Übungen antippen, Zeit wird mitgerechnet</span>
        </button>
        <a className="nx-action" href="#fertige-programme">
          <Icon d={ICONS.list} />
          <b>Fertig wählen</b>
          <span>Bewährte Programme für typische Ziele</span>
        </a>
      </div>

      <section aria-labelledby="fertige-programme">
        <h2 id="fertige-programme" className="nx-section-title">
          Fertige Programme
        </h2>
        <div className="nx-presets">
          {PRESETS.map((p) => {
            const plan = createPlan(p.answers);
            const first = sessionAt(plan, 0);
            return (
              <button
                key={p.id}
                className="nx-preset"
                onClick={() => {
                  actions.createProgram(p.answers, p.name);
                  actions.navigate("program");
                }}
                aria-label={`${p.name}: ${plan.weeks} Wochen, ${plan.weekdays.length} Mal pro Woche, ${first.minutes} Minuten – auswählen`}
              >
                <span className="nx-preset-img">
                  <img src={trainerPhoto(p.trainer)} alt="" />
                </span>
                <b>{p.name}</b>
                <span>{p.text}</span>
                <span className="nx-preset-meta">
                  {plan.weeks} Wo · {plan.weekdays.length}× · {first.minutes} Min
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {view && (
        <button className="nx-active" onClick={() => actions.navigate("program")}>
          <span className="nx-active-ring" style={{ ["--p" as string]: `${Math.round((view.done / view.total) * 100)}` }} aria-hidden="true" />
          <span>
            <small>Aktiv</small>
            <b>
              {view.name} · {view.finished ? "geschafft" : `Woche ${view.week} von ${view.plan.weeks}`}
            </b>
          </span>
          <span className="nx-resume-go">Öffnen</span>
        </button>
      )}
    </MainLayout>
  );
}
