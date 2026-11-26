/**
 * Verbindung Handy ↔ TV. Zwei Umsetzungen hinter einer Schnittstelle:
 *  - "peer": WebRTC über PeerJS. Zum Finden der Geräte dienen der öffentliche Vermittlungsdienst (0.peerjs.com)
 *    und ein STUN-Server (stun.l.google.com, nennt jedem Gerät seine eigene Netzadresse). Bild und Daten fließen
 *    danach verschlüsselt direkt zwischen den beiden Geräten. Relay-Server (TURN) sind bewusst nicht eingerichtet,
 *    damit Bewegungsdaten und Bild nie über fremde Server laufen.
 *  - "local": BroadcastChannel (gleicher Browser) – für Tests und Entwicklung, ohne Netzwerk.
 * PeerJS wird erst beim Koppeln geladen; normales Training stellt keine externe Verbindung her.
 *
 * Sitzungsregeln (TV-Seite):
 *  - Genau EIN Handy pro Sitzung. Weitere Handys werden abgewiesen, solange die Sitzung besteht
 *    (Ausnahme: dasselbe Handy meldet sich nach Verbindungsverlust neu – gleiche Geräte-Kennung).
 *  - Ein Handy mit dem geheimen Schlüssel aus dem QR-Code wird sofort angenommen. Ein Handy, das nur den
 *    6-stelligen Code kennt, muss am Fernseher bestätigt werden (Status "approval"). Vorher gehen keine Daten durch.
 *  - Video wird nur vom Handy der aktiven Sitzung angenommen; Ereignisse früherer Sitzungen werden ignoriert.
 */
export type LinkStatus = "connecting" | "waiting" | "approval" | "connected" | "disconnected" | "rejected" | "error";

export interface Link {
  send(msg: unknown): void;
  /**
   * Handy: Live-Bild als Videostream an den TV senden (WebRTC, direkt, verschlüsselt).
   * Gibt eine Funktion zum Beenden zurück; null, wenn diese Verbindung kein Video kann (lokaler Kanal).
   */
  call?(stream: MediaStream): (() => void) | null;
  /** TV: wartende Kopplungsanfrage (nur Code, ohne Schlüssel) annehmen bzw. ablehnen. */
  approve?(): void;
  reject?(): void;
  close(): void;
}

export interface LinkHandlers {
  onMessage(msg: unknown): void;
  onStatus(status: LinkStatus, detail?: string): void;
  /** TV: Videostream vom Handy beginnt (Stream) oder endet (null). */
  onStream?(stream: MediaStream | null): void;
}

export interface HostOptions {
  /** Geheimer Schlüssel aus dem QR-Code; ohne Schlüssel (Tests) wird das erste Handy direkt angenommen. */
  secret?: string;
}

export interface JoinOptions {
  /** Schlüssel aus dem QR-Code (falls gescannt). */
  secret?: string | null;
  /** Kennung dieses Handys für die Dauer der App-Sitzung (Wiederverbinden nach Abbruch). */
  deviceId?: string;
}

export type TransportKind = "peer" | "local";

export function transportKind(): TransportKind {
  return typeof location !== "undefined" && new URLSearchParams(location.search).get("transport") === "local" ? "local" : "peer";
}

const PEER_PREFIX = "motion-arena-tv-";
const ICE = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

let ownDeviceId: string | null = null;
/** Zufällige Kennung dieses Geräts (nur im Speicher, nicht gespeichert). */
export function deviceId(): string {
  if (!ownDeviceId) {
    const bytes = new Uint8Array(9);
    globalThis.crypto?.getRandomValues?.(bytes);
    ownDeviceId = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") || String(Math.random()).slice(2);
  }
  return ownDeviceId;
}

/** Entscheidung über eine Kopplungsanfrage. */
type Admission = "accept" | "ask" | "reject";
function admit(opts: HostOptions, active: string | null, from: string, secret: unknown): Admission {
  if (active && active !== from) return "reject"; // anderes Handy, Sitzung besteht
  if (!opts.secret || secret === opts.secret || active === from) return "accept";
  return "ask";
}

