import { COMBO_MIN_SCORE, pointsFor, scoreRep, type RepScore } from "./scoring.js";
import type { RepRecord, SquatEvent } from "./squat.js";

/**
 * Trainings-Session als reiner, serialisierbarer Zustand.
 * Unabhängig von Darstellung/Ansicht: Ansichtswechsel verändert diesen Zustand nicht.
 */
export type SessionStatus = "idle" | "running" | "paused" | "finished";

export interface ScoredRep {
  rep: RepRecord;
  score: RepScore;
  points: number;
  comboAfter: number;
}

export interface SessionNotice {
  t: number;
  kind: "shallow" | "too-fast" | "tracking-lost" | "tracking-restored";
  text: string;
}

export interface SessionState {
  exerciseId: "squat";
  status: SessionStatus;
  targetReps: number;
  reps: ScoredRep[];
  points: number;
  combo: number;
  bestCombo: number;
  notices: SessionNotice[];
  startedAt: number | null;
  /** Summe der aktiven Trainingszeit (ohne Pausen) in ms. */
  activeMs: number;
  /** Beginn des aktuellen aktiven Abschnitts. */
  segmentStart: number | null;
  finishedAt: number | null;
}

export function createSession(targetReps = 10): SessionState {
  return {
    exerciseId: "squat",
    status: "idle",
    targetReps,
    reps: [],
    points: 0,
    combo: 0,
    bestCombo: 0,
    notices: [],
    startedAt: null,
    activeMs: 0,
    segmentStart: null,
    finishedAt: null,
  };
}

export function startSession(s: SessionState, now: number): SessionState {
  if (s.status !== "idle") return s;
  return { ...s, status: "running", startedAt: now, segmentStart: now };
}

export function pauseSession(s: SessionState, now: number): SessionState {
  if (s.status !== "running") return s;
  return { ...s, status: "paused", activeMs: s.activeMs + (now - (s.segmentStart ?? now)), segmentStart: null };
}

export function resumeSession(s: SessionState, now: number): SessionState {
  if (s.status !== "paused") return s;
  return { ...s, status: "running", segmentStart: now };
}

export function finishSession(s: SessionState, now: number): SessionState {
  if (s.status === "finished" || s.status === "idle") return s;
  const activeMs = s.status === "running" ? s.activeMs + (now - (s.segmentStart ?? now)) : s.activeMs;
  return { ...s, status: "finished", activeMs, segmentStart: null, finishedAt: now };
}

const NOTICE_TEXT: Record<SessionNotice["kind"], string> = {
  shallow: "Zu flach – nicht gezählt. Etwas tiefer gehen.",
  "too-fast": "Zu schnell – nicht gezählt. Kontrolliert bewegen.",
  "tracking-lost": "Körper nicht sicher erkannt – Versuch pausiert, keine Wertung.",
  "tracking-restored": "Wieder erkannt. Aufrecht hinstellen, dann weiter.",
};

/**
 * Verarbeitet Zähler-Ereignisse. Nur im Status "running" wirksam.
 * Erkennungsprobleme erzeugen nie Strafpunkte und brechen keine Combo.
 */
export function applySquatEvents(s: SessionState, events: SquatEvent[]): SessionState {
  if (s.status !== "running" || events.length === 0) return s;
  let next = s;
  for (const e of events) {
    switch (e.type) {
      case "rep": {
        const score = scoreRep(e.rep);
        const combo = score.total >= COMBO_MIN_SCORE ? next.combo + 1 : 0;
        const raw = pointsFor(score.total, combo);
        // Letzte Schutzlinie: nur endliche Werte verbuchen.
        const points = Number.isFinite(raw) ? raw : 0;
        const scored: ScoredRep = { rep: { ...e.rep, index: next.reps.length + 1 }, score, points, comboAfter: combo };
        next = {
          ...next,
          reps: [...next.reps, scored],
          points: next.points + points,
          combo,
          bestCombo: Math.max(next.bestCombo, combo),
        };
        break;
      }
      case "shallow":
      case "too-fast":
        // Fehlversuch: keine Punkte, Combo endet.
        next = { ...next, combo: 0, notices: [...next.notices, { t: e.t, kind: e.type, text: NOTICE_TEXT[e.type] }] };
        break;
      case "tracking-lost":
      case "tracking-restored":
        next = { ...next, notices: [...next.notices, { t: e.t, kind: e.type, text: NOTICE_TEXT[e.type] }] };
        break;
    }
  }
  return next;
}

export interface SessionSummary {
  reps: number;
  targetReps: number;
  points: number;
  averageScore: number | null;
  bestCombo: number;
  activeSeconds: number;
  failedAttempts: number;
  trackingInterruptions: number;
}

export function summarize(s: SessionState): SessionSummary {
  const scores = s.reps.map((r) => r.score.total);
  return {
    reps: s.reps.length,
    targetReps: s.targetReps,
    points: s.points,
    averageScore: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    bestCombo: s.bestCombo,
    activeSeconds: Math.round(s.activeMs / 1000),
    failedAttempts: s.notices.filter((n) => n.kind === "shallow" || n.kind === "too-fast").length,
    trackingInterruptions: s.notices.filter((n) => n.kind === "tracking-lost").length,
  };
}
