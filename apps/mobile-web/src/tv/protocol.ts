import type { Landmark } from "@motion-arena/shared";
import type { HudView } from "../components/hud-view";
import { CHECK_KEYS } from "../arena/metrics";
import { isArenaRoom, type ArenaRoom } from "../arena/rooms";

/**
 * Datenprotokoll Handy → TV (Datenkanal): Gelenkpunkte und Anzeigewerte. Das Live-Bild (ggf. mit Kamerabild)
 * läuft nur mit Zustimmung als separater, verschlüsselter WebRTC-Videostream direkt im Heimnetz (siehe transport.ts).
 */
export const PROTOCOL_VERSION = 1;

/** Zustand für den TV: dieselben Anzeigedaten wie am Handy (LiveHud) plus Rahmeninformationen. */
export interface TvState {
  /** Welche Handy-Ansicht gerade aktiv ist. */
  screen: "idle" | "live" | "result";
  hud: HudView | null;
  arenaRoom?: ArenaRoom;
  /** Größe der Handy-Ansicht (CSS-Pixel) – der TV zeigt sie im gleichen Seitenverhältnis. */
  viewport: { w: number; h: number };
  viewMode: string;
  /** Handy sendet sein Live-Bild als Video (Zustimmung erteilt). */
  video: boolean;
  demo: boolean;
  summary: {
    reps: number;
    targetReps: number;
    points: number;
    averageScore: number | null;
    bestCombo: number;
    /** Wie im Ergebnis am Handy: aktive Zeit (s), nicht gezählte Versuche, Einzelwertungen. */
    activeSeconds?: number;
    failedAttempts?: number;
    scores?: number[];
  } | null;
  /** Trainingsraum und Avatar des Handys (für die Darstellung ohne Video). */
  room?: string;
  avatar?: string;
}

export type PhoneMessage =
  | { k: "hello"; v: number; app: string }
  | { k: "pose"; t: number; a: number; m: 0 | 1; p: number[] | null }
  | { k: "state"; s: TvState }
  | { k: "bye" };

export type TvMessage = { k: "hello-tv"; v: number };

const clampInt = (v: number, lo: number, hi: number) => (Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : 0);

/**
 * Gelenkpunkte kompakt als ganze Zahlen ×1000: je Punkt x, y, Sichtbarkeit, relative Tiefe (z minus Mittelwert –
 * nur für die Zeichenreihenfolge vorne/hinten beim Avatar). Älteres Format ohne Tiefe (3 Werte je Punkt) bleibt gültig.
 */
export function encodePose(lms: Landmark[] | null): number[] | null {
  if (!lms || lms.length !== 33) return null;
  const zs = lms.map((p) => (Number.isFinite(p.z) ? p.z : 0));
  const zMean = zs.reduce((a, b) => a + b, 0) / zs.length;
  const out: number[] = new Array(POSE_LEN_Z);
  lms.forEach((p, i) => {
    out[i * 4] = clampInt(p.x * 1000, COORD_MIN, COORD_MAX);
    out[i * 4 + 1] = clampInt(p.y * 1000, COORD_MIN, COORD_MAX);
    out[i * 4 + 2] = clampInt(p.visibility * 1000, 0, 1000);
    out[i * 4 + 3] = clampInt((zs[i]! - zMean) * 1000, -Z_MAX, Z_MAX);
  });
  return out;
}

const POSE_LEN = 33 * 3;
const POSE_LEN_Z = 33 * 4;
const Z_MAX = 3000;
/** Koordinaten dürfen leicht außerhalb des Bildes liegen (Gelenk knapp am Rand), Sichtbarkeit 0..1. */
const COORD_MIN = -1000;
const COORD_MAX = 2000;