interface PeerMeta {
  device?: unknown;
  secret?: unknown;
}

/** TV-Seite: wartet unter dem Kopplungscode auf ein Handy. */
export async function hostLink(code: string, h: LinkHandlers, opts: HostOptions = {}): Promise<Link> {
  if (transportKind() === "local") return localHost(code, h, opts);
  h.onStatus("connecting");
  const { Peer } = await import("peerjs");
  const peer = new Peer(PEER_PREFIX + code, { config: ICE, debug: 0 });
  type Conn = import("peerjs").DataConnection;
  type Call = import("peerjs").MediaConnection;
  let conn: Conn | null = null; // aktive, bestätigte Sitzung
  let pending: Conn | null = null; // wartet auf Bestätigung am TV
  let activeDevice: string | null = null;
  let media: Call | null = null;
  let closed = false;

  const endMedia = () => {
    if (media) {
      const m = media;
      media = null;
      m.close();
      h.onStream?.(null);
    }
  };
  const activate = (c: Conn, device: string) => {
    if (conn && conn !== c) {
      // Sitzungswechsel (nur dasselbe Handy nach Abbruch): alte Medien sofort stilllegen
      endMedia();
      conn.close();
    }
    conn = c;
    activeDevice = device;
    pending = null;
    c.send({ k: "accepted" });
    h.onStatus("connected");
  };

  peer.on("open", () => !closed && h.onStatus("waiting"));
  peer.on("error", (e) => !closed && h.onStatus("error", String((e as { type?: string }).type ?? e)));
  peer.on("disconnected", () => {
    // Verbindung zum Vermittlungsdienst verloren – bestehende Handy-Verbindung bleibt; neu anmelden.
    if (!peer.destroyed && !closed) peer.reconnect();
  });
  peer.on("call", (call) => {
    // Video nur vom Handy der aktiven Sitzung annehmen.
    if (!conn || call.peer !== conn.peer) {
      call.close();
      return;
    }
    endMedia();
    media = call;
    call.answer();
    call.on("stream", (st) => media === call && h.onStream?.(st));
    const end = () => {
      if (media === call) {
        media = null;
        h.onStream?.(null);
      }
    };
    call.on("close", end);
    call.on("error", end);
  });
  peer.on("connection", (c) => {
    const meta = (c.metadata ?? {}) as PeerMeta;
    const device = typeof meta.device === "string" ? meta.device.slice(0, 64) : c.peer;
    c.on("open", () => {
      if (closed) return c.close();
      // Zulassung erst jetzt entscheiden – gegen den aktuellen Sitzungszustand
      const decision = admit(opts, activeDevice, device, meta.secret);
      if (decision === "reject" || (decision === "ask" && pending && pending !== c)) {
        c.send({ k: "rejected", reason: "busy" });
        setTimeout(() => c.close(), 200);
        return;
      }
      if (decision === "accept") activate(c, device);
      else {
        pending = c;
        c.send({ k: "pending" });
        h.onStatus("approval");
      }
    });
    c.on("data", (d) => c === conn && h.onMessage(d)); // nur Daten der aktiven Sitzung
    c.on("close", () => {
      if (c === pending) {
        pending = null;
        if (!conn) h.onStatus("waiting");
      }
      if (c === conn) {
        conn = null;
        activeDevice = null;
        endMedia();
        if (!closed) h.onStatus("waiting");
      }
    });
  });
  return {
    send: (m) => conn?.open && conn.send(m),
    approve: () => {
      if (!pending) return;
      const c = pending;
      const meta = (c.metadata ?? {}) as PeerMeta;
      const device = typeof meta.device === "string" ? meta.device.slice(0, 64) : c.peer;
      if (activeDevice && activeDevice !== device) {
        // Inzwischen ist ein anderes Handy verbunden: die wartende Anfrage nicht mehr zulassen
        pending = null;
        c.send({ k: "rejected", reason: "busy" });
        setTimeout(() => c.close(), 200);
        return;
      }
      activate(c, device);
    },
    reject: () => {
      if (!pending) return;
      const c = pending;
      pending = null;
      c.send({ k: "rejected", reason: "declined" });
      setTimeout(() => c.close(), 200);
      if (!conn) h.onStatus("waiting");
    },
    close: () => {
      closed = true;
      endMedia();
      conn?.close();
      pending?.close();
      peer.destroy();
    },
  };
}

