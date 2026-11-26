import { describe, expect, it } from "vitest";
import { LM } from "@motion-arena/shared";
import { synthFrame, type SynthOptions } from "@motion-arena/pose-engine";
import { BodyLoadAnalyzer, type BodyLoadResult, type LoadLevel } from "../src/index.js";

type Pose = Omit<SynthOptions, "view"> & { view?: SynthOptions["view"] };

/** Hält eine Pose 2 s (30 fps) und liefert das letzte Ergebnis. */
function hold(p: Pose, ms = 2000): BodyLoadResult {
  const a = new BodyLoadAnalyzer();
  let r!: BodyLoadResult;
  for (let t = 0; t <= ms; t += 33) r = a.update(synthFrame(t, { view: "front", ...p }));
  return r;
}

const rank: Record<LoadLevel, number> = { unsicher: -1, gering: 0, mittel: 1, hoch: 2 };
const atLeast = (l: LoadLevel, min: LoadLevel) => rank[l] >= rank[min];

describe("Live Body Load – Bewegungserkennung und Zonen", () => {
  it("ruhiges Stehen: alles gering, Intensität ruhig", () => {
    const r = hold({ kneeFlexDeg: 0, arms: "down" });
    expect(r.movement.id).toBe("stehen");
    expect(r.intensity.level).toBe("ruhig");
    for (const z of Object.values(r.zones)) expect(z.level).toBe("gering");
  });

  it("Kniebeuge gehalten: Oberschenkel hoch, Gesäß und Rumpf mindestens mittel", () => {
    const r = hold({ kneeFlexDeg: 90 });
    expect(r.movement.id).toBe("kniebeuge");
    expect(r.zones.oberschenkelL.level).toBe("hoch");
    expect(r.zones.oberschenkelR.level).toBe("hoch");
    expect(atLeast(r.zones.gesaessL.level, "mittel")).toBe(true);
    expect(atLeast(r.zones.rumpf.level, "mittel")).toBe(true);
    // Arme waagerecht nach vorn gehalten: Schultern arbeiten mäßig mit, aber nicht stark.
    expect(r.zones.schulterL.level).not.toBe("hoch");
  });

  it("Einbeinstand: Standbein (rechts), Hüfte und Rumpf stärker als die angehobene Seite", () => {
    const r = hold({ kneeFlexDeg: 0, liftLeftKneeDeg: 80, arms: "down" });
    expect(r.movement.id).toBe("einbeinstand");
    expect(atLeast(r.zones.gesaessR.level, "mittel")).toBe(true);
    expect(atLeast(r.zones.wadeR.level, "mittel")).toBe(true);
    expect(atLeast(r.zones.rumpf.level, "mittel")).toBe(true);
    expect(r.zones.gesaessR.value).toBeGreaterThan(r.zones.gesaessL.value);
    expect(r.zones.wadeR.value).toBeGreaterThan(r.zones.wadeL.value);
  });

  it("Ausfallschritt links vorn: vorderes Bein hoch, Rumpf stabilisiert", () => {
    const r = hold({ kneeFlexDeg: 0, lunge: 0.9, arms: "down" });
    expect(r.movement.id).toBe("ausfallschritt");
    expect(r.zones.oberschenkelL.level).toBe("hoch");
    expect(atLeast(r.zones.gesaessL.level, "mittel")).toBe(true);
    expect(atLeast(r.zones.rumpf.level, "mittel")).toBe(true);
  });

  it("Stütz/Plank: Rumpf hoch, Schultern und Arme mindestens mittel", () => {
    const r = hold({ kneeFlexDeg: 0, pitchDeg: 80 });
    expect(r.movement.id).toBe("stuetz");
    expect(r.zones.rumpf.level).toBe("hoch");
    expect(atLeast(r.zones.schulterL.level, "mittel")).toBe(true);
    expect(atLeast(r.zones.armR.level, "mittel")).toBe(true);
  });

  it("Arme seitlich über Kopf (langsam): Schultern mittel+, Beine gering", () => {
    const r = hold({ kneeFlexDeg: 0, arms: 160 });
    expect(r.movement.id).toBe("armheben");
    expect(atLeast(r.zones.schulterL.level, "mittel")).toBe(true);
    expect(r.zones.oberschenkelL.level).toBe("gering");
  });

  it("Hampelmann: schnell wechselnd → lebhaft, Schultern mittel+", () => {
    const a = new BodyLoadAnalyzer();
    let r!: BodyLoadResult;
    for (let t = 0; t <= 4000; t += 33) {
      const ph = (Math.sin((t / 700) * Math.PI * 2) + 1) / 2; // 0..1, Periode 0,7 s
      r = a.update(synthFrame(t, { view: "front", kneeFlexDeg: 0, arms: 15 + 155 * ph, legSpreadDeg: 18 * ph }));
    }
    expect(r.movement.id).toBe("hampelmann");
    expect(r.intensity.level).toBe("lebhaft");
    expect(atLeast(r.zones.schulterL.level, "mittel")).toBe(true);
    expect(atLeast(r.zones.schulterR.level, "mittel")).toBe(true);
  });

  it("verdeckte Füße: Wadenzonen unsicher, Bewegung nicht bewertet", () => {
    const r = hold({ kneeFlexDeg: 0, arms: "down", visibility: { [LM.LEFT_ANKLE]: 0.1, [LM.RIGHT_ANKLE]: 0.1 } });
    expect(r.movement.id).toBe("unbekannt");
    expect(r.zones.wadeL.level).toBe("unsicher");
    expect(r.zones.wadeR.level).toBe("unsicher");
    expect(r.intensity.level).toBe("unsicher");
  });

  it("keine Person: alles unsicher", () => {
    const r = new BodyLoadAnalyzer().update({ t: 0, landmarks: null, worldLandmarks: null, aspect: 1 });
    expect(r.movement.id).toBe("keine-person");
    expect(Object.values(r.zones).every((z) => z.level === "unsicher")).toBe(true);
  });

  it("Stufen flackern nicht an der Grenze (Hysterese)", () => {
    const a = new BodyLoadAnalyzer();
    const levels: string[] = [];
    for (let t = 0; t <= 4000; t += 33) {
      const flex = 46 + 4 * Math.sin(t / 60); // Oberschenkelwert pendelt um die Grenze gering/mittel
      levels.push(a.update(synthFrame(t, { view: "front", kneeFlexDeg: flex, arms: "down" })).zones.oberschenkelL.level);
    }
    const changes = levels.slice(30).filter((l, i, arr) => i > 0 && l !== arr[i - 1]).length;
    expect(changes).toBeLessThanOrEqual(2);
  });
});