/** Genau 33 dichte Tripel (bzw. Quadrupel mit Tiefe) aus ganzen Zahlen in den vereinbarten Grenzen. */
function isPackedPose(p: unknown): p is number[] {
  if (!Array.isArray(p) || (p.length !== POSE_LEN && p.length !== POSE_LEN_Z)) return false;
  const k = p.length === POSE_LEN ? 3 : 4;
  for (let i = 0; i < p.length; i++) {
    if (!(i in p)) return false; // Lücke im Array
    const n: unknown = p[i];
    if (typeof n !== "number" || !Number.isInteger(n)) return false;
    const pos = i % k;
    const ok = pos === 2 ? n >= 0 && n <= 1000 : pos === 3 ? n >= -Z_MAX && n <= Z_MAX : n >= COORD_MIN && n <= COORD_MAX;
    if (!ok) return false;
  }
  return true;
}

export function decodePose(p: number[] | null): Landmark[] | null {
  if (!isPackedPose(p)) return null;
  const k = p.length === POSE_LEN ? 3 : 4;
  const out: Landmark[] = [];
  for (let i = 0; i < p.length; i += k) {
    const z = k === 4 ? p[i + 3]! / 1000 : 0;
    out.push({ x: p[i]! / 1000, y: p[i + 1]! / 1000, z: z || 0, visibility: p[i + 2]! / 1000 });
  }
  return out;
}

/** Kopplungscode: 6 Zeichen ohne verwechselbare Zeichen (0/O, 1/I/L). */
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
/** Kryptografischer Zufall 0..1 (Fallback nur, wo crypto fehlt). */
function cryptoRandom(): number {
  const c = globalThis.crypto;
  if (c?.getRandomValues) return c.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;
  return Math.random();
}

const pick = (rand: () => number) => ALPHABET[Math.min(ALPHABET.length - 1, Math.floor(rand() * ALPHABET.length))]!;

export function newPairCode(rand: () => number = cryptoRandom): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += pick(rand);
  return s;
}

/**
 * Geheimer Schlüssel im QR-Code (24 Zeichen ≈ 119 Bit): wer ihn hat, hat den Bildschirm des Fernsehers gesehen
 * und koppelt sofort. Wer nur den 6-stelligen Code eintippt, muss am Fernseher bestätigt werden.
 */
export function newPairSecret(): string {
  let s = "";
  for (let i = 0; i < 24; i++) s += pick(cryptoRandom);
  return s;
}

export function normalizeSecret(input: string | null | undefined): string | null {
  if (!input) return null;
  const c = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length === 24 && [...c].every((ch) => ALPHABET.includes(ch)) ? c : null;
}

export function normalizeCode(input: string): string | null {
  const c = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.length === 6 && [...c].every((ch) => ALPHABET.includes(ch)) ? c : null;
}

// ---- Nachrichtenprüfung: alles vom Handy ist fremde Eingabe und wird vor dem Store vollständig geprüft ----

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, lo = -Infinity, hi = Infinity): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const int = (v: unknown, lo: number, hi: number): v is number => num(v, lo, hi) && Number.isInteger(v);
const str = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const strOrNull = (v: unknown, max: number) => v === null || str(v, max);
const bool = (v: unknown): v is boolean => typeof v === "boolean";
const oneOf = <T extends string>(v: unknown, xs: readonly T[]): v is T =>
  typeof v === "string" && (xs as readonly string[]).includes(v);

const LEVELS = ["gering", "mittel", "hoch", "unsicher"] as const;
const INTENSITIES = ["ruhig", "mäßig", "lebhaft", "unsicher"] as const;

function isBodyLoad(v: unknown): boolean {
  if (v === null) return true;
  if (!isObj(v) || !num(v.t) || !isObj(v.movement) || !isObj(v.intensity) || !isObj(v.zones)) return false;
  const mv = v.movement;
  if (!str(mv.id, 32) || !str(mv.label, 80) || !num(mv.confidence, 0, 1)) return false;
  if (!oneOf(v.intensity.level, INTENSITIES) || !num(v.intensity.value, 0, 1000)) return false;
  const zones = Object.entries(v.zones);
  if (zones.length > 20) return false;
  return zones.every(([k, z]) => str(k, 32) && isObj(z) && oneOf(z.level, LEVELS) && num(z.value, 0, 1));
}

