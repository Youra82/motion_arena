import { afterEach, describe, expect, it, vi } from "vitest";
import { hostLink, joinLink, type Link, type LinkHandlers } from "./transport";

const links: Link[] = [];
const monitor = () => ({ onStatus: vi.fn<LinkHandlers["onStatus"]>(), onMessage: vi.fn<LinkHandlers["onMessage"]>() });

afterEach(() => {
  for (const link of links.splice(0)) link.close();
  vi.unstubAllGlobals();
});

describe("BroadcastChannel auf demselben Rechner", () => {
  it.each(["Fernseher", "Handy"])("koppelt, wenn zuerst %s bereit ist", async (first) => {
    vi.stubGlobal("location", { search: "?transport=local" });
    const tv = monitor();
    const phone = monitor();
    const startTv = async () => { links.push(await hostLink("ABC234", tv)); };
    let sender: Link | undefined;
    const startPhone = async () => {
      sender = await joinLink("ABC234", phone);
      links.push(sender);
    };
    if (first === "Fernseher") {
      await startTv();
      await startPhone();
    } else {
      await startPhone();
      await startTv();
    }
    await vi.waitFor(() => {
      expect(tv.onStatus).toHaveBeenLastCalledWith("connected");
      expect(phone.onStatus).toHaveBeenLastCalledWith("connected");
    }, { timeout: 2000 });
    const greeting = { k: "hello", v: 1, app: "lokaler Test" };
    sender!.send(greeting);
    await vi.waitFor(() => expect(tv.onMessage).toHaveBeenCalledWith(greeting));
    expect(sender!.call).toBeUndefined();
  });
});
