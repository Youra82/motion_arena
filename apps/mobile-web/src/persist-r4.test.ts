import type { TrainingEntry } from "@motion-arena/motion-scoring";
import { afterEach, expect, it, vi } from "vitest";
import { loadHistory } from "./persist";

afterEach(() => vi.unstubAllGlobals());

it("wendet dieselbe Aufbewahrungsgrenze auf bereits gespeicherte größere Verläufe an", () => {
  // CODEX-BEFUND: Beim Schreiben wird gekappt, beim Lesen älterer Bestände greift das Limit nicht.
  const entries: TrainingEntry[] = Array.from({ length: 1001 }, (_, i) => ({
    id: String(i), date: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), exerciseId: "squat",
    reps: 5, targetReps: 10, points: 400, averageScore: 80, bestCombo: 1, activeSeconds: 20, components: {},
  }));
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(entries) });
  const loaded = loadHistory();
  expect(loaded).toHaveLength(1000);
  expect(loaded[0]?.id).toBe(entries[1]?.id);
});
