import { describe, expect, it } from "vitest";
import {
  Calibrator,
  LandmarkSmoother,
  assessSquatQuality,
  extractSquatFeatures,
  seededRng,
  synthFrame,
  synthSequence,
} from "@motion-arena/pose-engine";
import { LM } from "@motion-arena/shared";

const front = { view: "front" } as const;
const side = { view: "side" } as const;
const shoulders = [LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER];
const legs = [LM.LEFT_HIP, LM.LEFT_KNEE, LM.LEFT_ANKLE, LM.RIGHT_HIP, LM.RIGHT_KNEE, LM.RIGHT_ANKLE];

describe("Erkennungsqualität und Merkmalsextraktion", () => {
  it.each([0, 28, 32])("wertet eine auf %i Bild-Landmarks gekürzte Pose als nicht erkannt", (length) => {
    const frame = synthFrame(0, { ...front, kneeFlexDeg: 65 });
    frame.landmarks = frame.landmarks!.slice(0, length);
    expect(assessSquatQuality(frame.landmarks)).toEqual({ status: "no-person", confidence: 0, missing: [] });
    expect(extractSquatFeatures(frame)).toMatchObject({ kneeAngle: null, hipY: null });
  });

  it("nutzt keine Knöchel mit NaN und Infinity in den Bildkoordinaten", () => {
    const frame = synthFrame(0, { ...front, kneeFlexDeg: 65 });
    frame.landmarks![LM.LEFT_ANKLE]!.x = Number.NaN;
    frame.landmarks![LM.RIGHT_ANKLE]!.y = Number.POSITIVE_INFINITY;
    expect(assessSquatQuality(frame.landmarks)).toMatchObject({ status: "partial", missing: ["Füße"] });
    expect(extractSquatFeatures(frame).kneeAngle).toBeNull();
  });

  it("weist den Status ok zurück, wenn ein ungültiger Schulterwert die Konfidenz zu NaN macht", () => {
    const frame = synthFrame(0, { ...front, kneeFlexDeg: 0 });
    for (const i of [...legs, LM.LEFT_SHOULDER]) frame.landmarks![i]!.visibility = 0.55;
    frame.landmarks![LM.RIGHT_SHOULDER]!.visibility = Number.NaN;
    const quality = assessSquatQuality(frame.landmarks);
    // CODEX-BEFUND: NaN im Mittelwert umgeht die Mindestkonfidenz und liefert ok.
    expect(quality.status).not.toBe("ok");
    expect(Number.isFinite(quality.confidence)).toBe(true);
  });

  it("lässt unendliche Sichtbarkeit bei einer sonst unsicheren Pose nicht als hohe Konfidenz gelten", () => {
    const frame = synthFrame(0, { ...front, kneeFlexDeg: 0 });
    for (const i of [...legs, ...shoulders]) frame.landmarks![i]!.visibility = 0.55;
    frame.landmarks![LM.LEFT_KNEE]!.visibility = Number.POSITIVE_INFINITY;
    const quality = assessSquatQuality(frame.landmarks);
    // CODEX-BEFUND: Infinity passiert die Sichtbarkeitsschwelle und hebt die Konfidenz auf Infinity.
    expect(quality.status).not.toBe("ok");
    expect(Number.isFinite(quality.confidence)).toBe(true);
  });

  it("rechnet eine außerhalb des Bildes liegende Schulter nicht zur Konfidenz", () => {
    const frame = synthFrame(0, { ...front, kneeFlexDeg: 0 });
    for (const i of legs) frame.landmarks![i]!.visibility = 0.6;
    frame.landmarks![LM.LEFT_SHOULDER]!.visibility = 0.55;
    Object.assign(frame.landmarks![LM.RIGHT_SHOULDER]!, { x: 1.2, visibility: 0.99 });
    // CODEX-BEFUND: Der nicht verwendbare Punkt hebt eine unsichere Pose über die Schwelle.
    expect(assessSquatQuality(frame.landmarks).status).toBe("low-confidence");
  });

  it("liefert bei einem nicht endlichen Welt-Landmark keinen NaN-Kniewinkel", () => {
    const frame = synthFrame(0, { ...side, kneeFlexDeg: 75 });
    frame.worldLandmarks![LM.LEFT_KNEE]!.z = Number.NEGATIVE_INFINITY;
    const features = extractSquatFeatures(frame);
    // CODEX-BEFUND: Fehlerhafte 3D-Geometrie verhindert den 2D-Fallback.
    expect(Number.isNaN(features.kneeAngleL)).toBe(false);
    expect(Number.isNaN(features.kneeAngle)).toBe(false);
  });

  it("lässt einen Welt-Knöchel mit Sichtbarkeit null nicht den 2D-Kniewinkel überschreiben", () => {
    const frame = synthFrame(0, { ...side, kneeFlexDeg: 75 });
    const knee = frame.worldLandmarks![LM.LEFT_KNEE]!;
    const hip = frame.worldLandmarks![LM.LEFT_HIP]!;
    frame.worldLandmarks![LM.LEFT_ANKLE] = {
      x: 2 * knee.x - hip.x, y: 2 * knee.y - hip.y, z: 2 * knee.z - hip.z, visibility: 0,
    };
    // CODEX-BEFUND: Der unzuverlässige Weltpunkt streckt rechnerisch das gebeugte Knie.
    expect(extractSquatFeatures(frame).kneeAngleL).toBeCloseTo(105, 3);
  });

  it("erhält beim Spiegeln der 2D-Ansicht anatomische Seiten und Winkel", () => {
    const frame = synthFrame(0, { ...side, noWorld: true, kneeFlexDeg: 85, rightKneeOffsetDeg: 22 });
    const original = extractSquatFeatures(frame);
    const reflected = extractSquatFeatures({
      ...frame, landmarks: frame.landmarks!.map((p) => ({ ...p, x: 1 - p.x })),
    });
    expect(original.kneeAngleL).toBeCloseTo(95, 3);
    expect(original.kneeAngleR).toBeCloseTo(117, 3);
    expect(reflected.kneeAngleL).toBeCloseTo(original.kneeAngleL!, 8);
    expect(reflected.kneeAngleR).toBeCloseTo(original.kneeAngleR!, 8);
    expect(reflected.torsoLeanDeg).toBeCloseTo(original.torsoLeanDeg!, 8);
  });

  it("erholt sich bei der Glättung nach einem NaN-Bildpunkt im nächsten gültigen Frame", () => {
    const smoother = new LandmarkSmoother();
    const standing = synthFrame(0, { ...front, kneeFlexDeg: 0 }).landmarks!;
    const invalid = standing.map((point) => ({ ...point }));
    invalid[LM.LEFT_ANKLE]!.x = Number.NaN;
    smoother.smooth(standing, 0);
    smoother.smooth(invalid, 40);
    // CODEX-BEFUND: Der Filter speichert NaN und macht auch die folgenden gültigen Werte unbrauchbar.
    expect(smoother.smooth(standing, 80)?.[LM.LEFT_ANKLE]?.x).toBeCloseTo(standing[LM.LEFT_ANKLE]!.x, 8);
  });
});

