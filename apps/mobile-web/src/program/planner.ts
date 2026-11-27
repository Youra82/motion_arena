/**
 * Programm-Planer: aus sechs Antworten ein mehrwöchiges Trainingsprogramm.
 *
 * Reine Funktionen (keine Zufälle, keine Uhrzeit) – dieselben Antworten ergeben immer dasselbe Programm, damit es
 * sich speichern, wiederherstellen und testen lässt. Eine Einheit wird erst beim Abrufen aus Woche, Phase und
 * Anpassung („zu schwer / zu leicht“) berechnet; gespeichert werden nur Antworten und Fortschritt.
 */
import { EXERCISES, exerciseById, type Exercise, type Strain } from "./catalog";

export type Goal = "alltag" | "kraft" | "ausdauer" | "beweglich";
export type Level = "neu" | "manchmal" | "regel";
export type Focus = "beine" | "rumpf" | "oberkoerper" | "ganzkoerper";
export type Pain = "keine" | "knie" | "ruecken" | "schultern";
export type Weekday = "Mo" | "Di" | "Mi" | "Do" | "Fr" | "Sa" | "So";

export interface Answers {
  goal: Goal;
  level: Level;
  /** Trainingstage pro Woche (2–5). */
  days: 2 | 3 | 4 | 5;
  /** Minuten pro Einheit inkl. Aufwärmen. */
  minutes: 10 | 20 | 30 | 45;
  focus: Focus[];
  pain: Pain;
}

/** Ein Schritt einer Einheit. */
export interface Step {
  exerciseId: string;
  sets: number;
  /** Wiederholungen je Satz (bei measure "reps"). */
  reps?: number;
  /** Sekunden je Satz (bei measure "time"). */
  seconds?: number;
}

export interface Session {
  /** Schwerpunkt dieser Einheit, z. B. „Beine & Po“. */
  title: string;
  steps: Step[];
  /** Geschätzte Dauer in Minuten (inkl. Aufwärmen und Pausen). */
  minutes: number;
}

export interface Plan {
  v: 1;
  answers: Answers;
  name: string;
  weeks: number;
  weekdays: Weekday[];
  /** Schwerpunkt je Trainingstag der Woche (gleiche Länge wie weekdays). */
  slots: SlotKind[];
}

export type SlotKind = Focus | "ausdauer" | "mobilitaet";

export const GOAL_LABEL: Record<Goal, string> = {
  alltag: "Fitter im Alltag",
  kraft: "Kraft & Muskeln",
  ausdauer: "Abnehmen & Ausdauer",
  beweglich: "Beweglich & schmerzfrei",
};
export const LEVEL_LABEL: Record<Level, string> = { neu: "Neu dabei", manchmal: "Ab und zu aktiv", regel: "Regelmäßig aktiv" };
export const FOCUS_LABEL: Record<Focus, string> = { beine: "Beine & Po", rumpf: "Rumpf & Bauch", oberkoerper: "Oberkörper & Arme", ganzkoerper: "Ganzkörper" };
export const PAIN_LABEL: Record<Pain, string> = { keine: "Keine", knie: "Knie", ruecken: "Rücken", schultern: "Schultern" };
export const SLOT_LABEL: Record<SlotKind, string> = { ...FOCUS_LABEL, ausdauer: "Puls & Ausdauer", mobilitaet: "Beweglichkeit" };
export const SLOT_SHORT: Record<SlotKind, string> = { beine: "Beine", rumpf: "Rumpf", oberkoerper: "Arme", ganzkoerper: "Ganz", ausdauer: "Puls", mobilitaet: "Mobil" };

const PLAN_NAME: Record<Goal, string> = { alltag: "Alltags-Fit", kraft: "Kraft-Aufbau", ausdauer: "Puls & Power", beweglich: "Beweglich & frei" };

