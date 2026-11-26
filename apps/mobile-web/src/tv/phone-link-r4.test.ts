import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { synthFrame } from "@motion-arena/pose-engine";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../persist";
import { actions, useApp } from "../store";
import {
  attachLiveCanvas, connectToTv, detachLiveCanvas, disconnectTv, sendPoseToTv, setTvVideo, usePhoneLink,
} from "./phone-link";
import type { Link, LinkHandlers } from "./transport";

const { join } = vi.hoisted(() => ({ join: vi.fn<(code: string, handlers: LinkHandlers) => Promise<Link>>() }));
vi.mock("./transport", () => ({ joinLink: join }));

let status: LinkHandlers["onStatus"];
let canvas: HTMLCanvasElement;
const send = vi.fn();
const stopTrack = vi.fn();
const stopCall = vi.fn();
const call = vi.fn<NonNullable<Link["call"]>>(() => stopCall);
const close = vi.fn();
const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
const captureStream = vi.fn(() => stream);
const landmarks = synthFrame(0, { view: "front", kneeFlexDeg: 20 }).landmarks;
const sendPose = (t: number) => sendPoseToTv(landmarks, 9 / 16, true, t);

async function pair() {
  await connectToTv("ABC234");
  status("connected");
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  join.mockImplementation(async (_code, handlers) => {
    status = handlers.onStatus;
    status("connecting");
    return { send, call, close };
  });
  useApp.setState({ settings: { ...DEFAULT_SETTINGS }, screen: "home" });
  canvas = { captureStream } as unknown as HTMLCanvasElement;
});

afterEach(() => {
  detachLiveCanvas(canvas);
  disconnectTv();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Handy-Sender mit simuliertem Transport", () => {
  it("öffnet beim normalen Training keinen Transport und sendet beim Warten oder nach Trennung keine Posen", async () => {
    actions.openLive("demo", 10);
    attachLiveCanvas(canvas);
    sendPose(1000);
    expect(join).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    await connectToTv("ABC234");
    sendPose(2000);
    expect(send).not.toHaveBeenCalled();
    status("connected");
    sendPose(3000);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ k: "pose", a: 9 / 16, m: 1, p: expect.any(Array) }));
    expect(send.mock.calls.filter(([m]) => m.k === "pose")).toHaveLength(1);
    disconnectTv();
    sendPose(4000);
    expect(send.mock.calls.filter(([m]) => m.k === "pose")).toHaveLength(1);
  });

  it("öffnet ohne Freigabe über Ansichtswechsel und neue Live-Ansicht hinweg keinen Videostream", async () => {
    actions.openLive("demo", 10);
    await pair();
    attachLiveCanvas(canvas);
    actions.setViewMode("hybrid");
    vi.advanceTimersByTime(100);
    setTvVideo("off");
    detachLiveCanvas(canvas);
    actions.openLive("demo", 10);
    attachLiveCanvas(canvas);
    expect(captureStream).not.toHaveBeenCalled();
    expect(call).not.toHaveBeenCalled();
    expect(usePhoneLink.getState().streaming).toBe(false);
  });

  it("beendet bei Widerruf den Anruf und startet auch bei Ansichtswechsel und Neukopplung kein Video", async () => {
    actions.openLive("demo", 10);
    await pair();
    attachLiveCanvas(canvas);
    setTvVideo("on");
    expect(call).toHaveBeenCalledWith(stream);
    setTvVideo("off");
    expect(stopCall).toHaveBeenCalledOnce();
    expect(usePhoneLink.getState().streaming).toBe(false);
    actions.setViewMode("hybrid");
    disconnectTv();
    await pair();
    expect(call).toHaveBeenCalledOnce();
    expect(send).toHaveBeenLastCalledWith(expect.objectContaining({ k: "state", s: expect.objectContaining({ video: false }) }));
  });

  it("stoppt bei Widerruf auch die eigenen Canvas-Tracks", async () => {
    // CODEX-BEFUND: Nur der Anruf wird geschlossen. Die Capture-Tracks werden nie gestoppt.
    actions.openLive("demo", 10);
    await pair();
    attachLiveCanvas(canvas);
    setTvVideo("on");
    setTvVideo("off");
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("beendet bei einem Verbindungsverlust den laufenden Videoanruf sofort", async () => {
    // CODEX-BEFUND: Der Verweis geht bei Statuswechsel verloren, ohne den Anruf zu schließen.
    actions.openLive("demo", 10);
    await pair();
    attachLiveCanvas(canvas);
    setTvVideo("on");
    status("disconnected");
    expect(usePhoneLink.getState().streaming).toBe(false);
    expect(stopCall).toHaveBeenCalledOnce();
  });

  it("verwirft beim Trennen ausstehende Zustandsübertragungen", async () => {
    // CODEX-BEFUND: Ein alter Timer sendet Daten über die inzwischen neu gekoppelte Verbindung.
    await pair();
    actions.openLive("demo", 10);
    vi.advanceTimersByTime(50);
    disconnectTv();
    await pair();
    actions.setViewMode("muskel");
    send.mockClear();
    vi.advanceTimersByTime(50);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([false, true])("beachtet den Widerruf nach Neustart bei Speicherfehler=%s", async (failWrite) => {
    // CODEX-BEFUND: Scheitert das Speichern des Widerrufs, kann die alte Freigabe beim nächsten Start erneut senden.
    let stored: string | null = null;
    let writable = true;
    vi.stubGlobal("localStorage", {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        if (!writable) throw new Error("Speicher nicht beschreibbar");
        stored = value;
      },
    });
    expect(saveSettings({ ...DEFAULT_SETTINGS, tvVideo: "on" })).toBe(true);
    useApp.setState({ settings: loadSettings() });
    await pair();
    attachLiveCanvas(canvas);
    expect(call).toHaveBeenCalledOnce();
    writable = !failWrite;
    setTvVideo("off");
    disconnectTv();
    useApp.setState({ settings: loadSettings() });
    call.mockClear();
    await pair();
    expect(call).not.toHaveBeenCalled();
  });

  it("ignoriert den verspäteten Abschluss einer vom Benutzer abgebrochenen Kopplung", async () => {
    // CODEX-BEFUND: Eine noch laufende Verbindungsanlage wird durch Trennen nicht ungültig.
    let finishJoin!: (link: Link) => void;
    join.mockImplementationOnce((_code, handlers) => {
      status = handlers.onStatus;
      return new Promise<Link>((resolve) => { finishJoin = resolve; });
    });
    const pending = connectToTv("ABC234");
    disconnectTv();
    finishJoin({ send, call, close });
    await pending;
    status("connected");
    expect(usePhoneLink.getState().status).toBe("off");
    expect(close).toHaveBeenCalledOnce();
    expect(send).not.toHaveBeenCalled();
  });
});
