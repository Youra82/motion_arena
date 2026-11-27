import { useEffect, useMemo, useState } from "react";
import { ICONS, Icon, trainerPhoto } from "../components/common";
import { actions, useApp } from "../store";
import { exerciseById } from "../program/catalog";
import {
  ALL_WEEKDAYS,
  FOCUS_LABEL,
  GOAL_LABEL,
  PAIN_LABEL,
  SLOT_SHORT,
  createPlan,
  explain,
  phaseRanges,
  sessionAt,
  totalSessions,
  type Answers,
  type Focus,
} from "../program/planner";
import { avatarById } from "../render/avatars";

type Key = "goal" | "level" | "days" | "minutes" | "focus" | "pain";
interface Option {
  id: string | number;
  label: string;
  sub: string;
}
interface Question {
  key: Key;
  title: string;
  why: string;
  multi?: boolean;
  options: Option[];
}

const QUESTIONS: Question[] = [
  { key: "goal", title: "Was willst du erreichen?", why: "Danach richte ich Übungen und Tempo aus.", options: [
    { id: "alltag", label: GOAL_LABEL.alltag, sub: "Treppen, Tragen, mehr Energie" },
    { id: "kraft", label: GOAL_LABEL.kraft, sub: "Stärker und straffer werden" },
    { id: "ausdauer", label: GOAL_LABEL.ausdauer, sub: "Puls hoch, Kalorien runter" },
    { id: "beweglich", label: GOAL_LABEL.beweglich, sub: "Rücken, Hüfte, Schultern" },
  ] },
  { key: "level", title: "Wie fit fühlst du dich gerade?", why: "Ehrlich sein lohnt sich – zu schwer frustriert, zu leicht langweilt.", options: [
    { id: "neu", label: "Neu dabei", sub: "Ich fange gerade (wieder) an" },
    { id: "manchmal", label: "Ab und zu aktiv", sub: "1–2 Mal pro Woche" },
    { id: "regel", label: "Regelmäßig aktiv", sub: "3 Mal pro Woche oder mehr" },
  ] },
  { key: "days", title: "Wie viele Tage pro Woche?", why: "Ich lege die Ruhetage so, dass sich jeder Muskel erholt.", options: [
    { id: 2, label: "2 Tage", sub: "Mo · Do" },
    { id: 3, label: "3 Tage", sub: "Mo · Mi · Fr" },
    { id: 4, label: "4 Tage", sub: "Mo · Di · Do · Fr" },
    { id: 5, label: "5 Tage", sub: "Mo · Di · Mi · Fr · Sa" },
  ] },
  { key: "minutes", title: "Wie lange pro Training?", why: "Inklusive Aufwärmen – die Zeit halte ich ein.", options: [
    { id: 10, label: "10 Minuten", sub: "Kurz und knackig" },
    { id: 20, label: "20 Minuten", sub: "Der beste Einstieg" },
    { id: 30, label: "30 Minuten", sub: "Richtig trainieren" },
    { id: 45, label: "45 Minuten", sub: "Volles Programm" },
  ] },
  { key: "focus", multi: true, title: "Was soll besonders stark werden?", why: "Mehrere antippen geht – ich verteile sie auf die Woche.", options: [
    { id: "beine", label: FOCUS_LABEL.beine, sub: "Kniebeugen, Brücke, Ausfallschritt" },
    { id: "rumpf", label: FOCUS_LABEL.rumpf, sub: "Stütz, Stabilität, Haltung" },
    { id: "oberkoerper", label: FOCUS_LABEL.oberkoerper, sub: "Liegestütz, Schultern, Rücken" },
    { id: "ganzkoerper", label: FOCUS_LABEL.ganzkoerper, sub: "Alles in jeder Einheit" },
  ] },
  { key: "pain", title: "Gibt es Beschwerden?", why: "Dann tausche ich Übungen aus, die dort belasten.", options: [
    { id: "keine", label: PAIN_LABEL.keine, sub: "Alles in Ordnung" },
    { id: "knie", label: PAIN_LABEL.knie, sub: "Keine Sprünge, keine tiefen Kniebeugen" },
    { id: "ruecken", label: PAIN_LABEL.ruecken, sub: "Schonend für die Wirbelsäule" },
    { id: "schultern", label: PAIN_LABEL.schultern, sub: "Keine Stütze auf den Armen" },
  ] },
];

