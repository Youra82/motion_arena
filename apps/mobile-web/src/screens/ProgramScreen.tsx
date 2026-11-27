import { useState } from "react";
import { ICONS, Icon, MainLayout, trainerPhoto } from "../components/common";
import { actions, useApp } from "../store";
import { explain, phaseOf } from "../program/planner";
import { programView } from "../program/view";
import { useStage } from "./HomeScreen";

const ADJUST: Array<{ v: -1 | 0 | 1; label: string; note: string }> = [
  { v: -1, label: "Zu schwer", note: "Ab der nächsten Einheit leichter: weniger Wiederholungen und kürzere Haltezeiten." },
  { v: 0, label: "Passt", note: "Normale Steigerung nach Plan." },
  { v: 1, label: "Zu leicht", note: "Ab der nächsten Einheit fordernder: mehr Wiederholungen und längere Haltezeiten." },
];

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
  const adjust = ADJUST.find((a) => a.v === program.adjust)!;
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
          Passt es so?
        </h2>
        <div className="segmented" role="group" aria-label="Belastung anpassen">
          {ADJUST.map((a) => (
            <button key={a.v} aria-pressed={program.adjust === a.v} onClick={() => actions.adjustProgram(a.v)}>
              {a.label}
            </button>
          ))}
        </div>
        <p className="nx-note" role="status">
          {adjust.note}
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
