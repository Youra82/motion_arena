/** Anzeige-Werte eines gespeicherten Programms (für Startseite und Programm-Seite). */
import type { StoredProgram } from "../persist";
import { createPlan, positionOf, sessionAt, stepSeconds, totalSessions, type Plan, type Session, type Weekday } from "./planner";

export interface WeekEntry {
  index: number;
  weekday: Weekday;
  title: string;
  minutes: number;
  exercises: number;
  status: "done" | "next" | "open";
}

export interface ProgramView {
  plan: Plan;
  name: string;
  total: number;
  done: number;
  finished: boolean;
  /** Aktuelle Woche (1-basiert) und Tag in der Woche (1-basiert) der nächsten Einheit. */
  week: number;
  dayInWeek: number;
  next: Session;
  nextWeekday: Weekday;
  thisWeek: WeekEntry[];
  doneThisWeek: number;
  /** Umfang je Woche relativ zur stärksten Woche (0..1) – zeigt die Steigerung. */
  weekLoad: number[];
}

export function programView(p: StoredProgram): ProgramView {
  const plan = createPlan(p.answers);
  const total = totalSessions(plan);
  const done = Math.min(p.done, total);
  const finished = done >= total;
  const nextIndex = Math.min(done, total - 1);
  const pos = positionOf(plan, nextIndex);
  const per = plan.weekdays.length;
  const weekStart = (pos.week - 1) * per;
  const thisWeek: WeekEntry[] = plan.weekdays.map((weekday, slot) => {
    const index = weekStart + slot;
    const s = sessionAt(plan, index, p.adjust);
    return {
      index,
      weekday,
      title: s.title,
      minutes: s.minutes,
      exercises: s.steps.length,
      status: index < done ? "done" : index === done && !finished ? "next" : "open",
    };
  });
  const volume = (w: number) => {
    let t = 0;
    for (let k = 0; k < per; k++) t += sessionAt(plan, (w - 1) * per + k, p.adjust).steps.reduce((a, s) => a + stepSeconds(s), 0);
    return t;
  };
  const vols = Array.from({ length: plan.weeks }, (_, i) => volume(i + 1));
  const max = Math.max(...vols, 1);
  return {
    plan,
    name: p.name ?? plan.name,
    total,
    done,
    finished,
    week: pos.week,
    dayInWeek: pos.slot + 1,
    next: sessionAt(plan, nextIndex, p.adjust),
    nextWeekday: pos.weekday,
    thisWeek,
    doneThisWeek: Math.max(0, Math.min(per, done - weekStart)),
    weekLoad: vols.map((v) => v / max),
  };
}