type Draft = Partial<Omit<Answers, "focus">> & { focus: Focus[] };

/** Programm-Planer: sechs Fragen, kurze Bauphase, dann das fertige Programm mit Begründung. */
export function PlannerScreen() {
  const trainer = avatarById(useApp((s) => s.settings.trainer));
  const hasProgram = useApp((s) => !!s.program);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>({ focus: [] });
  const building = step === QUESTIONS.length;
  const result = step > QUESTIONS.length;
  useEffect(() => {
    if (!building) return;
    const t = setTimeout(() => setStep(QUESTIONS.length + 1), 1500);
    return () => clearTimeout(t);
  }, [building]);
  const answers = useMemo(() => (result ? (draft as Answers) : null), [result, draft]);

  if (building) return <Building trainerId={trainer.id} trainerName={trainer.name} draft={draft} />;
  if (answers) return <Result answers={answers} replaces={hasProgram} onEdit={() => setStep(0)} />;

  const q = QUESTIONS[step]!;
  const picked = (o: Option) => (q.multi ? draft.focus.includes(o.id as Focus) : draft[q.key as Exclude<Key, "focus">] === o.id);
  const pick = (o: Option) => {
    if (q.multi) {
      const f = o.id as Focus;
      setDraft((d) => ({ ...d, focus: d.focus.includes(f) ? d.focus.filter((x) => x !== f) : [...d.focus, f] }));
      return;
    }
    setDraft((d) => ({ ...d, [q.key]: o.id }));
    setStep((s) => s + 1);
  };

  return (
    <main className="nx-planner">
      <div className="nx-planner-top">
        <button className="nx-icon-btn" aria-label="Eine Frage zurück" onClick={() => (step > 0 ? setStep(step - 1) : actions.navigate("programs"))}>
          <Icon d={ICONS.back} />
        </button>
        <span className="nx-planner-count">
          Frage {step + 1} von {QUESTIONS.length}
        </span>
        <button className="nx-icon-btn" aria-label="Planer schließen" onClick={() => actions.navigate("programs")}>
          <Icon d={ICONS.close} />
        </button>
      </div>
      <div className="nx-segs" aria-hidden="true">
        {QUESTIONS.map((_, i) => (
          <span key={i} className={i < step ? "done" : i === step ? "now" : ""} />
        ))}
      </div>
      <div className="nx-question" key={step}>
        <div>
          <h1>{q.title}</h1>
          <p>{q.why}</p>
        </div>
        <img src={trainerPhoto(trainer.id)} alt={`Trainer ${trainer.name}`} />
      </div>
      <div className="nx-options" role="group" aria-label={q.title}>
        {q.options.map((o) => (
          <button key={o.id} className="nx-option" aria-pressed={picked(o)} onClick={() => pick(o)}>
            <span>
              <b>{o.label}</b>
              <small>{o.sub}</small>
            </span>
            <span className="nx-option-dot" aria-hidden="true">
              {picked(o) ? "✓" : ""}
            </span>
          </button>
        ))}
      </div>
      <div className="nx-planner-foot">
        {q.multi ? (
          <button className="btn btn-primary nx-wide" disabled={!draft.focus.length} onClick={() => setStep(step + 1)}>
            Weiter
          </button>
        ) : (
          <p className="muted small">Antippen genügt – es geht automatisch weiter.</p>
        )}
      </div>
    </main>
  );
}

