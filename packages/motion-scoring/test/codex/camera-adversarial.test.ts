import { describe, expect, it } from "vitest";
import {
  Calibrator,
  extractSquatFeatures,
  seededRng,
  synthFrame,
  synthSequence,
  type SynthOptions,
} from "@motion-arena/pose-engine";
import { LM, type PoseFrame } from "@motion-arena/shared";
import {
  SquatCounter,
  applySquatEvents,
  createSession,
  pauseSession,
  resumeSession,
  startSession,
} from "../../src/index.js";

type Camera = Omit<SynthOptions, "kneeFlexDeg">;
const front = { view: "front" } as const;
const cycle = [
  { ms: 1200, toFlex: 100 },
  { ms: 270, toFlex: 100 },
  { ms: 960, toFlex: 0 },
  { ms: 250, toFlex: 0 },
];
const ankleOcclusion = { [LM.LEFT_ANKLE]: 0.1, [LM.RIGHT_ANKLE]: 0.1 };

function counterFor(camera: Camera = front) {
  const calibrator = new Calibrator();
  const standing = synthSequence([{ ms: 1750, toFlex: 0 }], camera, 24);
  for (const frame of standing) calibrator.update(extractSquatFeatures(frame));
  const calibration = calibrator.calibration;
  if (calibration === null) throw new Error("Standpose konnte nicht kalibriert werden");
  return new SquatCounter(calibration);
}

function eventsFor(counter: SquatCounter, frames: PoseFrame[]) {
  return frames.flatMap((frame) => counter.update(extractSquatFeatures(frame)).events);
}

function pose(t: number, flex = 0, camera: Camera = front) {
  return synthFrame(t, { ...camera, kneeFlexDeg: flex });
}