/** Steuernachrichten des TV an das Handy (im Datenkanal). */
function isControl(d: unknown): d is { k: "accepted" } | { k: "pending" } | { k: "rejected"; reason?: string } {
  const k = !!d && typeof d === "object" ? (d as { k?: unknown }).k : undefined;
  return k === "accepted" || k === "pending" || k === "rejected";
}

/** Handy-Seite: verbindet sich mit dem TV unter dem Kopplungscode. */
export async function joinLink(code: string, h: LinkHandlers, opts: JoinOptions = {}): Promise<Link> {
  if (transportKind() === "local") return localJoin(code, h, opts);
  h.onStatus("connecting");
  const { Peer } = await import("peerjs");
  const peer = new Peer({ config: ICE, debug: 0 });
  let conn: import("peerjs").DataConnection | null = null;
  let accepted = false;
  let closed = false;
  peer.on("error", (e) => !closed && h.onStatus("error", String((e as { type?: string }).type ?? e)));
  peer.on("open", () => {
    if (closed) return;
    // Zustands- und Steuernachrichten geordnet und zuverlässig (sonst kann die Anzeige zurückspringen).
    conn = peer.connect(PEER_PREFIX + code, {
      reliable: true,
      serialization: "json",
      metadata: { device: opts.deviceId ?? deviceId(), secret: opts.secret ?? null },
    });
    conn.on("data", (d) => {
      if (closed) return;
      if (isControl(d)) {
        if (d.k === "accepted") {
          accepted = true;
          h.onStatus("connected");
        } else if (d.k === "pending") h.onStatus("approval");
        else h.onStatus("rejected", d.reason === "busy" ? "busy" : "declined");
        return;
      }
      if (accepted) h.onMessage(d);
    });
    conn.on("close", () => !closed && h.onStatus(accepted ? "disconnected" : "rejected", accepted ? undefined : "closed"));
    conn.on("error", (e) => !closed && h.onStatus("error", String(e)));
  });
  return {
    send: (m) => accepted && conn?.open && conn.send(m),
    call: (stream) => {
      if (closed || peer.destroyed || !peer.open || !accepted) return null;
      // Für den Fernseher Schärfe vor Bildrate: Auflösung halten, Bitrate fürs Heimnetz großzügig.
      const track = stream.getVideoTracks()[0];
      if (track) track.contentHint = "detail";
      const media = peer.call(PEER_PREFIX + code, stream);
      const pc = media.peerConnection;
      const tune = () => {
        if (!pc) return;
        for (const sender of pc.getSenders()) {
          if (sender.track?.kind !== "video") continue;
          const p = sender.getParameters() as RTCRtpSendParameters & { degradationPreference?: string };
          if (!p.encodings?.length) continue;
          p.encodings[0]!.maxBitrate = 6_000_000;
          p.encodings[0]!.scaleResolutionDownBy = 1;
          p.degradationPreference = "maintain-resolution";
          void sender.setParameters(p).catch(() => {});
        }
      };
      pc?.addEventListener("connectionstatechange", tune);
      const timers = [setTimeout(tune, 600), setTimeout(tune, 2500)];
      return () => {
        timers.forEach(clearTimeout);
        pc?.removeEventListener("connectionstatechange", tune);
        media.close();
      };
    },
    close: () => {
      closed = true;
      conn?.close();
      peer.destroy();
    },
  };
}

// ---------------- Lokaler Kanal (BroadcastChannel) – gleiches Verhalten ohne Netzwerk ----------------