export const WEEKDAYS_BY_DAYS: Record<Answers["days"], Weekday[]> = {
  2: ["Mo", "Do"],
  3: ["Mo", "Mi", "Fr"],
  4: ["Mo", "Di", "Do", "Fr"],
  5: ["Mo", "Di", "Mi", "Fr", "Sa"],
};
export const ALL_WEEKDAYS: Weekday[] = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Übungsauswahl je Schwerpunkt, wichtigste zuerst. */
const POOL: Record<SlotKind, string[]> = {
  beine: ["squat", "glute-bridge", "lunge", "side-leg-raise", "half-squat"],
  rumpf: ["plank", "dead-bug", "bird-dog", "side-plank"],
  oberkoerper: ["knee-pushup", "lateral-raise", "scap-squeeze", "wall-pushup"],
  ganzkoerper: ["squat", "knee-pushup", "plank", "glute-bridge", "jumping-jack", "dead-bug"],
  ausdauer: ["jumping-jack", "high-knees", "burpee-light", "squat", "step-jack"],
  mobilitaet: ["cat-cow", "hip-circles", "shoulder-circles", "bird-dog"],
};

/** Ersatz, wenn eine Übung wegen Beschwerden entfällt. */
const SWAP: Record<string, string[]> = {
  squat: ["half-squat", "glute-bridge"],
  lunge: ["side-leg-raise", "glute-bridge"],
  plank: ["dead-bug", "bird-dog"],
  "side-plank": ["bird-dog", "dead-bug"],
  "knee-pushup": ["wall-pushup", "scap-squeeze"],
  "lateral-raise": ["scap-squeeze"],
  "jumping-jack": ["step-jack", "high-knees"],
  "burpee-light": ["step-jack", "high-knees"],
};

const PAIN_STRAIN: Record<Exclude<Pain, "keine">, keyof Strain> = { knie: "knee", ruecken: "back", schultern: "shoulder" };

/** Darf diese Übung bei den angegebenen Beschwerden in den Plan? */
export function allowed(e: Exercise, pain: Pain): boolean {
  if (pain === "keine") return true;
  if (e.strain[PAIN_STRAIN[pain]]) return false;
  // Bei Knieproblemen auch keine Sprünge
  if (pain === "knie" && e.strain.jump) return false;
  return true;
}

/** Übung oder ihr Ersatz bei Beschwerden; null, wenn nichts Passendes übrig bleibt. */
export function resolveExercise(id: string, pain: Pain): string | null {
  const e = exerciseById(id);
  if (e && allowed(e, pain)) return id;
  for (const alt of SWAP[id] ?? []) {
    const a = exerciseById(alt);
    if (a && allowed(a, pain)) return alt;
  }
  return null;
}

export function createPlan(a: Answers): Plan {
  const weekdays = WEEKDAYS_BY_DAYS[a.days];
  const focus: SlotKind[] = a.focus.length ? [...a.focus] : ["ganzkoerper"];
  // Ziel bestimmt, was zusätzlich in die Woche kommt
  if (a.goal === "ausdauer") focus.push("ausdauer");
  if (a.goal === "beweglich") focus.push("mobilitaet");
  if (a.goal === "alltag" && !focus.includes("ganzkoerper") && a.days >= 4) focus.push("ganzkoerper");
  const slots = weekdays.map((_, i) => focus[i % focus.length]!);
  return { v: 1, answers: { ...a, focus: [...a.focus] }, name: PLAN_NAME[a.goal], weeks: a.level === "neu" ? 6 : 8, weekdays, slots };
}

/** Phase 0 = Grundlage, 1 = Aufbau, 2 = Steigerung. */
export function phaseOf(plan: Plan, week: number): 0 | 1 | 2 {
  const third = plan.weeks / 3;
  return week <= third ? 0 : week <= 2 * third ? 1 : 2;
}

export const PHASE_NAMES = ["Grundlage", "Aufbau", "Steigerung"] as const;

