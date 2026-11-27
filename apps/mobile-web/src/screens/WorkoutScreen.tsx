import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ICONS, Icon, trainerPhoto } from "../components/common";
import { actions, useApp } from "../store";
import { exerciseById } from "../program/catalog";
import { programView } from "../program/view";
import { avatarById } from "../render/avatars";
import { SHOW_DEMO } from "../demo-mode";
import { PACE_SECONDS } from "../program/planner";
import { RestDial } from "../components/RestDial";
import { say, stopVoice } from "../voice";

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

const READY_SECONDS = 10;

/** Sprechbare Dosis, z. B. „10 Wiederholungen“ / „30 Sekunden“. */
const doseText = (st: { reps?: number; seconds?: number }) => (st.reps ? `${st.reps} Wiederholungen` : `${st.seconds} Sekunden`);

/**
 * Aktuelle Übung. Automatischer Ablauf (Standard): Countdown → Übung startet von selbst (Kamera, Timer oder Takt mit
 * Mitzählen) → Pause → nächster Satz. So muss man im Training nicht zum Handy laufen. „Anhalten“ schaltet auf Hand-Betrieb.
 */
function Current({ trainerId }: { trainerId: string }) {
  const run = useApp((s) => s.workout)!;
  const auto = useApp((s) => s.settings.autoFlow);
  const voiceOn = useApp((s) => s.settings.voice);
  const restSeconds = useApp((s) => s.settings.restSeconds);
  const step = run.steps[run.index]!;
  const e = exerciseById(step.exerciseId)!;
  const setNo = step.setsDone + 1;
  const speak = (t: string) => {
    if (useApp.getState().settings.voice) say(t);
  };

  // „wait“ = Countdown/Pause, „work“ = Timer oder Takt läuft, „manual“ = Hand-Betrieb
  const [phase, setPhase] = useState<"wait" | "work" | "manual">(auto ? "wait" : "manual");
  const [deadline, setDeadline] = useState(0); // 0 = noch nicht gestellt (erst arm() setzt die Zeit)
  const [resting, setResting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [left, setLeft] = useState<number | null>(step.seconds ?? null);
  const [runningTimer, setRunningTimer] = useState(false);
  const [count, setCount] = useState(0);
  const spoken = useRef<number | null>(null);
  const setKey = `${run.index}:${step.setsDone}`;

  /** Countdown bis zum nächsten Satz starten (nach einem Satz: Pause, sonst kurz bereit machen). */
  const arm = () => {
    const rest = useApp.getState().restUntil;
    const isRest = rest !== null && rest > Date.now() + 1000;
    const dl = isRest ? rest : Date.now() + READY_SECONDS * 1000;
    setDeadline(dl);
    setResting(isRest);
    setNow(Date.now());
    spoken.current = null;
    setPhase("wait");
    const what = step.setsDone > 0 ? `Satz ${setNo} von ${step.sets}, ${e.name}` : `${e.name}, ${doseText(step)}`;
    speak(
      isRest
        ? `Geschafft. ${Math.round((dl - Date.now()) / 1000)} Sekunden Pause. Als Nächstes: ${what}.`
        : `Als Nächstes: ${what}. Los in ${READY_SECONDS} Sekunden.`,
    );
  };

  // Neuer Satz/neue Übung → zurücksetzen und (automatisch) Countdown starten
  useEffect(() => {
    setLeft(step.seconds ?? null);
    setRunningTimer(false);
    setCount(0);
    if (auto) arm();
    else setPhase("manual");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setKey, auto]);

  /** Satz beginnen: Kamera, Timer oder Takt. */
  const begin = () => {
    useApp.setState({ restUntil: null });
    if (e.tracked) {
      speak("Los!");
      actions.workoutLive("camera");
      return;
    }
    speak(step.seconds ? "Los!" : "Los! Ich zähle im Takt mit.");
    setCount(0);
    setPhase("work");
    if (step.seconds) setRunningTimer(true);
  };

  // Countdown-Uhr
  useEffect(() => {
    if (phase !== "wait") return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [phase]);
  const remain = Math.max(0, Math.ceil((deadline - now) / 1000));
  useEffect(() => {
    if (phase !== "wait" || deadline === 0 || spoken.current === remain) return;
    spoken.current = remain;
    if (remain === 10 && resting) speak("Noch 10 Sekunden.");
    else if (remain >= 1 && remain <= 3) speak(String(remain));
    else if (remain === 0) begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remain, phase]);

  // Timer (Halteübungen)
  useEffect(() => {
    if (!runningTimer) return;
    const t = setInterval(() => setLeft((l) => (l === null ? l : Math.max(0, l - 1))), 1000);
    return () => clearInterval(t);
  }, [runningTimer]);
  useEffect(() => {
    if (!runningTimer || left === null) return;
    if (left === 0) {
      setRunningTimer(false);
      actions.workoutSetDone();
    } else if (left === 10 && (step.seconds ?? 0) >= 20) speak("Noch 10 Sekunden.");
    else if (left <= 3) speak(String(left));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left, runningTimer]);

  // Takt (Wiederholungen ohne Kamera): alle 3 s eine Wiederholung, die Stimme zählt mit
  const pacing = phase === "work" && !step.seconds && !e.tracked;
  useEffect(() => {
    if (!pacing) return;
    const t = setInterval(() => setCount((c) => c + 1), PACE_SECONDS * 1000);
    return () => clearInterval(t);
  }, [pacing]);
  useEffect(() => {
    if (!pacing || count === 0) return;
    if (count >= (step.reps ?? 0)) actions.workoutSetDone();
    else speak(String(count));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, pacing]);

  const stop = () => {
    setPhase("manual");
    setRunningTimer(false);
    useApp.setState({ restUntil: null });
    stopVoice();
  };

  return (
    <section className="nx-current" aria-labelledby="aktuelle-uebung">
      <div className="nx-current-visual">
        {e.tracked ? <img src={trainerPhoto(trainerId)} alt="" /> : <span className="nx-current-area">{e.area}</span>}
      </div>
      <p className="nx-kicker">
        Satz {setNo} von {step.sets}
      </p>
      <h1 id="aktuelle-uebung">{e.name}</h1>
      <p className="nx-big-dose">{doseText(step)}</p>

      {phase === "wait" && (
        <div className={`nx-auto${resting ? " rest" : ""}`} role="timer" aria-label={`${resting ? "Pause" : "Start"} in ${remain} Sekunden`}>
          <div className="nx-auto-ring" style={{ "--p": `${Math.min(1, remain / (resting ? Math.max(restSeconds, remain) : READY_SECONDS))}` } as CSSProperties}>
            <b>{remain}</b>
            <small>s</small>
          </div>
          <div className="nx-auto-text">
            <strong>{resting ? "Pause" : "Gleich geht’s los"}</strong>
            <span>{e.tracked ? "Dann startet die Kamera" : step.seconds ? "Dann läuft der Timer" : "Dann zählt die Stimme im Takt mit"}</span>
          </div>
          <div className="nx-auto-actions">
            <button className="btn btn-primary" onClick={begin}>
              Jetzt starten
            </button>
            <button className="btn btn-ghost" onClick={stop}>
              Anhalten
            </button>
          </div>
        </div>
      )}

      {pacing && (
        <div className="nx-pace" role="status" aria-live="off">
          <b>{count}</b>
          <small>von {step.reps}</small>
          <span>Takt: alle {PACE_SECONDS} s eine Wiederholung</span>
        </div>
      )}

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
          <button
            className="btn btn-primary nx-wide"
            onClick={() => {
              if (phase === "wait") setPhase("work");
              setRunningTimer((r) => !r);
            }}
          >
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

      <div className="nx-auto-switches">
        <label className="nx-switch">
          <input type="checkbox" checked={auto} onChange={(ev) => actions.updateSettings({ autoFlow: ev.target.checked })} />
          <span>Automatisch weiter</span>
        </label>
        <label className="nx-switch">
          <input
            type="checkbox"
            checked={voiceOn}
            onChange={(ev) => {
              actions.updateSettings({ voice: ev.target.checked });
              if (ev.target.checked) say("Sprachansage an.");
              else stopVoice();
            }}
          />
          <span>Sprachansage</span>
        </label>
      </div>
      <RestDial
        value={restSeconds}
        onChange={(r) => {
          actions.updateSettings({ restSeconds: r });
          // läuft gerade eine Pause: mit der neuen Länge neu beginnen (ohne erneute Ansage beim Drehen)
          if (phase === "wait" && resting) {
            setDeadline(Date.now() + r * 1000);
            useApp.setState({ restUntil: Date.now() + r * 1000 });
          }
        }}
      />
      {voiceOn && (
        <div className="nx-voice-test">
          <button className="link-btn" onClick={() => say("Hallo! So klingt die Sprachansage im Training.")}>
            Stimme testen
          </button>
          <span>Nichts zu hören? Lautlos-Schalter am iPhone ausschalten und lauter stellen.</span>
        </div>
      )}
      {auto && phase === "manual" && (
        <button className="btn btn-ghost nx-wide" onClick={arm}>
          Automatisch weiter ab hier
        </button>
      )}
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
  origin: "program" | "custom" | "single";
  counted: boolean;
  programDone: ReturnType<typeof programView> | null;
  didSomething: boolean;
}) {
  useEffect(() => {
    if (useApp.getState().settings.voice) say(didSomething ? "Geschafft! Training beendet. Stark gemacht." : "Training beendet.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
