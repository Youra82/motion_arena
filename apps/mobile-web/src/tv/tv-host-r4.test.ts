import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { synthFrame } from "@motion-arena/pose-engine";
import { encodePose, PROTOCOL_VERSION, type TvState } from "./protocol";
import type { Link, LinkHandlers } from "./transport";
import { startTvHost, stopTvHost, useTvHost } from "./tv-host";

const { host } = vi.hoisted(() => ({ host: vi.fn<(code: string, handlers: LinkHandlers) => Promise<Link>>() }));
vi.mock("./transport", () => ({ hostLink: host }));

const state = {
  screen: "idle", viewport: { w: 390, h: 844 }, hud: null, viewMode: "hybrid", video: false, demo: false, summary: null,
} satisfies TvState;
let events: LinkHandlers;
const close = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  host.mockImplementation(async (_code, handlers) => {
    events = handlers;
    events.onStatus("waiting");
    return { close, send: vi.fn() };
  });
});

afterEach(stopTvHost);

describe("TV-Empfänger mit simuliertem Transport", () => {
  it("übernimmt Seitenverhältnis und beide Spiegelungsrichtungen einer asymmetrischen Pose", async () => {
    await startTvHost("ABC234");
    events.onStatus("connected");
    events.onMessage({ k: "hello", v: PROTOCOL_VERSION, app: "Testversion" });
    const points = synthFrame(0, { view: "front", kneeFlexDeg: 25, liftLeftKneeDeg: 30 }).landmarks;
    const p = encodePose(points);
    events.onMessage({ k: "pose", p, t: 200, a: 4 / 3, m: 0 });
    expect(useTvHost.getState()).toMatchObject({ aspect: 4 / 3, mirror: false });
    expect(useTvHost.getState().pose?.[0]?.x).toBeCloseTo(points![0]!.x, 3);
    events.onMessage({ k: "pose", p, t: 300, a: 9 / 16, m: 1 });
    expect(useTvHost.getState()).toMatchObject({ aspect: 9 / 16, mirror: true });
  });

  it("räumt Inhalt beim Trennen auf und übernimmt den aktuellen Zustand bei Rückkehr", async () => {
    await startTvHost("ABC234");
    events.onStatus("connected");
    events.onMessage({ k: "state", s: state });
    events.onStream?.({} as MediaStream);
    expect(useTvHost.getState().state).toEqual(state);
    events.onStatus("waiting");
    expect(useTvHost.getState()).toMatchObject({ status: "waiting", state: null, pose: null, stream: null });
    events.onStatus("connected");
    const newState = { ...state, viewport: { w: 844, h: 390 } };
    events.onMessage({ k: "state", s: newState });
    expect(useTvHost.getState().state).toEqual(newState);
  });

  it("lässt den neuen TV-Code bei verspätetem Abschluss der früheren Öffnung aktiv", async () => {
    // CODEX-BEFUND: Die frühere Öffnung überschreibt den aktiven Link. Beim Stoppen bleibt der neuere Link offen.
    let finishHost!: (link: Link) => void;
    const closeOld = vi.fn();
    host.mockImplementationOnce(() => new Promise<Link>((resolve) => { finishHost = resolve; }));
    const pending = startTvHost("ABC234");
    await startTvHost("DEF567");
    finishHost({ close: closeOld, send: vi.fn() });
    await pending;
    expect(useTvHost.getState().code).toBe("DEF567");
    stopTvHost();
    expect(close).toHaveBeenCalledOnce();
    expect(closeOld).toHaveBeenCalledOnce();
  });
});
