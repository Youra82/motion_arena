import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../persist";
import { actions, useApp } from "../store";
import { attachLiveCanvas, connectToTv, detachLiveCanvas, disconnectTv, usePhoneLink } from "./phone-link";
import { startTvHost, stopTvHost, useTvHost } from "./tv-host";
import type { Link, LinkHandlers } from "./transport";

const { hostLink, joinLink } = vi.hoisted(() => ({
  hostLink: vi.fn<(code: string, events: LinkHandlers) => Promise<Link>>(),
  joinLink: vi.fn<(code: string, events: LinkHandlers) => Promise<Link>>(),
}));
vi.mock("./transport", () => ({ hostLink, joinLink }));

const initialApp = useApp.getState();
let attached: HTMLCanvasElement | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
});

afterEach(() => {
  disconnectTv();
  if (attached) detachLiveCanvas(attached);
  attached = undefined;
  stopTvHost();
  useApp.setState(initialApp);
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("Lebenszyklus der TV-Kopplung mit simuliertem Transport", () => {
  it("erneuert einen unbenutzten Code nach zehn Minuten und räumt beim Stoppen auf", async () => {
    const close = vi.fn();
    hostLink.mockImplementation(async (_code, events) => {
      events.onStatus("waiting");
      return { send: vi.fn(), close };
    });
    await startTvHost("ABC234", "A".repeat(24));
    await vi.advanceTimersByTimeAsync(599_999);
    expect(hostLink).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(hostLink).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledOnce();
    expect(useTvHost.getState()).toMatchObject({ status: "waiting", pose: null, stream: null });
    stopTvHost();
    await vi.advanceTimersByTimeAsync(600_000);
    expect(hostLink).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("meldet einen abgelehnten TV-Transportaufbau im Store", async () => {
    // CODEX-BEFUND: Ein fehlgeschlagener Host-Aufbau weist das Promise unbehandelt ab und lässt den TV bei „connecting“.
    hostLink.mockRejectedValueOnce(new Error("Transportmodul nicht verfügbar"));
    await expect(startTvHost("ABC234")).resolves.toBeUndefined();
    expect(useTvHost.getState().status).toBe("error");
  });

  it("verwirft ältere Posen und erlaubt einen neuen Zeitursprung nach dem Trennen", async () => {
    let events!: LinkHandlers;
    hostLink.mockImplementationOnce(async (_code, handlers) => {
      events = handlers;
      events.onStatus("waiting");
      return { send: vi.fn(), close: vi.fn() };
    });
    await startTvHost("ABC234");
    events.onStatus("connected");
    const packed = Array<number>(99).fill(500);
    events.onMessage({ k: "pose", t: 900, a: 1, m: 1, p: packed });
    events.onMessage({ k: "pose", t: 899, a: 2, m: 0, p: null });
    expect(useTvHost.getState()).toMatchObject({ poseT: 900, aspect: 1, mirror: true });
    expect(useTvHost.getState().pose).toHaveLength(33);
    events.onStatus("waiting");
    expect(useTvHost.getState()).toMatchObject({ poseT: -1, pose: null });
    events.onStatus("connected");
    events.onMessage({ k: "pose", t: 10, a: 2, m: 0, p: packed });
    expect(useTvHost.getState()).toMatchObject({ poseT: 10, aspect: 2, mirror: false });
  });

  it("belässt die neue Handykopplung bei verspätetem Abschluss und Rückruf der alten", async () => {
    let finishOld!: (link: Link) => void;
    let oldEvents!: LinkHandlers;
    const closeOld = vi.fn();
    const closeNew = vi.fn();
    const sendNew = vi.fn();
    joinLink.mockImplementationOnce((_code, events) => {
      oldEvents = events;
      return new Promise((resolve) => { finishOld = resolve; });
    });
    joinLink.mockImplementationOnce(async (_code, events) => {
      events.onStatus("connected");
      return { close: closeNew, send: sendNew };
    });
    const old = connectToTv("ABC234");
    expect(await connectToTv("DEF567")).toBe(true);
    finishOld({ close: closeOld, send: vi.fn() });
    expect(await old).toBe(false);
    oldEvents.onStatus("error");
    await vi.advanceTimersByTimeAsync(16_000);
    expect(joinLink).toHaveBeenCalledTimes(2);
    expect(usePhoneLink.getState()).toMatchObject({ code: "DEF567", status: "connected" });
    expect(sendNew.mock.calls.filter(([m]) => m.k === "hello")).toHaveLength(1);
    expect(closeOld).toHaveBeenCalledOnce();
    expect(closeNew).not.toHaveBeenCalled();
  });

  it.each(["kein Anruf", "Ausnahme"])("stoppt sämtliche Capture-Tracks bei gescheitertem Videoaufbau (%s)", async (failure) => {
    const stopVideoTrack = vi.fn();
    const stopOtherTrack = vi.fn();
    const captureStream = vi.fn(() => ({ getTracks: () => [{ stop: stopVideoTrack }, { stop: stopOtherTrack }] }));
    attached = { captureStream } as unknown as HTMLCanvasElement;
    const call = vi.fn(() => {
      if (failure === "Ausnahme") throw new Error("Anruf fehlgeschlagen");
      return null;
    });
    const send = vi.fn();
    joinLink.mockImplementationOnce(async (_code, events) => {
      events.onStatus("connected");
      return { send, close: vi.fn(), call };
    });
    useApp.setState({ settings: { ...DEFAULT_SETTINGS, tvVideo: "on" } });
    actions.openLive("demo", 10);
    attachLiveCanvas(attached);
    await connectToTv("ABC234");
    expect(call).toHaveBeenCalledOnce();
    expect(stopVideoTrack).toHaveBeenCalledOnce();
    expect(stopOtherTrack).toHaveBeenCalledOnce();
    expect(usePhoneLink.getState().streaming).toBe(false);
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ k: "state", s: expect.objectContaining({ video: false }) }));
  });
});