describe("Kniebeugen unter wechselnden Kamerabedingungen", () => {
  it("zählt drei seitliche 2D-Kniebeugen mit Rauschen und unregelmäßiger Framerate", () => {
    const rng = seededRng(829);
    const camera = { view: "side", noWorld: true } as const;
    const frames = synthSequence([...cycle, ...cycle, ...cycle], { ...camera, noise: 0.0035, rng }, 60, 2000);
    const sampled: PoseFrame[] = [];
    let nextT = 2000;
    for (const frame of frames) {
      if (frame.t < nextT) continue;
      sampled.push(frame);
      nextT = frame.t + 17 + 68 * rng();
    }
    const counter = counterFor(camera);
    expect(eventsFor(counter, sampled).map((event) => event.type)).toEqual(["rep", "rep", "rep"]);
    expect(counter.repCount).toBe(3);
  });

  it("hält die Phase bei Zittern an der Start- und Umkehrschwelle", () => {
    const counter = counterFor();
    const flexes = [0, 27, 29, 27, 29, 27, 44, 43, 44, 43, 35, 36, 35, 36];
    const updates = flexes.map((flex, i) => counter.update(extractSquatFeatures(pose(2000 + i * 95, flex))));
    expect(updates[1]?.phase).toBe("standing");
    expect(updates[2]?.phase).toBe("descending");
    expect(updates[3]?.phase).toBe("descending");
    expect(updates[9]?.phase).toBe("descending");
    expect(updates[10]?.phase).toBe("ascending");
    expect(updates.slice(10).map((update) => update.phase)).toEqual(Array(4).fill("ascending"));
    expect(updates.flatMap((update) => update.events)).toEqual([]);
  });

  it("zählt bei seitlichem Wandern weiter, solange die Gelenke im Bild bleiben", () => {
    const counter = counterFor();
    const frames = synthSequence([...cycle, ...cycle, ...cycle], front, 24, 2000);
    for (const frame of frames) {
      const shift = 0.22 * Math.sin((frame.t - 2000) / 800);
      for (const point of frame.landmarks!) point.x += shift;
    }
    expect(eventsFor(counter, frames).map((event) => event.type)).toEqual(["rep", "rep", "rep"]);
  });

  it("zählt eine sehr tiefe Bewegung erst beim Wiederaufrichten", () => {
    const counter = counterFor();
    const down = synthSequence([{ ms: 1700, toFlex: 145 }, { ms: 450, toFlex: 145 }], front, 24, 2000);
    const up = synthSequence([{ ms: 1400, toFlex: 0 }], front, 24, 4200, 145);
    expect(eventsFor(counter, down)).toEqual([]);
    const events = eventsFor(counter, up);
    expect(events).toEqual([expect.objectContaining({
      type: "rep",
      rep: expect.objectContaining({ minKneeAngle: expect.closeTo(35, 3) }),
    })]);
  });

  it("wartet beim Start in der Hocke auf den Stand und zählt den nächsten ganzen Zyklus", () => {
    const counter = counterFor();
    const up = synthSequence([{ ms: 900, toFlex: 0 }], front, 21, 2000, 115);
    expect(eventsFor(counter, up)).toEqual([]);
    expect(eventsFor(counter, synthSequence(cycle, front, 21, 3000)).map((event) => event.type)).toEqual(["rep"]);
  });

  it("zählt eine seitliche Kniebeuge bei durchgehend verdeckter rechter Seite ohne Symmetriewertung", () => {
    const camera = { view: "side" } as const;
    const occluded = {
      ...camera,
      visibility: { [LM.RIGHT_HIP]: 0.1, [LM.RIGHT_KNEE]: 0.1, [LM.RIGHT_ANKLE]: 0.1 },
    };
    const s = applySquatEvents(startSession(createSession(), 2000),
      eventsFor(counterFor(camera), synthSequence(cycle, occluded, 24, 2000)));
    expect(s.reps).toHaveLength(1);
    expect(s.reps[0]?.score.components.find(({ key }) => key === "symmetry")?.points).toBeNull();
  });

  it("zählt keine Kniebeuge, wenn eine stehende Person sich entfernt und zurückkommt", () => {
    const counter = counterFor();
    const frames = Array.from({ length: 65 }, (_, i) =>
      pose(2000 + 40 * i, 0, { ...front, scale: 0.75 - 0.29 * Math.sin(Math.PI * i / 64) }));
    // CODEX-BEFUND: Die absolute Hüftposition erzeugt aus reiner Skalierung eine Beugung.
    expect(eventsFor(counter, frames).filter(({ type }) => type === "rep")).toHaveLength(0);
  });

  it("zählt drei ganze Kniebeugen, wenn sich der Abstand während der ersten ändert", () => {
    const counter = counterFor();
    const frames = synthSequence([...cycle, ...cycle, ...cycle], front, 24, 2000);
    for (const frame of frames) {
      const scale = 1 - 0.2 * Math.min(1, (frame.t - 2000) / 2100);
      for (const point of frame.landmarks!) {
        point.x = 0.5 + (point.x - 0.5) * scale;
        point.y = 0.92 + (point.y - 0.92) * scale;
      }
    }
    // CODEX-BEFUND: Der neue Stand erreicht die kalibrierte obere Schwelle nicht mehr.
    expect(eventsFor(counter, frames).filter(({ type }) => type === "rep")).toHaveLength(3);
  });

  it("lässt einen einzigen plausibel aussehenden Tiefen-Ausreißer im Stand keinen Fehlversuch auslösen", () => {
    const counter = counterFor();
    const frames = Array.from({ length: 28 }, (_, i) => pose(2000 + i * 50, i === 10 ? 100 : 0));
    // CODEX-BEFUND: Der einzelne Ausreißer erzeugt aus Stillstand einen Fehlversuch.
    expect(eventsFor(counter, frames)).toEqual([]);
  });

  it("macht aus einem kurzen Zittern an der Top-Schwelle keine zweite Wiederholung", () => {
    const counter = counterFor();
    const flexes = [0, 36, 72, 95, 95, 91, 83, 65, 43, 18, 16, 18, 16, 18, 16, 0];
    const events = eventsFor(counter, flexes.map((flex, i) => pose(2000 + 140 * i, flex)));
    expect(events.map(({ type }) => type)).toEqual(["rep"]);
  });

  it("bestraft eine seitlich kalibrierte 2D-Wiederholung nach Drehung zur Kamera nicht als zu flach", () => {
    const side2d = { view: "side", noWorld: true } as const;
    const frontal2d = { view: "front", noWorld: true } as const;
    const counter = counterFor(side2d);
    const before = applySquatEvents(startSession(createSession(), 2000),
      eventsFor(counter, synthSequence(cycle, side2d, 24, 2000)));
    expect(before.combo).toBe(1);
    const attempt = [
      ...synthSequence([{ ms: 370, toFlex: 34 }], side2d, 24, 4800),
      ...synthSequence([{ ms: 650, toFlex: 85 }, { ms: 970, toFlex: 0 }], frontal2d, 24, 5210, 34),
    ];
    const after = applySquatEvents(before, eventsFor(counter, attempt));
    // CODEX-BEFUND: Der frontal projizierte 2D-Winkel wird weiter wie ein Seitenwinkel verwendet.
    expect.soft(after.notices.map(({ kind }) => kind)).not.toContain("shallow");
    expect(after.combo).toBeGreaterThanOrEqual(before.combo);
  });
});

