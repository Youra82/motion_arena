import { summarize, type SessionState } from "./session.js";

/**
 * Fortschritt über mehrere Trainings: reine Funktionen auf gespeicherten Einträgen.
 * Speicherung (localStorage) macht die App; hier nur Berechnung – deterministisch testbar.
 */
export interface TrainingEntry {
  /** Eindeutig je Session (Startzeitpunkt). */
  id: string;
  /** ISO-Zeitpunkt des Endes. */
  date: string;
  exerciseId: "squat";
  reps: number;
  targetReps: number;
  points: number;
  /** Ø Bewertung 0..100 (geschätzt) oder null ohne Wiederholungen. */
  averageScore: number | null;
  bestCombo: number;
  activeSeconds: number;
  /** Ø Anteil der erreichten Punkte je Bewertungsteil (0..1), nur bewertbare Teile. */
  components: Partial<Record<"depth" | "control" | "symmetry" | "posture", number>>;
}

/** Lokaler Kalendertag "YYYY-MM-DD". */
export function dayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Ganze Kalendertage zwischen zwei Daten (lokal, sommerzeitfest). */
function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

/** Zeitpunkt eines Eintrags in ms; NaN bei ungültigem Datum. */
const timeOf = (e: TrainingEntry): number => Date.parse(e.date);

/**
 * Nur gültige, nicht in der Zukunft liegende Einträge zählen (z. B. nach einer Uhrkorrektur am Gerät).
 * Sortiert nach echtem Zeitpunkt, nicht nach ISO-Text (Zeitzonen-Offsets!).
 */
function usable(entries: TrainingEntry[], now: Date): TrainingEntry[] {
  const limit = now.getTime();
  return entries
    .filter((e) => {
      const t = timeOf(e);
      return Number.isFinite(t) && t <= limit;
    })
    .sort((a, b) => timeOf(a) - timeOf(b));
}

/** Eintrag aus einer beendeten Session; null, wenn keine Wiederholung gezählt wurde. */
export function entryFromSession(s: SessionState, end: Date): TrainingEntry | null {
  if (s.reps.length === 0 || s.startedAt === null) return null;
  const sum = summarize(s);
  const acc: Record<string, { got: number; max: number }> = {};
  for (const r of s.reps) {
    for (const c of r.score.components) {
      if (c.points === null) continue;
      const a = (acc[c.key] ??= { got: 0, max: 0 });
      a.got += c.points;
      a.max += c.max;
    }
  }
  const components: TrainingEntry["components"] = {};
  for (const [k, v] of Object.entries(acc)) if (v.max > 0) components[k as keyof TrainingEntry["components"]] = v.got / v.max;
  return {
    id: `${end.getTime()}-${Math.round(s.startedAt)}`,
    date: end.toISOString(),
    exerciseId: "squat",
    reps: sum.reps,
    targetReps: sum.targetReps,
    points: sum.points,
    averageScore: sum.averageScore,
    bestCombo: sum.bestCombo,
    activeSeconds: sum.activeSeconds,
    components,
  };
}

export interface DayStat {
  day: string;
  reps: number;
  points: number;
  trainings: number;
}

export interface ProgressStats {
  totalTrainings: number;
  totalReps: number;
  totalPoints: number;
  /** Aufeinanderfolgende Trainingstage bis heute (oder bis gestern, wenn heute noch nicht trainiert). */
  streakDays: number;
  /** Letzte N Tage, ältester zuerst. */
  recentDays: DayStat[];
  last: TrainingEntry | null;
}