export function phaseRanges(plan: Plan): Array<{ name: string; from: number; to: number }> {
  const out: Array<{ name: string; from: number; to: number }> = [];
  for (let w = 1; w <= plan.weeks; w++) {
    const p = phaseOf(plan, w);
    if (out[p]) out[p].to = w;
    else out[p] = { name: PHASE_NAMES[p], from: w, to: w };
  }
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Stufe 1 (sehr leicht) bis 10 (sehr schwer); 5 = Vorgabe des Plans. */
export const LEVEL_DEFAULT = 5;
export const LEVEL_MAX = 10;

/** Satz-/Zeitvorgabe für eine Übung in einer Woche und Stufe (1–10, 5 = Plan). */
export function dose(e: Exercise, a: Answers, phase: number, level: number = LEVEL_DEFAULT): Omit<Step, "exerciseId"> {
  const o = clamp(Math.round(level), 1, LEVEL_MAX) - LEVEL_DEFAULT; // −4 … +5
  const lvl = a.level === "neu" ? 0 : a.level === "manchmal" ? 1 : 2;
  const baseSets = (lvl === 0 ? 2 : 3) + (phase >= 1 && lvl === 0 ? 1 : 0);
  // Stufe 1–2: ein Satz weniger (nie unter zwei – ein einzelner Satz ist kaum ein Training); Stufe 8–10: einer mehr
  const sets = clamp(baseSets + (o <= -3 && baseSets > 2 ? -1 : 0) + (o >= 3 ? 1 : 0), 2, 5);
  if (e.measure === "time") {
    const base = a.goal === "ausdauer" ? 30 : a.goal === "beweglich" ? 40 : 20;
    return { sets, seconds: clamp(base + lvl * 10 + phase * 10 + o * 5, 10, 120) };
  }
  const base = a.goal === "kraft" ? 8 : 10;
  return { sets, reps: clamp(base + lvl * 2 + phase * 2 + o, 4, 25) };
}

/** Geschätzte Sekunden eines Schritts: Ausführung (3 s je Wiederholung) plus 30 s Pause je Satz. */
export function stepSeconds(s: Step): number {
  const work = s.seconds ?? (s.reps ?? 0) * 3;
  return s.sets * (work + 30);
}

const WARMUP_SECONDS = 120;

export function sessionMinutes(steps: Step[]): number {
  return Math.max(1, Math.round((WARMUP_SECONDS + steps.reduce((t, s) => t + stepSeconds(s), 0)) / 60));
}

/** Anzahl Einheiten im ganzen Programm. */
export function totalSessions(plan: Plan): number {
  return plan.weeks * plan.weekdays.length;
}

/** Woche (1-basiert) und Trainingstag der Woche (0-basiert) der Einheit mit diesem Index. */
export function positionOf(plan: Plan, index: number): { week: number; slot: number; weekday: Weekday } {
  const per = plan.weekdays.length;
  const week = Math.floor(index / per) + 1;
  const slot = index % per;
  return { week, slot, weekday: plan.weekdays[slot]! };
}

/**
 * Die Einheit mit diesem Index (0 = erste). Übungen aus dem Schwerpunkt des Tages, bei Beschwerden ersetzt, so viele
 * wie in die gewünschte Zeit passen (mindestens zwei).
 */
export function sessionAt(plan: Plan, index: number, level: number = LEVEL_DEFAULT): Session {
  const a = plan.answers;
  const { week, slot } = positionOf(plan, clamp(index, 0, totalSessions(plan) - 1));
  const kind = plan.slots[slot]!;
  const phase = phaseOf(plan, week);
  // Wechselnde Reihenfolge von Woche zu Woche, damit es nicht immer gleich ist (deterministisch)
  const pool = POOL[kind];
  const rotated = pool.map((_, i) => pool[(i + (week - 1)) % pool.length]!);
  const fallback = POOL[kind === "ganzkoerper" ? "rumpf" : "ganzkoerper"];
  const budget = a.minutes * 60;
  const steps: Step[] = [];
  const used = new Set<string>();
  for (const id of [...rotated, ...fallback]) {
    const rid = resolveExercise(id, a.pain);
    if (!rid || used.has(rid)) continue;
    const e = exerciseById(rid)!;
    // Auswahl nach der normalen Stufe: die Stufe ändert nur Sätze/Wiederholungen, nicht welche Übungen drankommen
    const step: Step = { exerciseId: rid, ...dose(e, a, phase) };
    const next = [...steps, step];
    const secs = WARMUP_SECONDS + next.reduce((t, s) => t + stepSeconds(s), 0);
    if (steps.length >= 2 && secs > budget) break;
    steps.push(step);
    used.add(rid);
    if (steps.length >= 8) break;
  }
  const dosed = level !== LEVEL_DEFAULT ? steps.map((s) => ({ exerciseId: s.exerciseId, ...dose(exerciseById(s.exerciseId)!, a, phase, level) })) : steps;
  return { title: SLOT_LABEL[kind], steps: dosed, minutes: sessionMinutes(dosed) };
}

/** Kurze Begründungen „Warum so?“ – direkt aus den Antworten. */
export function explain(plan: Plan): string[] {
  const a = plan.answers;
  const out: string[] = [];
  out.push(
    a.days <= 3
      ? `${a.days} Tage pro Woche, immer mit Ruhetag dazwischen – Muskeln werden in der Pause stärker.`
      : `${a.days} Tage pro Woche – an aufeinanderfolgenden Tagen trainierst du verschiedene Bereiche.`,
  );
  out.push(
    a.level === "neu"
      ? `Ruhiger Einstieg: ${plan.weeks} Wochen, erst saubere Technik mit 2 Sätzen, ab der Aufbauphase 3 Sätze.`
      : `Du bist schon aktiv – deshalb ab Woche 1 drei Sätze; alle ${Math.round(plan.weeks / 3)} Wochen wird es fordernder.`,
  );
  if (a.pain !== "keine") {
    const removed = EXERCISES.filter((e) => !allowed(e, a.pain)).map((e) => e.name);
    out.push(`Wegen ${PAIN_LABEL[a.pain]}: ohne ${removed.slice(0, 3).join(", ")} – dafür schonende Varianten.`);
  } else {
    out.push("Keine Beschwerden angegeben – volle Übungsauswahl.");
  }
  if (sessionHasTracked(plan)) {
    out.push("Kniebeugen zählt und bewertet die Kamera; die anderen Übungen führst du mit Anleitung und Timer aus.");
  } else {
    out.push("Diese Übungen führst du mit Anleitung und Timer aus – Kamera-Zählung gibt es bisher für Kniebeugen.");
  }
  return out;
}

function sessionHasTracked(plan: Plan): boolean {
  for (let i = 0; i < plan.weekdays.length; i++) {
    if (sessionAt(plan, i).steps.some((s) => exerciseById(s.exerciseId)?.tracked)) return true;
  }
  return false;
}

/** Plausibilitätsprüfung für gespeicherte Antworten (kaputte Daten dürfen nichts stören). */
export function isAnswers(v: unknown): v is Answers {
  if (!v || typeof v !== "object") return false;
  const x = v as Record<string, unknown>;
  return (
    ["alltag", "kraft", "ausdauer", "beweglich"].includes(x.goal as string) &&
    ["neu", "manchmal", "regel"].includes(x.level as string) &&
    [2, 3, 4, 5].includes(x.days as number) &&
    [10, 20, 30, 45].includes(x.minutes as number) &&
    Array.isArray(x.focus) &&
    x.focus.every((f) => ["beine", "rumpf", "oberkoerper", "ganzkoerper"].includes(f as string)) &&
    ["keine", "knie", "ruecken", "schultern"].includes(x.pain as string)
  );
}