describe("Zeitstempel, Erkennungslücken und Session", () => {
  it("zählt mit kurzer beidseitiger Verdeckung ohne Warnung weiter", () => {
    const frames = synthSequence(cycle, front, 25, 2000);
    for (const frame of frames.filter(({ t }) => t >= 3170 && t <= 3370)) {
      for (const ankle of [LM.LEFT_ANKLE, LM.RIGHT_ANKLE]) frame.landmarks![ankle]!.visibility = 0;
    }
    expect(eventsFor(counterFor(), frames).map(({ type }) => type)).toEqual(["rep"]);
  });

  it("warnt bei längerem Teilkörper und bewahrt Punkte und Combo", () => {
    const counter = counterFor();
    const session = applySquatEvents(startSession(createSession(), 2000),
      eventsFor(counter, synthSequence(cycle, front, 25, 2000)));
    expect(session.combo).toBe(1);
    const down = synthSequence([{ ms: 900, toFlex: 90 }], front, 25, 4800);
    const cropped = synthSequence([{ ms: 680, toFlex: 0 }],
      { ...front, visibility: ankleOcclusion }, 25, 5800, 90);
    const events = eventsFor(counter, [...down, ...cropped, pose(6600)]);
    expect(events.map(({ type }) => type)).toEqual(["tracking-lost", "tracking-restored"]);
    expect(events[0]).toMatchObject({ abortedRep: true, missing: ["Füße"] });
    const after = applySquatEvents(session, events);
    expect(after).toMatchObject({ reps: session.reps, combo: session.combo, points: session.points });
  });

  it.each([false, true])("zählt über eine lange Kameralücke keine Wiederholung (Teilkörper-Frame: %s)", (partialFrame) => {
    const counter = counterFor();
    const down = synthSequence([{ ms: 1050, toFlex: 95 }], front, 25, 2000);
    const partial = partialFrame ? [pose(3120, 95, { ...front, visibility: ankleOcclusion })] : [];
    // CODEX-BEFUND: Der nächste gültige Frame setzt den Versuch trotz langer Lücke fort.
    expect(eventsFor(counter, [...down, ...partial, pose(5000, 25), pose(5040)])
      .filter(({ type }) => type === "rep")).toHaveLength(0);
  });

  it("lässt einen Frame mit doppeltem Zeitstempel keine Bewegung starten", () => {
    const frames = [pose(2000), pose(2000, 100),
      ...synthSequence([{ ms: 760, toFlex: 0 }], front, 25, 2040)];
    // CODEX-BEFUND: Das Duplikat startet einen Versuch, der anschließend als zu schnell gilt.
    expect(eventsFor(counterFor(), frames)).toEqual([]);
  });

  it("ignoriert einen rückwärts datierten Tiefpunkt, damit die Absenkzeit gültig bleibt", () => {
    const down = synthSequence([{ ms: 1000, toFlex: 91 }], front, 25, 2000);
    const up = synthSequence([{ ms: 1000, toFlex: 0 }], front, 25, 3040, 91);
    const events = eventsFor(counterFor(), [...down, pose(1950, 125), ...up]);
    const rep = events.find((event) => event.type === "rep")?.rep;
    expect(rep).toBeDefined();
    // CODEX-BEFUND: Das verspätete Bild überschreibt den Tiefpunkt mit einer Zeit vor dem Start.
    expect(rep!.bottomT).toBeGreaterThanOrEqual(rep!.startT);
  });

  it("erkennt den einzigen Stand-Frame bei einem ausgelassenen Zwischenbild im Aufstieg", () => {
    const counter = counterFor();
    const frames = synthSequence([{ ms: 1190, toFlex: 95 }, { ms: 280, toFlex: 25 }], front, 25, 2000);
    const lastT = frames.at(-1)!.t;
    expect(eventsFor(counter, frames)).toEqual([]);
    // Der Aufstieg hat bereits begonnen. Hier fehlt kein weiterer Stand-Frame.
    expect(eventsFor(counter, [pose(lastT + 80)])).toEqual([expect.objectContaining({ type: "rep" })]);
  });

  it("verwirft bei Pause mit resetMotion den angebrochenen Versuch und bewahrt die Session", () => {
    const counter = counterFor();
    const before = applySquatEvents(startSession(createSession(), 2000),
      eventsFor(counter, synthSequence(cycle, front, 25, 2000)));
    const down = synthSequence([{ ms: 950, toFlex: 95 }], front, 25, 4800);
    expect(eventsFor(counter, down)).toEqual([]);
    const paused = pauseSession(before, 5800);
    counter.resetMotion();
    const resumed = resumeSession(paused, 9000);
    const up = synthSequence([{ ms: 950, toFlex: 0 }], front, 25, 9000, 95);
    const after = applySquatEvents(resumed, eventsFor(counter, up));
    expect(after).toMatchObject({ reps: before.reps, combo: before.combo, points: before.points });
    const finished = applySquatEvents(after, eventsFor(counter, synthSequence(cycle, front, 25, 10_100)));
    expect(finished.reps.map(({ rep }) => rep.index)).toEqual([1, 2]);
    expect(counter.repCount).toBe(2);
  });

  it("hält Session-Punkte bei beschädigten Weltkoordinaten in einem einzelnen Frame endlich", () => {
    const frames = synthSequence(cycle, front, 25, 2000);
    const bottom = frames.find(({ t }) => t === 3200)!;
    const world = bottom.worldLandmarks!;
    world[LM.LEFT_KNEE]!.z = Number.NaN;
    world[LM.RIGHT_KNEE] = { ...world[LM.RIGHT_HIP]! };
    const session = applySquatEvents(startSession(createSession(), 2000), eventsFor(counterFor(), frames));
    expect(session.reps).toHaveLength(1);
    // CODEX-BEFUND: Der ungültige 3D-Winkel vergiftet Symmetriewertung und Punktestand.
    expect(Number.isFinite(session.points)).toBe(true);
  });
});
