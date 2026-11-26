import type { RepScore, SessionState } from "@motion-arena/motion-scoring";

export const GUIDE_CYCLE_MS = 3200;
export const CHECK_KEYS = ["posture", "symmetry", "depth"] as const;
export type ArenaChecks = Record<(typeof CHECK_KEYS)[number], "good" | "improve" | "unknown">;

export function arenaChecks(score: RepScore | undefined): ArenaChecks {
  const checks: ArenaChecks = { posture: "unknown", symmetry: "unknown", depth: "unknown" };
  for (const key of CHECK_KEYS) {
    const part = score?.components.find((component) => component.key === key);
    if (part?.points != null && Number.isFinite(part.points) && part.max > 0) {
      checks[key] = part.points >= part.max ? "good" : "improve";
    }
  }
  return checks;
}

/** Bruttoenergie aus gezählten Bewegungszeiten, 3 MET bei einer Referenzmasse von 70 kg. */
export function estimateKcal(reps: SessionState["reps"]): number {
  const movementMs = reps.reduce((sum, { rep }) => {
    const elapsed = rep.endT - rep.startT;
    return sum + (Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0);
  }, 0);
  return Math.round((movementMs / 3_600_000) * 3 * 70 * 10) / 10;
}

export function activeTimeMs(session: SessionState, now: number): number {
  return session.activeMs + (session.status === "running" && session.segmentStart !== null
    ? Math.max(0, now - session.segmentStart)
    : 0);
}

/** Trainingsrhythmus der Vorlage und der synthetischen Demo. */
export function squatFlex(phase: number, depth: number): number {
  const ease = (p: number) => p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
  if (phase < 0.35) return depth * ease(phase / 0.35);
  if (phase < 0.45) return depth;
  if (phase < 0.8) return depth * ease((0.8 - phase) / 0.35);
  return 0;
}