describe("Kalibrierung mit realistischen Unterbrechungen", () => {
  it("erfordert nach einem abgeschnittenen Frame erneut ruhige Standzeit", () => {
    const c = new Calibrator();
    const camera = { ...front, noise: 0.002, rng: seededRng(921) };
    const standing = (start: number, ms: number) => synthSequence([{ ms, toFlex: 0 }], camera, 25, start);
    for (const frame of standing(0, 1400)) c.update(extractSquatFeatures(frame));
    const cropped = synthFrame(1440, { ...camera, kneeFlexDeg: 0, groundY: 1.16 });
    expect(c.update(extractSquatFeatures(cropped))).toMatchObject({ phase: "waiting", progress: 0 });
    for (const frame of standing(1480, 1200)) c.update(extractSquatFeatures(frame));
    expect(c.calibration).toBeNull();
    for (const frame of standing(2720, 500)) c.update(extractSquatFeatures(frame));
    expect(c.calibration?.standingKneeAngle).toBeCloseTo(180, 3);
  });

  it("kalibriert keine durchgehend tiefe frontale Hocke ohne Weltkoordinaten", () => {
    const c = new Calibrator();
    const frames = synthSequence([{ ms: 2000, toFlex: 85 }], { ...front, noWorld: true }, 25, 0, 85);
    for (const frame of frames) c.update(extractSquatFeatures(frame));
    // CODEX-BEFUND: Frontale 2D-Projektion lässt stark gebeugte Knie gestreckt erscheinen.
    expect(c.calibration).toBeNull();
  });

  it("kalibriert nicht aus zwei Standbildern mit dazwischenliegender Kameralücke", () => {
    const c = new Calibrator();
    const standing = (t: number) => extractSquatFeatures(synthFrame(t, { ...front, kneeFlexDeg: 0 }));
    c.update(standing(0));
    c.update(standing(3500));
    // CODEX-BEFUND: Zwei Bilder belegen keinen durchgehenden ruhigen Stand.
    expect(c.calibration).toBeNull();
  });

  it("liefert bei einem rückwärts laufenden Zeitstempel einen gültigen Fortschrittswert", () => {
    const c = new Calibrator();
    const standing = (t: number) => extractSquatFeatures(synthFrame(t, { ...front, kneeFlexDeg: 0 }));
    c.update(standing(600));
    expect(c.update(standing(600)).progress).toBe(0);
    // CODEX-BEFUND: Die Zeitdifferenz wird nur nach oben begrenzt und ergibt negativen Fortschritt.
    expect(c.update(standing(550)).progress).toBeGreaterThanOrEqual(0);
  });

  it.todo("FRAGE: Darf gleichmäßiges seitliches Wandern vor der Kamera als ruhiger Stand kalibriert werden?");
});