function isHud(v: unknown): boolean {
  if (v === null) return true;
  if (!isObj(v)) return false;
  const fb = v.feedback;
  const calib = v.calib;
  const arena = v.arena;
  return (
    oneOf(v.stage, ["calibrating", "countdown", "training", "analysis"] as const) &&
    bool(v.engineRunning) &&
    bool(v.running) &&
    bool(v.demo) &&
    oneOf(v.quality, ["ok", "low-confidence", "partial", "no-person"] as const) &&
    int(v.reps, 0, 100000) &&
    int(v.targetReps, 0, 100000) &&
    num(v.points, 0, 1e9) &&
    int(v.combo, 0, 100000) &&
    (v.lastScore === null || num(v.lastScore, 0, 100)) &&
    strOrNull(v.phaseText, 80) &&
    (v.depth === null || num(v.depth, -10, 10)) &&
    isBodyLoad(v.bodyLoad) &&
    (fb === null || (isObj(fb) && num(fb.id) && str(fb.text, 200) && oneOf(fb.tone, ["good", "info", "warn"] as const))) &&
    strOrNull(v.bannerText, 300) &&
    bool(v.bannerRecalibrate) &&
    (calib === null || (isObj(calib) && num(calib.progress, 0, 1) && str(calib.message, 200))) &&
    int(v.countdown, 0, 60) &&
    bool(v.countdownHold) &&
    (arena === undefined || (
      isObj(arena) && int(arena.activeMs, 0, 1e9) && num(arena.kcal, 0, 1e6) &&
      isArenaChecks(arena.checks)
    ))
  );
}

function isArenaChecks(checks: unknown): boolean {
  return isObj(checks) && CHECK_KEYS.every((key) => oneOf(checks[key], ["good", "improve", "unknown"] as const));
}

function isSummary(v: unknown): boolean {
  if (v === null) return true;
  return (
    isObj(v) &&
    int(v.reps, 0, 100000) &&
    int(v.targetReps, 0, 100000) &&
    num(v.points, 0, 1e9) &&
    (v.averageScore === null || num(v.averageScore, 0, 100)) &&
    int(v.bestCombo, 0, 100000) &&
    (v.activeSeconds === undefined || num(v.activeSeconds, 0, 1e6)) &&
    (v.failedAttempts === undefined || int(v.failedAttempts, 0, 100000)) &&
    (v.scores === undefined || (Array.isArray(v.scores) && v.scores.length <= 200 && v.scores.every((x) => num(x, 0, 100))))
  );
}

export function isTvState(v: unknown): v is TvState {
  if (!isObj(v) || !isObj(v.viewport)) return false;
  return (
    oneOf(v.screen, ["idle", "live", "result"] as const) &&
    num(v.viewport.w, 200, 4000) &&
    num(v.viewport.h, 200, 4000) &&
    str(v.viewMode, 32) &&
    bool(v.video) &&
    bool(v.demo) &&
    isHud(v.hud) &&
    isSummary(v.summary) &&
    (v.arenaRoom === undefined || isArenaRoom(v.arenaRoom)) &&
    (v.room === undefined || str(v.room, 40)) &&
    (v.avatar === undefined || str(v.avatar, 40))
  );
}

/** Prüft eingehende Nachrichten vollständig (fremde/kaputte Daten werden verworfen). */
export function isPhoneMessage(m: unknown): m is PhoneMessage {
  if (!isObj(m)) return false;
  switch (m.k) {
    case "pose":
      return num(m.t, 0) && num(m.a, 0.2, 5) && (m.m === 0 || m.m === 1) && (m.p === null || isPackedPose(m.p));
    case "state":
      return isTvState(m.s);
    case "hello":
      return m.v === PROTOCOL_VERSION && str(m.app, 64);
    case "bye":
      return true;
    default:
      return false;
  }
}
