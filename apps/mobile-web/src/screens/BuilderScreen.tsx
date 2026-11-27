import { useState } from "react";
import { ICONS, Icon, MainLayout } from "../components/common";
import { actions, useApp } from "../store";
import { EXERCISES, exerciseById } from "../program/catalog";
import { sessionMinutes, type Step } from "../program/planner";
import type { CustomWorkout } from "../persist";
import { StageCard } from "../components/StagePicker";

const DEFAULT: CustomWorkout = {
  name: "Mein Training",
  steps: [
    { exerciseId: "squat", sets: 3, reps: 10 },
    { exerciseId: "glute-bridge", sets: 3, reps: 12 },
    { exerciseId: "plank", sets: 2, seconds: 30 },
  ],
};

const UPPER = new Set(["Oberkörper", "Schultern"]);

/** Schnell selbst bauen: Übungen antippen, Sätze einstellen – Dauer und Körperbereiche rechnen mit. */
export function BuilderScreen() {
  const saved = useApp((s) => s.custom);
  const [w, setW] = useState<CustomWorkout>(saved ?? DEFAULT);
  const [savedNote, setSavedNote] = useState(false);
  const set = (steps: Step[]) => {
    setSavedNote(false);
    setW((x) => ({ ...x, steps }));
  };
  const used = new Set(w.steps.map((s) => s.exerciseId));
  const areas = new Set(w.steps.map((s) => exerciseById(s.exerciseId)!.area));
  const minutes = w.steps.length ? sessionMinutes(w.steps) : 0;
  const tip = !w.steps.length
    ? { text: "Tippe unten Übungen an – ich rechne die Zeit mit.", tone: "" }
    : w.steps.length >= 3 && ![...areas].some((a) => UPPER.has(a))
      ? { text: "Tipp: noch nichts für den Oberkörper – z. B. Liegestütz ergänzen?", tone: "warn" }
      : { text: "Gute Mischung – 2 Minuten Aufwärmen sind schon eingerechnet.", tone: "good" };

  return (
    <MainLayout className="nx-builder">
      <div className="nx-builder-top">
        <button className="nx-icon-btn" aria-label="Zurück zu Programme" onClick={() => actions.navigate("programs")}>
          <Icon d={ICONS.back} />
        </button>
        <h1 className="sr-only">Selbst bauen</h1>
        <label className="sr-only" htmlFor="builder-name">
          Name des Trainings
        </label>
        <input id="builder-name" className="nx-name-input" value={w.name} maxLength={40} onChange={(e) => setW({ ...w, name: e.target.value })} />
      </div>

      <div className="nx-stats" aria-live="polite">
        <div>
          <b className="hot">{minutes}</b>
          <small>Minuten</small>
        </div>
        <div>
          <b>{w.steps.length}</b>
          <small>Übungen</small>
        </div>
        <div>
          <b className="cool">{areas.size}</b>
          <small>Körperbereiche</small>
        </div>
      </div>
      <p className={`nx-note ${tip.tone}`} role="status">
        {tip.text}
      </p>

      <ol className="nx-build-list">
        {w.steps.map((s, i) => {
          const e = exerciseById(s.exerciseId)!;
          const upd = (patch: Partial<Step>) => set(w.steps.map((x, k) => (k === i ? { ...x, ...patch } : x)));
          return (
            <li key={s.exerciseId}>
              <span className="nx-build-pos">{String(i + 1).padStart(2, "0")}</span>
              <span className="nx-build-name">
                <b>
                  {e.name}
                  {e.tracked && <em className="nx-cam">Kamera</em>}
                </b>
                <small>
                  {e.area} · {s.sets} × {s.reps ? s.reps : `${s.seconds} s`}
                </small>
              </span>
              <button className="nx-step-btn" aria-label={`${e.name}: ein Satz weniger`} onClick={() => upd({ sets: Math.max(1, s.sets - 1) })}>
                −
              </button>
              <span className="nx-build-sets" aria-label={`${s.sets} Sätze`}>
                {s.sets}
              </span>
              <button className="nx-step-btn" aria-label={`${e.name}: ein Satz mehr`} onClick={() => upd({ sets: Math.min(5, s.sets + 1) })}>
                +
              </button>
              <button className="nx-icon-btn small" aria-label={`${e.name} entfernen`} onClick={() => set(w.steps.filter((_, k) => k !== i))}>
                <Icon d={ICONS.close} size={16} />
              </button>
            </li>
          );
        })}
      </ol>

      <StageCard />

      <section aria-labelledby="hinzufuegen">
        <h2 id="hinzufuegen" className="nx-section-title">
          Antippen zum Hinzufügen
        </h2>
        <div className="nx-addchips">
          {EXERCISES.filter((e) => !used.has(e.id)).map((e) => (
            <button
              key={e.id}
              disabled={w.steps.length >= 12}
              onClick={() => set([...w.steps, e.measure === "reps" ? { exerciseId: e.id, sets: 3, reps: 10 } : { exerciseId: e.id, sets: 2, seconds: 30 }])}
            >
              <span aria-hidden="true">+</span>
              {e.name}
            </button>
          ))}
        </div>
      </section>

      <div className="nx-sticky-actions">
        <button className="btn btn-primary nx-wide" disabled={!w.steps.length} onClick={() => actions.startCustom({ ...w, name: w.name.trim() || "Mein Training" })}>
          Jetzt trainieren
        </button>
        <button
          className="btn btn-ghost"
          disabled={!w.steps.length}
          onClick={() => {
            actions.saveCustom({ ...w, name: w.name.trim() || "Mein Training" });
            setSavedNote(true);
          }}
        >
          {savedNote ? "Gespeichert ✓" : "Speichern"}
        </button>
      </div>
    </MainLayout>
  );
}