function Building({ trainerId, trainerName, draft }: { trainerId: string; trainerName: string; draft: Draft }) {
  const lines = [
    `Ziel: ${draft.goal ? GOAL_LABEL[draft.goal] : "–"}`,
    `${draft.days} Tage · ${draft.minutes} Minuten`,
    `Schwerpunkt: ${draft.focus.map((f) => FOCUS_LABEL[f]).join(", ")}`,
    draft.pain && draft.pain !== "keine" ? `${PAIN_LABEL[draft.pain]} wird geschont` : "Volle Übungsauswahl",
  ];
  return (
    <main className="nx-planner nx-building" aria-live="polite">
      <div className="nx-spinner">
        <span className="nx-spinner-ring" aria-hidden="true" />
        <img src={trainerPhoto(trainerId)} alt="" />
      </div>
      <h1>{trainerName} stellt dein Programm zusammen …</h1>
      <ul>
        {lines.map((l, i) => (
          <li key={l} style={{ animationDelay: `${i * 0.3}s` }}>
            <span aria-hidden="true">✓</span>
            {l}
          </li>
        ))}
      </ul>
    </main>
  );
}

function Result({ answers, replaces, onEdit }: { answers: Answers; replaces: boolean; onEdit: () => void }) {
  const plan = createPlan(answers);
  const first = sessionAt(plan, 0);
  const phases = phaseRanges(plan);
  const why = explain(plan);
  return (
    <main className="nx-planner nx-result">
      <div className="nx-result-head">
        <p className="nx-kicker">Dein Programm ist fertig</p>
        <h1>{plan.name}</h1>
        <div className="nx-chips">
          <span>{plan.weeks} Wochen</span>
          <span>{plan.weekdays.length}× pro Woche</span>
          <span>ca. {first.minutes} Min</span>
          <span>{totalSessions(plan)} Einheiten</span>
        </div>
      </div>
      <div className="nx-result-body">
        <div className="nx-phases" aria-label="Phasen">
          {phases.map((p, i) => (
            <div key={p.name} className={`nx-phase p${i}`}>
              <span className="nx-phase-bar" />
              <b>{p.name}</b>
              <small>
                Woche {p.from}
                {p.to > p.from ? `–${p.to}` : ""}
              </small>
            </div>
          ))}
        </div>
        <div className="nx-weekgrid" aria-label="Wochenplan">
          {ALL_WEEKDAYS.map((d) => {
            const slot = plan.weekdays.indexOf(d);
            return (
              <div key={d} className={slot >= 0 ? "on" : ""}>
                <b>{d}</b>
                <small>{slot >= 0 ? SLOT_SHORT[plan.slots[slot]!] : "Ruhe"}</small>
              </div>
            );
          })}
        </div>
        <section className="nx-session-box">
          <div className="row-between small">
            <b>
              Erste Einheit · {plan.weekdays[0]} · {first.title}
            </b>
            <span className="muted">{first.minutes} Min</span>
          </div>
          <ol>
            {first.steps.map((s) => {
              const e = exerciseById(s.exerciseId)!;
              return (
                <li key={s.exerciseId}>
                  <span>
                    {e.name}
                    {e.tracked && <em className="nx-cam">Kamera zählt</em>}
                  </span>
                  <span className="nx-dose">{s.reps ? `${s.sets} × ${s.reps}` : `${s.sets} × ${s.seconds} s`}</span>
                </li>
              );
            })}
          </ol>
        </section>
        <section>
          <h2 className="nx-section-title">Warum so?</h2>
          <ul className="nx-why">
            {why.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </section>
        {replaces && <p className="muted small">Das neue Programm ersetzt dein aktuelles Programm.</p>}
      </div>
      <div className="nx-result-foot">
        <button
          className="btn btn-primary nx-wide"
          onClick={() => {
            actions.createProgram(answers);
            actions.navigate("program");
          }}
        >
          Programm starten
        </button>
        <button className="btn btn-ghost" onClick={onEdit}>
          Anpassen
        </button>
      </div>
    </main>
  );
}