interface LocalMsg {
  from: string;
  to?: string;
  ctl?: "join" | "accepted" | "pending" | "rejected" | "leave";
  secret?: string | null;
  reason?: string;
  msg?: unknown;
}

function localHost(code: string, h: LinkHandlers, opts: HostOptions): Link {
  const ch = new BroadcastChannel(`motion-arena-pair-${code}`);
  const me = "tv";
  let active: string | null = null;
  let pending: string | null = null;
  const post = (m: Omit<LocalMsg, "from">) => ch.postMessage({ from: me, ...m });
  ch.onmessage = (e: MessageEvent<LocalMsg>) => {
    const d = e.data;
    if (!d || d.from === me || (d.to && d.to !== me)) return;
    if (d.ctl === "join") {
      if (d.from === active) return post({ to: d.from, ctl: "accepted" }); // Wiederholung desselben Handys
      const decision = admit(opts, active, d.from, d.secret);
      if (decision === "reject" || (decision === "ask" && pending && pending !== d.from)) {
        post({ to: d.from, ctl: "rejected", reason: "busy" });
        return;
      }
      if (decision === "accept") {
        active = d.from;
        pending = null;
        post({ to: d.from, ctl: "accepted" });
        h.onStatus("connected");
      } else {
        post({ to: d.from, ctl: "pending" });
        if (pending !== d.from) {
          pending = d.from;
          h.onStatus("approval");
        }
      }
    } else if (d.ctl === "leave") {
      if (d.from === active) {
        active = null;
        h.onStatus("waiting");
      } else if (d.from === pending) {
        pending = null;
        if (!active) h.onStatus("waiting");
      }
    } else if (d.msg !== undefined && d.from === active) h.onMessage(d.msg);
  };
  h.onStatus("waiting");
  return {
    send: (msg) => active && post({ to: active, msg }),
    approve: () => {
      if (!pending) return;
      if (active && active !== pending) {
        post({ to: pending, ctl: "rejected", reason: "busy" });
        pending = null;
        return;
      }
      active = pending;
      pending = null;
      post({ to: active, ctl: "accepted" });
      h.onStatus("connected");
    },
    reject: () => {
      if (!pending) return;
      post({ to: pending, ctl: "rejected", reason: "declined" });
      pending = null;
      if (!active) h.onStatus("waiting");
    },
    close: () => {
      if (active) post({ to: active, ctl: "leave" });
      ch.close();
    },
  };
}

function localJoin(code: string, h: LinkHandlers, opts: JoinOptions): Link {
  const ch = new BroadcastChannel(`motion-arena-pair-${code}`);
  // Eigene Kennung je Verbindung im selben Browser (mehrere Tabs = mehrere Handys).
  const me = `${opts.deviceId ?? deviceId()}-${Math.random().toString(36).slice(2, 8)}`;
  let accepted = false;
  let done = false;
  const post = (m: Omit<LocalMsg, "from">) => ch.postMessage({ from: me, ...m });
  ch.onmessage = (e: MessageEvent<LocalMsg>) => {
    const d = e.data;
    if (!d || d.from !== "tv" || (d.to && d.to !== me)) return;
    if (d.ctl === "accepted") {
      if (!accepted) {
        accepted = true;
        h.onStatus("connected");
      }
    } else if (d.ctl === "pending") {
      if (!accepted) h.onStatus("approval");
    } else if (d.ctl === "rejected") {
      done = true;
      h.onStatus("rejected", d.reason);
    } else if (d.ctl === "leave") {
      accepted = false;
      h.onStatus("disconnected");
    } else if (d.msg !== undefined && accepted) h.onMessage(d.msg);
  };
  h.onStatus("connecting");
  const join = () => !accepted && !done && post({ ctl: "join", secret: opts.secret ?? null });
  join();
  const retry = setInterval(join, 800); // bis der TV antwortet (Reihenfolge des Öffnens egal)
  return {
    send: (msg) => accepted && post({ to: "tv", msg }),
    close: () => {
      clearInterval(retry);
      post({ to: "tv", ctl: "leave" });
      ch.close();
    },
  };
}
