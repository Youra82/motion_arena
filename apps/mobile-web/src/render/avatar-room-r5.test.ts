import { afterEach, describe, expect, it, vi } from "vitest";
import { synthPose } from "@motion-arena/pose-engine";
import { LM, type Landmark } from "@motion-arena/shared";
import { avatarById } from "./avatars";
import { drawFrame, type DrawInput } from "./draw";
import { ROOMS, drawRoom, roomById, roomCanvas } from "./rooms";

function recordingCanvas() {
  const addColorStop = vi.fn();
  const gradient = () => ({ addColorStop });
  const calls: Array<[string, unknown[]]> = [];
  const methods = new Map<string, (...args: unknown[]) => unknown>();
  const ctx = new Proxy({}, {
    get(target, key: string) {
      if (Reflect.has(target, key)) return Reflect.get(target, key);
      if (!methods.has(key)) {
        methods.set(key, (...args) => {
          calls.push([key, args]);
          if (args.some((arg) => typeof arg === "number" && !Number.isFinite(arg))) {
            throw new TypeError(`Nicht endliche Canvas-Geometrie bei ${key}`);
          }
          if (key.endsWith("Gradient")) return gradient();
        });
      }
      return methods.get(key);
    },
  }) as CanvasRenderingContext2D;
  return { ctx, calls };
}

function sidePose() {
  return synthPose({ view: "side", kneeFlexDeg: 50, aspect: 390 / 844 }).landmarks;
}

function render(landmarks: Landmark[], mirror = true) {
  const { ctx, calls } = recordingCanvas();
  const v = { cw: 390, ch: 844, sw: 390, sh: 844, fit: "contain", mirror } as const;
  const input: DrawInput = {
    ctx, v, mode: "avatar", video: null, landmarks, mask: null, trail: [],
    avatar: avatarById("elena"),
    ring: { depth: null, goodDepth: 1, repFlashAt: -1e9, now: 1000 },
  };
  drawFrame(input);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("Avatar bei lückenhafter und seitlicher Pose", () => {
  it("zeichnet im Profil auch ohne Ohren und Zehen einen Rumpf mit Breite", () => {
    const pose = sidePose();
    // Optionale Punkte fehlen tatsächlich. Die Indizes der Gelenke bleiben erhalten.
    for (const i of [7, 8, LM.LEFT_FOOT_INDEX, LM.RIGHT_FOOT_INDEX]) Reflect.deleteProperty(pose, i);
    const calls = render(pose);
    const torso = calls.find(([name]) => name === "createLinearGradient")?.[1] as number[];
    expect(torso).toHaveLength(4);
    expect(Math.abs(torso[0]! - torso[2]!)).toBeGreaterThan(12);
    expect(calls.filter(([name]) => name === "save")).toHaveLength(calls.filter(([name]) => name === "restore").length);
  });

  it("spiegelt den Kopfansatz bei seitlicher Pose mit Punkten knapp außerhalb des Bildes", () => {
    const pose = sidePose().map((p) => ({ ...p, x: p.x - 0.52 }));
    expect(pose.some((p) => p.x < 0)).toBe(true);
    const headX = (mirror: boolean) => render(pose, mirror).find(([name]) => name === "translate")?.[1][0] as number;
    expect(headX(false) + headX(true)).toBeCloseTo(390);
  });

  it("überspringt eine Pose ohne rechtes Handgelenk oder zeichnet nur die verlässlichen Segmente", () => {
    // CODEX-BEFUND: Der Avatar greift auch auf fehlende Pflichtpunkte ohne Prüfung zu.
    const pose = sidePose();
    Reflect.deleteProperty(pose, LM.RIGHT_WRIST);
    expect(() => render(pose)).not.toThrow();
  });

  it("gibt bei einem nicht endlichen Knie keine ungültige Canvas-Geometrie aus", () => {
    // CODEX-BEFUND: Das nicht endliche Knie macht den globalen Körpermaßstab ungültig.
    const pose = sidePose();
    pose[LM.LEFT_KNEE]!.x = NaN;
    expect(() => render(pose)).not.toThrow();
  });

  it("zeichnet aus zusammengefallenen Kernpunkten keine Figur", () => {
    // CODEX-BEFUND: Der Mindestmaßstab erzeugt bei kollabierter Pose einen scheinbaren Kopf und Körper.
    const pose = sidePose().map((p) => ({ ...p, x: 0.5, y: 0.5 }));
    expect(render(pose).some(([name]) => name === "arc" || name === "translate")).toBe(false);
  });
});

describe("Raum-Cache bei Größen- und Pixeldichtewechsel", () => {
  it("rendert nur bei Cache-Fehlern neu und hält höchstens drei begrenzte Raster", () => {
    const created: HTMLCanvasElement[] = [];
    vi.stubGlobal("document", {
      createElement: () => {
        const { ctx } = recordingCanvas();
        const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
        created.push(canvas);
        return canvas;
      },
    });
    const [first, second, third, fourth] = ROOMS;
    const { ctx } = recordingCanvas();
    const retina = roomCanvas(first!, 1170, 2532);
    expect([retina.width, retina.height]).toEqual([508, 1100]);
    for (let i = 0; i < 30; i++) drawRoom(ctx, first!, 1170, 2532, i / 30);
    expect(created).toHaveLength(1);
    const rotated = roomCanvas(first!, 2532, 1170);
    expect([rotated.width, rotated.height]).toEqual([1100, 508]);
    expect(roomCanvas(first!, 2532, 1170)).toBe(rotated);
    roomCanvas(second!, 390, 844);
    roomCanvas(third!, 390, 844);
    roomCanvas(fourth!, 390, 844);
    expect(roomCanvas(first!, 1170, 2532)).not.toBe(retina);
    expect(created).toHaveLength(6);
  });

  it("wendet bei stabiler Größe pro Frame nur Kopie und Lichtüberlagerung an", () => {
    const { ctx, calls } = recordingCanvas();
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => recordingCanvas().ctx }) });
    drawRoom(ctx, roomById("core-studio"), 391, 845, 0.5);
    expect(calls.map(([name]) => name)).toEqual(["drawImage", "fillRect", "createRadialGradient", "fillRect"]);
  });
});
