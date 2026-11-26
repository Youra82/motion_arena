import { describe, expect, it } from "vitest";
import { synthFrame, type SynthOptions } from "@motion-arena/pose-engine";
import { LM, type PoseFrame } from "@motion-arena/shared";
import { BodyLoadAnalyzer, type BodyLoadResult } from "../../src/index.js";

const stand = { view: "front", kneeFlexDeg: 0, arms: "down" } satisfies SynthOptions;
const squat = { ...stand, kneeFlexDeg: 90 };
const stepMs = 40;

function sequence(analyzer: BodyLoadAnalyzer, start: number, count: number, makeFrame: (t: number) => PoseFrame): BodyLoadResult[] {
  return Array.from({ length: count }, (_, i) => analyzer.update(makeFrame(start + i * stepMs)));
}

function hold(options: SynthOptions): BodyLoadResult {
  return sequence(new BodyLoadAnalyzer(), 0, 50, (t) => synthFrame(t, options)).at(-1)!;
}

function reflectImage(frame: PoseFrame): PoseFrame {
  return { ...frame, landmarks: frame.landmarks!.map((p) => ({ ...p, x: 1 - p.x })) };
}

describe("Live Body Load – Klassifikation unter Störungen", () => {
  it("erkennt eine gehaltene Kniebeuge auch seitlich und trennt Stillstand von hoher Last", () => {
    const result = hold({ ...squat, view: "side" });
    expect(result.movement.id).toBe("kniebeuge");
    expect(result.intensity.level).toBe("ruhig");
    expect(result.zones.oberschenkelL.level).toBe("hoch");
    expect(result.zones.oberschenkelR.level).toBe("hoch");
  });

  it("nennt symmetrisches Stehen bei schräger Kamera keinen Einbeinstand", () => {
    // CODEX-BEFUND: Bei 30° Rollwinkel unterscheiden sich die Knöchelhöhen nur wegen der Kamera.
    const r = sequence(new BodyLoadAnalyzer(), 0, 50, (t) => {
      const frame = synthFrame(t, { ...stand, aspect: 1 });
      const c = Math.sqrt(3) / 2;
      frame.worldLandmarks = frame.worldLandmarks!.map((p) => ({
        ...p, x: c * p.x - 0.5 * p.y, y: 0.5 * p.x + c * p.y,
      }));
      frame.landmarks = frame.landmarks!.map((p) => ({
        ...p, x: 0.5 + c * (p.x - 0.5) - 0.5 * (p.y - 0.5), y: 0.5 + 0.5 * (p.x - 0.5) + c * (p.y - 0.5),
      }));
      return frame;
    }).at(-1)!;
    expect(r.movement.id).not.toBe("einbeinstand");
  });

  it("meldet bei alternierenden Schritten keinen stabilen Einbeinstand", () => {
    // CODEX-BEFUND: Das wechselnde Standbein ergibt über mehrere Schrittzyklen dieselbe Bewegungs-ID.
    const results = sequence(new BodyLoadAnalyzer(), 0, 100, (t) => {
      const angle = 80 * Math.sin((2 * Math.PI * t) / 1000);
      const frame = synthFrame(t, { ...stand, aspect: 1, liftLeftKneeDeg: Math.abs(angle) });
      if (angle < 0) {
        const pairs = [[LM.LEFT_KNEE, LM.RIGHT_KNEE], [LM.LEFT_ANKLE, LM.RIGHT_ANKLE],
          [LM.LEFT_HEEL, LM.RIGHT_HEEL], [LM.LEFT_FOOT_INDEX, LM.RIGHT_FOOT_INDEX]] as const;
        for (const points of [frame.landmarks!, frame.worldLandmarks!]) {
          for (const [left, right] of pairs) {
            const a = points[left]!;
            const b = points[right]!;
            points[left] = { ...a, y: b.y, z: b.z };
            points[right] = { ...b, y: a.y, z: a.z };
          }
        }
      }
      return frame;
    });
    expect(results.slice(-25).filter((r) => r.movement.id === "einbeinstand")).toHaveLength(0);
  });

  it("gibt beim Hinsetzen ohne erkennbare Auflage keine sichere Kniebeuge aus", () => {
    // CODEX-BEFUND: Ohne sichtbare Auflage oder Bewegungsbeleg ist die statische Pose mehrdeutig.
    const r = sequence(new BodyLoadAnalyzer(), 0, 100, (t) => {
      const lowering = Math.min(1, Math.max(0, (t - 500) / 850));
      return synthFrame(t, { ...stand, view: "side", kneeFlexDeg: 90 * lowering, extraLeanDeg: -29.7 * lowering });
    }).at(-1)!;
    expect(r.movement.id !== "kniebeuge" || r.movement.confidence < 0.6).toBe(true);
  });

  it("leitet aus Vorbeugen mit gestreckten Beinen keinen Plank ab", () => {
    // CODEX-BEFUND: Die Rumpfneigung allein kann die Stützklassifikation auslösen.
    const r = hold({ ...stand, view: "side", extraLeanDeg: 85 });
    expect(r.movement.id).not.toBe("stuetz");
  });

  it("erkennt schnelles Armschwingen bei unveränderten Beinen nicht als Hampelmann", () => {
    // CODEX-BEFUND: Armspanne und Tempo allein reichen für einen Hampelmann.
    const results = sequence(new BodyLoadAnalyzer(), 0, 100, (t) => {
      const arms = 90 + 75 * Math.sin((2 * Math.PI * t) / 700);
      return synthFrame(t, { ...stand, arms });
    });
    const settled = results.slice(-25);
    expect(settled.some((r) => r.intensity.level === "lebhaft")).toBe(true);
    expect(settled.some((r) => r.movement.id === "hampelmann")).toBe(false);
  });

  it("dämpft einen einzelnen unrealistischen Handgelenk-Ausreißer beim Stillstehen", () => {
    // CODEX-BEFUND: Ein einziger Sprung erzeugt hohe Intensität und wirkt beim Zurückspringen erneut.
    const analyzer = new BodyLoadAnalyzer();
    sequence(analyzer, 0, 25, (t) => synthFrame(t, stand));
    const results = sequence(analyzer, 1000, 6, (t) => {
      const frame = synthFrame(t, stand);
      if (t === 1000) frame.worldLandmarks![LM.LEFT_WRIST]!.x += 6;
      return frame;
    });
    expect(results.some((r) => r.intensity.level === "lebhaft")).toBe(false);
  });

  it("wechselt nach einer stabilen Phase zuverlässig von Kniebeuge zu Stehen", () => {
    const analyzer = new BodyLoadAnalyzer();
    const before = sequence(analyzer, 0, 50, (t) => synthFrame(t, squat));
    const after = sequence(analyzer, 2000, 75, (t) => synthFrame(t, stand));
    expect(before.at(-1)?.movement.id).toBe("kniebeuge");
    expect(after.slice(-10).map((r) => r.movement.id)).toEqual(Array(10).fill("stehen"));
    expect(after.at(-1)?.zones.oberschenkelL.level).toBe("gering");
  });

  it("übernimmt nach einer mehrsekündigen Bildlücke keine Geschwindigkeit aus der alten Bewegung", () => {
    // CODEX-BEFUND: Beim Überspringen der Geschwindigkeitsberechnung bleibt die alte Map aktiv.
    const analyzer = new BodyLoadAnalyzer();
    analyzer.update(synthFrame(0, stand));
    analyzer.update(synthFrame(40, { ...stand, arms: 160 }));
    const r = analyzer.update(synthFrame(3040, stand));
    expect(r.intensity.level).toBe("unsicher");
    expect(analyzer.jointSpeeds().size).toBe(0);
  });
});