export function progressStats(all: TrainingEntry[], now: Date, days = 14): ProgressStats {
  const entries = usable(all, now);
  const byDay = new Map<string, DayStat>();
  for (const e of entries) {
    const k = dayKey(new Date(e.date));
    const d = byDay.get(k) ?? { day: k, reps: 0, points: 0, trainings: 0 };
    d.reps += e.reps;
    d.points += e.points;
    d.trainings += 1;
    byDay.set(k, d);
  }
  const recentDays: DayStat[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(addDays(now, -i));
    recentDays.push(byDay.get(k) ?? { day: k, reps: 0, points: 0, trainings: 0 });
  }
  let streak = 0;
  let cursor = byDay.has(dayKey(now)) ? now : addDays(now, -1);
  while (byDay.has(dayKey(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return {
    totalTrainings: entries.length,
    totalReps: entries.reduce((a, e) => a + e.reps, 0),
    totalPoints: entries.reduce((a, e) => a + e.points, 0),
    streakDays: streak,
    recentDays,
    last: entries[entries.length - 1] ?? null,
  };
}

export interface WeekPlan {
  /** Montag bis Sonntag der aktuellen Woche. */
  days: Array<{ day: string; label: string; trained: boolean; isToday: boolean; isFuture: boolean }>;
  done: number;
  goal: number;
}

const WEEKDAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

/** Wochenplan: an wie vielen Tagen dieser Woche (Mo–So) trainiert wurde, gemessen am Wochenziel. */
export function weekPlan(all: TrainingEntry[], now: Date, goal = 3): WeekPlan {
  const entries = usable(all, now);
  const trainedDays = new Set(entries.map((e) => dayKey(new Date(e.date))));
  const monday = addDays(now, -((now.getDay() + 6) % 7));
  const today = dayKey(now);
  const days = WEEKDAYS.map((label, i) => {
    const d = addDays(monday, i);
    const k = dayKey(d);
    return { day: k, label, trained: trainedDays.has(k), isToday: k === today, isFuture: d > now && k !== today };
  });
  return { days, done: days.filter((d) => d.trained).length, goal };
}

export interface Challenge {
  title: string;
  /** Tag 1..30 der laufenden Challenge, 0 = noch nicht begonnen. */
  day: number;
  length: number;
  trainedDays: number;
  goalDays: number;
  /** 0..1 Anteil am Ziel. */
  progress: number;
  completed: boolean;
}

/**
 * 30-Tage-Challenge: beginnt mit dem ersten Training und läuft in 30-Tage-Abschnitten weiter.
 * Ziel: an `goalDays` verschiedenen Tagen innerhalb des Abschnitts trainieren.
 */
export function challenge30(all: TrainingEntry[], now: Date, goalDays = 20, length = 30): Challenge {
  const title = "30-Tage-Challenge";
  const entries = usable(all, now);
  if (entries.length === 0) return { title, day: 0, length, trainedDays: 0, goalDays, progress: 0, completed: false };
  const first = new Date(entries[0]!.date);
  const sinceFirst = Math.max(0, daysBetween(first, now));
  const start = addDays(first, Math.floor(sinceFirst / length) * length);
  const day = daysBetween(start, now) + 1;
  const inWindow = new Set(
    entries
      .map((e) => new Date(e.date))
      .filter((d) => {
        const off = daysBetween(start, d);
        return off >= 0 && off < length;
      })
      .map(dayKey),
  );
  const trainedDays = inWindow.size;
  return {
    title,
    day,
    length,
    trainedDays,
    goalDays,
    progress: Math.min(1, trainedDays / goalDays),
    completed: trainedDays >= goalDays,
  };
}

/** Kurze, verständliche Beschreibung der letzten Bewegungsqualität (für die Startseite). */
export function movementSummary(e: TrainingEntry | null): string[] {
  if (!e) return [];
  const c = e.components ?? {}; // ältere/beschädigte Einträge ohne Teilwerte
  const out: string[] = [];
  if (c.depth !== undefined) out.push(c.depth >= 0.85 ? "Tief" : c.depth >= 0.65 ? "Ordentliche Tiefe" : "Mehr Tiefe möglich");
  if (c.control !== undefined) out.push(c.control >= 0.8 ? "Kontrolliert" : "Langsamer absenken");
  if (c.symmetry !== undefined) out.push(c.symmetry >= 0.8 ? "Gleichmäßig" : "Seiten ungleich");
  if (c.posture !== undefined) out.push(c.posture >= 0.8 ? "Aufrecht" : "Oberkörper aufrechter");
  return out;
}
