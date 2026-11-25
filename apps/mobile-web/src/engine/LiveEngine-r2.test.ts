import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { synthFrame } from "@motion-arena/pose-engine";
import { actions, useApp } from "../store";
import { LiveEngine } from "./LiveEngine";

const sdk = vi.hoisted(() => ({
  create: vi.fn(),
  draw: vi.fn(),
  resolveFileset: vi.fn(),
}));

vi.mock("@mediapipe/tasks-vision", () => ({
  FilesetResolver: { forVisionTasks: sdk.resolveFileset },
  PoseLandmarker: { createFromOptions: sdk.create },
}));
vi.mock("../render/draw", () => ({ drawFrame: sdk.draw }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function cameraFixture() {
  const track = { stop: vi.fn(), addEventListener: vi.fn() };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const video = {
    srcObject: null as typeof stream | null,
    play: vi.fn().mockResolvedValue(undefined),
    readyState: 2,
    videoWidth: 1280,
    videoHeight: 720,
    currentTime: 0,
  };
  return { track, stream, video, videoElement: video as unknown as HTMLVideoElement };
}

function modelFixture() {
  return {
    close: vi.fn(),
    setOptions: vi.fn().mockResolvedValue(undefined),
    detectForVideo: vi.fn(),
  };
}

describe("LiveEngine mit verzögerten Kamera- und Modellantworten", () => {
  let getCamera: ReturnType<typeof vi.fn>;
  let engine: LiveEngine;
  let canvas: HTMLCanvasElement;
  let camera: ReturnType<typeof cameraFixture>;
  let model: ReturnType<typeof modelFixture>;
  let schedule: ReturnType<typeof vi.fn<(callback: FrameRequestCallback) => number>>;

  function frame(now: number) {
    camera.video.currentTime += 1 / 30;
    vi.spyOn(performance, "now").mockReturnValue(now);
    schedule.mock.lastCall![0](now);
  }

  beforeEach(() => {
    vi.resetAllMocks();
    camera = cameraFixture();
    model = modelFixture();
    sdk.resolveFileset.mockResolvedValue({});
    sdk.create.mockResolvedValue(model);
    getCamera = vi.fn().mockResolvedValue(camera.stream);
    schedule = vi.fn<(callback: FrameRequestCallback) => number>().mockReturnValue(1);
    vi.stubGlobal("window", { isSecureContext: true });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: getCamera } });
    vi.stubGlobal("requestAnimationFrame", schedule);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    actions.openLive("camera", 10);
    actions.setViewMode("hybrid");
    canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
    engine = new LiveEngine(canvas, camera.videoElement, "camera");
  });

  afterEach(() => {
    engine.stop();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("schließt ein nach dem Abbruch fertig geladenes Modell", async () => {
    const loading = deferred<typeof model>();
    const entered = deferred<void>();
    sdk.create.mockImplementation(() => {
      entered.resolve();
      return loading.promise;
    });

    const started = engine.start();
    await entered.promise;
    engine.stop();
    expect(camera.track.stop).toHaveBeenCalledOnce();
    loading.resolve(model);
    await started;
    expect(schedule).not.toHaveBeenCalled();
    // CODEX-BEFUND: stop() entfernt die Referenz, bevor das SDK-Modell existiert.
    expect(model.close).toHaveBeenCalledOnce();
  });

  it("erhält den neuen Videostream nach einer verspäteten Antwort auf den ersten Start", async () => {
    const oldCamera = cameraFixture();
    const permission = deferred<typeof oldCamera.stream>();
    getCamera.mockReturnValueOnce(permission.promise);
    const oldEngine = new LiveEngine(canvas, camera.videoElement, "camera");
    const started = oldEngine.start();
    oldEngine.stop();
    await engine.start();
    expect(camera.video.srcObject).toBe(camera.stream);

    permission.resolve(oldCamera.stream);
    await started;
    expect(oldCamera.track.stop).toHaveBeenCalledOnce();
    expect(camera.track.stop).not.toHaveBeenCalled();
    // CODEX-BEFUND: Später Aufräumaufruf löscht srcObject am gemeinsam genutzten Video.
    expect(camera.video.srcObject).toBe(camera.stream);
  });

  it("wechselt bei einem Fehler während der laufenden Inferenz in die Fehleransicht", async () => {
    await engine.start();
    model.detectForVideo.mockImplementationOnce(() => { throw new Error("Detektor ausgefallen"); });
    let escaped = false;
    try {
      frame(500);
    } catch {
      escaped = true;
    }
    // CODEX-BEFUND: Nach dem ersten Frame liegt die Schleife außerhalb des Fehlerhandlers.
    expect(useApp.getState().engineStatus).toBe("error");
    expect(escaped).toBe(false);
    expect(camera.track.stop).toHaveBeenCalledOnce();
  });

  it("serialisiert Maskenoptionen bei schnellen Darstellungswechseln", async () => {
    const configuring = deferred<void>();
    model.setOptions.mockReturnValueOnce(configuring.promise);
    await engine.start();
    actions.setViewMode("silhouette");
    actions.setViewMode("hybrid");
    const callsWhilePending = model.setOptions.mock.calls.length;
    configuring.resolve();
    // CODEX-BEFUND: Die zweite Umstellung erreicht das SDK, bevor die erste abgeschlossen ist.
    expect(callsWhilePending).toBe(1);
  });

  it("verwendet CPU, wenn die GPU-Initialisierung scheitert, und wertet jedes Videobild einmal aus", async () => {
    sdk.create.mockRejectedValueOnce(new Error("GPU nicht verfügbar"));
    vi.spyOn(performance, "now").mockReturnValue(100);
    await engine.start();
    expect(sdk.create.mock.calls.map(([, options]) => options.baseOptions.delegate)).toEqual(["GPU", "CPU"]);

    schedule.mock.lastCall![0](110);
    frame(120);
    expect(model.detectForVideo.mock.calls.map(([, timestamp]) => timestamp)).toEqual([100, 120]);
  });

  it("verwirft den begonnenen Versuch auch bei Pause und Fortsetzen zwischen zwei Frames", async () => {
    let flex = 0;
    model.detectForVideo.mockImplementation((_video, timestamp: number, callback) => {
      const { landmarks, worldLandmarks } = synthFrame(timestamp, { view: "side", kneeFlexDeg: flex });
      callback({ landmarks: [landmarks], worldLandmarks: [worldLandmarks] });
    });
    vi.spyOn(performance, "now").mockReturnValue(0);
    await engine.start();
    for (let t = 50; t <= 4800; t += 50) frame(t);
    expect(useApp.getState().session.status).toBe("running");
    for (let t = 4850; t <= 5850; t += 50) {
      flex = Math.min(95, (t - 4800) * 0.13);
      frame(t);
    }
    expect(useApp.getState().hud.phase).toBe("descending");

    actions.pause(5860);
    actions.resume(5870);
    for (let t = 5900; t <= 7200; t += 50) {
      flex = Math.max(0, 95 - (t - 5900) * 0.12);
      frame(t);
    }
    // CODEX-BEFUND: Der Zähler erkennt die Pause erst, wenn ein Frame sie beobachtet.
    expect(useApp.getState().session.reps).toHaveLength(0);
  });

  it("lässt den Ziel-Timer einer beendeten Engine nicht die neue Session abschließen", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let flex = 0;
    model.detectForVideo.mockImplementation((_video, timestamp: number, callback) => {
      const { landmarks, worldLandmarks } = synthFrame(timestamp, { view: "side", kneeFlexDeg: flex });
      callback({ landmarks: [landmarks], worldLandmarks: [worldLandmarks] });
    });
    actions.openLive("camera", 1);
    vi.spyOn(performance, "now").mockReturnValue(0);
    await engine.start();
    for (let t = 50; t <= 4800; t += 50) frame(t);
    for (let t = 4850; t <= 7250; t += 50) {
      flex = Math.max(0, Math.min(95, (t - 4800) * 0.12, (6900 - t) * 0.12));
      frame(t);
    }
    expect(useApp.getState().session.reps).toHaveLength(1);
    expect(useApp.getState().feedback?.text).toBe("Ziel erreicht!");
    engine.stop();
    actions.openLive("demo", 10);
    actions.startTraining(7300);
    vi.advanceTimersByTime(1500);
    // CODEX-BEFUND: Der verzögerte Abschluss liest nur den globalen Status.
    expect(useApp.getState().session.status).toBe("running");
  });
});
