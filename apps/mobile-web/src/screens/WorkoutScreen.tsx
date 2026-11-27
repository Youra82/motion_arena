import { useEffect, useState } from "react";
import { ICONS, Icon, trainerPhoto } from "../components/common";
import { actions, useApp } from "../store";
import { exerciseById } from "../program/catalog";
import { programView } from "../program/view";
import { avatarById } from "../render/avatars";
import { SHOW_DEMO } from "../demo-mode";

/**
 * Laufendes Training: eine Übung nach der anderen. Kniebeugen zählt die Kamera (Live-Training), die anderen Übungen
 * werden mit Anleitung und Timer geführt und von Hand abgehakt.
 */
export function WorkoutScreen() {
  const run = useApp((s) => s.workout);
  const program = useApp((s) => s.program);
  const trainer = avatarById(useApp((s) => s.settings.trainer));

  if (!run) {
    return (
      <main className="nx-workout">
        <h1>Kein Training aktiv</h1>
        <button className="btn btn-primary" onClick={() => actions.home()}>
          Zur Startseite
        </button>
      </main>
    );
  }

  const finished = run.index >= run.steps.length;
  const total = run.steps.length;
  const doneSteps = run.steps.filter((s) => s.skipped || s.setsDone >= s.sets).length;

  return (
    <main className="nx-workout">
      <div className="nx-planner-top">
        <button className="nx-icon-btn" aria-label="Training verlassen (bleibt gespeichert)" onClick={() => actions.home()}>
          <Icon d={ICONS.back} />
        </button>
        <span className="nx-planner-count">
          {finished ? "Fertig" : `Übung ${run.index + 1} von ${total}`}
        </span>
        <span style={{ width: 44 }} />
      </div>
      <div className="nx-progressbar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneSteps} aria-label="Fortschritt im Training">
        <span style={{ width: `${(doneSteps / total) * 100}%` }} />
      </div>

      {finished ? (
        <Finished title={run.title} origin={run.origin} counted={run.counted} programDone={program ? programView(program) : null} didSomething={run.steps.some((s) => s.setsDone > 0)} />
      ) : (
        <Current trainerId={trainer.id} />
      )}

      <section aria-labelledby="ablauf">
        <h2 id="ablauf" className="nx-section-title">
          {run.title}
        </h2>
        <ol className="nx-steps">
          {run.steps.map((s, i) => {
            const e = exerciseById(s.exerciseId)!;
            const state = s.skipped ? "skipped" : s.setsDone >= s.sets ? "done" : i === run.index ? "now" : "";
            return (
              <li key={s.exerciseId} className={state}>
                <span className="nx-steps-dot" aria-hidden="true">
                  {state === "done" ? <Icon d={ICONS.check} size={14} /> : i + 1}
                </span>
                <span className="nx-steps-name">
                  {e.name}
                  {e.tracked && <em className="nx-cam">Kamera</em>}
                </span>
                <span className="nx-dose">
                  {state === "skipped" ? "übersprungen" : `${s.setsDone}/${s.sets} · ${s.reps ? `${s.reps} Wdh` : `${s.seconds} s`}`}
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </main>
  );
}

function Current({ trainerId }: { trainerId: string }) {
  const run = useApp((s) => s.workout)!;
  const step = run.steps[run.index]!;
  const e = exerciseById(step.exerciseId)!;
  const setNo = step.setsDone + 1;
  const [left, setLeft] = useState<number | null>(step.seconds ?? null);
  const [runningTimer, setRunningTimer] = useState(false);
  // Neuer Satz/neue Übung → Timer zurücksetzen
  useEffect(() => {
    setLeft(step.seconds ?? null);
    setRunningTimer(false);
  }, [run.index, step.setsDone, step.seconds]);
  useEffect(() => {
    if (!runningTimer) return;
    const t = setInterval(() => setLeft((l) => (l === null ? l : Math.max(0, l - 1))), 1000);
    return () => clearInterval(t);
  }, [runningTimer]);
  useEffect(() => {
    if (runningTimer && left === 0) {
      setRunningTimer(false);
      actions.workoutSetDone();
    }
  }, [left, runningTimer]);

  return (
    <section className="nx-current" aria-labelledby="aktuelle-uebung">
      <div className="nx-current-visual">
        {e.tracked ? <img src={trainerPhoto(trainerId)} alt="" /> : <span className="nx-current-area">{e.area}</span>}
      </div>
      <p className="nx-kicker">
        Satz {setNo} von {step.sets}
      </p>
      <h1 id="aktuelle-uebung">{e.name}</h1>
      <p className="nx-big-dose">{step.reps ? `${step.reps} Wiederholungen` : `${step.seconds} Sekunden`}</p>
      <ol className="nx-cues">
        {e.cues.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ol>
      {e.tracked ? (
        <div className="nx-current-actions">
          <button className="btn btn-primary nx-wide" onClick={() => actions.workoutLive("camera")}>
            <Icon d={ICONS.camera} size={18} /> Mit Kamera zählen
          </button>
          <div className="actions">
            {SHOW_DEMO && (
              <button className="btn btn-ghost" onClick={() => actions.workoutLive("demo")}>
                Demo
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => actions.workoutSetDone()}>
              Ohne Kamera abhaken
            </button>
          </div>
        </div>
      ) : step.seconds ? (
        <div className="nx-current-actions">
          <div className="nx-timer" role="timer" aria-live="off" aria-label={`${left ?? step.seconds} Sekunden übrig`}>
            {left ?? step.seconds}
            <small>s</small>
          </div>
          <button className="btn btn-primary nx-wide" onClick={() => setRunningTimer((r) => !r)}>
            <Icon d={runningTimer ? "M7 5v14M17 5v14" : ICONS.play} size={18} /> {runningTimer ? "Pause" : left !== step.seconds ? "Weiter" : "Timer starten"}
          </button>
          <button className="btn btn-ghost" onClick={() => actions.workoutSetDone()}>
            Satz erledigt
          </button>
        </div>
      ) : (
        <div className="nx-current-actions">
          <button className="btn btn-primary nx-wide" onClick={() => actions.workoutSetDone()}>
            <Icon d={ICONS.check} size={18} /> Satz erledigt
          </button>
        </div>
      )}
      <button className="link-btn" onClick={() => actions.workoutSkip()}>
        Übung überspringen
      </button>
    </section>
  );
}

function Finished({
  title,
  origin,
  counted,
  programDone,
  didSomething,
}: {
  title: string;
  origin: "program" | "custom";
  counted: boolean;
  programDone: ReturnType<typeof programView> | null;
  didSomething: boolean;
}) {
  return (
    <section className="nx-finished" aria-live="polite">
      <span className="nx-finished-badge" aria-hidden="true">
        <Icon d={ICONS.check} size={40} />
      </span>
      <h1>{didSomething ? "Geschafft!" : "Training beendet"}</h1>
      <p>
        {title}
        {origin === "program" && programDone && counted && didSomething
          ? ` – Einheit ${programDone.done} von ${programDone.total} erledigt.`
          : didSomething
            ? " ist erledigt."
            : " – alle Übungen übersprungen, die Einheit zählt nicht."}
      </p>
      <div className="actions">
        <button className="btn btn-primary" onClick={() => actions.endWorkout()}>
          Fertig
        </button>
        {origin === "program" && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              actions.endWorkout();
              actions.navigate("program");
            }}
          >
            Zum Programm
          </button>
        )}
      </div>
    </section>
  );
}