describe("Live Body Load – Seiten und Datenqualität", () => {
  it("behält die anatomische Seite bei einer Spiegelung der Bildkoordinaten", () => {
    const options = { ...stand, liftLeftKneeDeg: 80 };
    const frame = synthFrame(0, options);
    const normal = new BodyLoadAnalyzer().update(frame);
    const mirrored = new BodyLoadAnalyzer().update(reflectImage(frame));
    expect(normal.zones.wadeR.value).toBeGreaterThan(normal.zones.wadeL.value);
    expect(mirrored.zones).toEqual(normal.zones);
  });

  it("kennzeichnet beim verdeckten Knöchel davon abhängige Knie- und Wadenzonen als unsicher", () => {
    // CODEX-BEFUND: Die Oberschenkelzone meldet weiterhin ihre alte Last ohne gültigen Kniewinkel.
    const analyzer = new BodyLoadAnalyzer();
    sequence(analyzer, 0, 50, (t) => synthFrame(t, squat));
    const r = analyzer.update(synthFrame(2000, { ...squat, visibility: { [LM.LEFT_ANKLE]: 0.1 } }));
    expect(r.movement.id).toBe("unbekannt");
    expect(r.zones.wadeL.level).toBe("unsicher");
    expect(r.zones.wadeR.level).not.toBe("unsicher");
    expect(r.zones.oberschenkelL.level).toBe("unsicher");
  });

  it("gibt bei NaN in den Weltkoordinaten für im Bild sichtbare betroffene Zonen Unsicherheit aus", () => {
    // CODEX-BEFUND: Die Ausweichlogik meldet für die ungültige Zone weiterhin eine konkrete Stufe.
    const analyzer = new BodyLoadAnalyzer();
    sequence(analyzer, 0, 50, (t) => synthFrame(t, squat));
    const frame = synthFrame(2000, squat);
    frame.worldLandmarks![LM.LEFT_KNEE]!.x = NaN;
    const r = analyzer.update(frame);
    expect(r.movement.confidence).toBe(0);
    expect(r.intensity.level).toBe("unsicher");
    expect(Object.values(r.zones).every((z) => Number.isFinite(z.value))).toBe(true);
    expect(r.zones.oberschenkelL.level).toBe("unsicher");
  });

  it("unterscheidet eine sichtbare 2D-Pose ohne Weltdaten von keiner Person", () => {
    // CODEX-BEFUND: Fehlende 3D-Daten werden als fehlende Person ausgegeben.
    const analyzer = new BodyLoadAnalyzer();
    sequence(analyzer, 0, 50, (t) => synthFrame(t, squat));
    const r = analyzer.update(synthFrame(2000, { ...squat, noWorld: true }));
    expect(r.intensity.level).toBe("unsicher");
    expect(Object.values(r.zones).every((z) => z.level === "unsicher")).toBe(true);
    expect(analyzer.jointSpeeds().size).toBe(0);
    expect(r.movement.id).toBe("unbekannt");
  });
});
