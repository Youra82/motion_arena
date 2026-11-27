import { useState } from "react";
import { ICONS, Icon, MainLayout, trainerPhoto } from "../components/common";
import { actions, useApp } from "../store";
import { explain, phaseOf } from "../program/planner";
import { programView } from "../program/view";
import { useStage } from "./HomeScreen";

/** Kurzer Name je Stufe 1–10. */
const LEVEL_NAME = ["sehr leicht", "sehr leicht", "leicht", "leicht", "mittel", "mittel", "schwer", "schwer", "sehr schwer", "sehr schwer"];

function levelNote(level: number): string {
  const o = level - 5;
  const head = `Stufe ${level} – ${LEVEL_NAME[level - 1]}`;
  if (o === 0) return `${head}: so wie der Plan es vorsieht, normale Steigerung von Woche zu Woche.`;
  const n = Math.abs(o);
  const sets = o <= -3 ? " und wo möglich ein Satz weniger" : o >= 3 ? " und ein Satz mehr" : "";
  return o < 0
    ? `${head}: bis zu ${n} ${n === 1 ? "Wiederholung" : "Wiederholungen"} weniger und bis zu ${n * 5} s kürzer halten als Stufe 5${sets}.`
    : `${head}: ${n} ${n === 1 ? "Wiederholung" : "Wiederholungen"} mehr und ${n * 5} s länger halten als Stufe 5${sets}.`;
}

/** Dein Programm: Steigerung über die Wochen, diese Woche, Anpassen. */
export function ProgramScreen() {
  const program = useApp((s) => s.program);
  const { trainer, backdrop } = useStage();
  const [confirmEnd, setConfirmEnd] = useState(false);

  if (!program) {
    return (
      <MainLayout className="nx-program">
        <h1 className="page-title">Dein Programm</h1>
        <section className="card">
          <p>Du hast noch kein Programm. In einer Minute ist eins fertig – passend zu Ziel, Zeit und Körper.</p>
          <div className="actions">
            <button className="btn btn-primary" onClick={() => actions.navigate("planner")}>
              Programm erstellen
            </button>
            <button className="btn btn-ghost" onClick={() => actions.navigate("programs")}>
              Fertige Programme
            </button>
          </div>
        </section>
      </MainLayout>
    );
  }

  const v = programView(program);
  const why = explain(v.plan);
  return (
    <MainLayout className="nx-program">
      <section className="nx-prog-hero">
        <img className="nx-prog-hero-bg" src={backdrop} alt="" />
        <img className="nx-prog-hero-trainer" src={trainerPhoto(trainer.id)} alt="" />
        <button className="nx-round nx-prog-back" aria-label="Zurück zu Programme" onClick={() => actions.navigate("programs")}>
          <Icon d={ICONS.back} size={20} />
        </button>
        <div className="nx-prog-hero-text">
          <span className="nx-kicker">
            {v.finished ? "Abgeschlossen" : `Woche ${v.week} von ${v.plan.weeks}`} · mit {trainer.name}
          </span>
          <h1>{v.name}</h1>
          <span className="nx-meta">
            {v.plan.weekdays.length}× pro Woche · ca. {v.next.minutes} Min · {v.done}/{v.total} Einheiten
          </span>
        </div>
      </section>

      <section aria-labelledby="steigerung">
        <div className="row-between">
          <h2 id="steigerung" className="nx-section-title">
            So steigert sich dein Programm
          </h2>
          <span className="muted small">Umfang je Woche</span>
        </div>
        <div className="nx-loadbars" role="img" aria-label={`Umfang steigt von Woche 1 bis ${v.plan.weeks}; aktuell Woche ${v.week}`}>
          {v.weekLoad.map((l, i) => {
            const w = i + 1;
            const cls = w < v.week || v.finished ? "done" : w === v.week ? "now" : "";
            return (
              <span key={w} className={`nx-loadbar ${cls} ph${phaseOf(v.plan, w)}`}>
                <span style={{ height: `${Math.round(18 + l * 70)}px` }} />
                <small>W{w}</small>
              </span>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="diese-woche">
        <h2 id="diese-woche" className="nx-section-title">
          {v.finished ? "Letzte Woche" : "Diese Woche"}
        </h2>
        <ul className="nx-weeklist">
          {v.thisWeek.map((e) => (
            <li key={e.index} className={e.status}>
              <span className="nx-weeklist-dot" aria-hidden="true">
                {e.status === "done" ? <Icon d={ICONS.check} size={16} /> : e.status === "next" ? <Icon d={ICONS.play} size={14} /> : null}
              </span>
              <span className="nx-weeklist-text">
                <b>
                  {e.weekday} · {e.title}
                </b>
                <small>
                  {e.status === "done" ? "geschafft" : `${e.exercises} Übungen · ${e.minutes} Min`}
                </small>
              </span>
              {e.status === "next" && (
                <button className="btn btn-primary nx-small-btn" onClick={() => actions.startProgramSession()}>
                  Starten
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="passt">
        <h2 id="passt" className="nx-section-title">
          Stufe
        </h2>
        <div className="nx-levels" role="group" aria-label="Stufe wählen">
          {LEVEL_NAME.map((_, i) => (
            <button key={i} aria-pressed={program.level === i + 1} aria-label={`Stufe ${i + 1} – ${LEVEL_NAME[i]}`} onClick={() => actions.setProgramLevel(i + 1)}>
              {i + 1}
            </button>
          ))}
        </div>
        <div className="nx-levels-scale" aria-hidden="true">
          <span>leicht</span>
          <span>schwer</span>
        </div>
        <p className="nx-note" role="status">
          {levelNote(program.level)}
        </p>
      </section>

      <section aria-labelledby="warum">
        <h2 id="warum" className="nx-section-title">
          Warum so?
        </h2>
        <ul className="nx-why">
          {why.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      </section>

      <div className="actions">
        <button className="btn" onClick={() => actions.navigate("planner")}>
          Neu planen
        </button>
        {confirmEnd ? (
          <button
            className="btn btn-ghost"
            onClick={() => {
              actions.removeProgram();
              actions.navigate("programs");
            }}
          >
            Wirklich beenden?
          </button>
        ) : (
          <button className="btn btn-ghost" onClick={() => setConfirmEnd(true)}>
            Programm beenden
          </button>
        )}
      </div>
    </MainLayout>
  );
}
