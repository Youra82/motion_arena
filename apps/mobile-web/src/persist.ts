import type { TrainingEntry } from "@motion-arena/motion-scoring";
import { isViewMode, type ViewMode } from "./view-modes";
import { DEFAULT_ROOM, isRoomId } from "./render/rooms";
import { DEFAULT_AVATAR, isAvatarId } from "./render/avatars";
import { ARENA_ROOMS, isArenaRoom, type ArenaRoom } from "./arena/rooms";

/**
 * Speicherung auf dem Gerät (localStorage). Nichts wird übertragen.
 * Fehler (privater Modus, voller Speicher) brechen nichts ab; Schreib-/Löschfunktionen melden Erfolg zurück.
 */
const HISTORY_KEY = "motion-arena.history.v1";
const SETTINGS_KEY = "motion-arena.settings.v1";
const MAX_ENTRIES = 1000;

export interface Settings {
  modelVariant: "lite" | "full";
  defaultTarget: number;
  /** Zuletzt gewählte Ansicht mit Kamera. */
  defaultView: ViewMode;
  /** Trainingstage pro Woche (Trainingsplan). */
  weeklyGoal: number;
  /** Live-Bild (inkl. Kamerabild) an gekoppelten Fernseher senden: noch fragen / ja / nein. */
  tvVideo: "ask" | "on" | "off";
  /** Trainingsraum (Hintergrund der Ansichten ohne Kamerabild). */
  room: string;
  /** Avatar für die Ansicht „Avatar“. */
  avatar: string;
  /** Trainer-Avatar (macht die Übung vor). */
  trainer: string;
  arenaRoom: ArenaRoom;
}

export const DEFAULT_SETTINGS: Settings = { modelVariant: "lite", defaultTarget: 10, defaultView: "arena", weeklyGoal: 3, tvVideo: "ask", room: DEFAULT_ROOM, avatar: DEFAULT_AVATAR, trainer: DEFAULT_AVATAR, arenaRoom: ARENA_ROOMS[0].id };

/** Speicher des Browsers; null = gibt es nicht, "denied" = Zugriff verweigert (z. B. Datenschutzeinstellung). */
function storage(): Storage | null | "denied" {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return "denied";
  }
}

function read<T>(key: string): T | null {
  try {
    const st = storage();
    const raw = st && st !== "denied" ? st.getItem(key) : null;
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Schreibt; false bei vollem/gesperrtem Speicher. */
function write(key: string, value: unknown): boolean {
  try {
    const st = storage();
    if (!st || st === "denied") return false;
    st.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

const num = (v: unknown, min = 0): v is number => typeof v === "number" && Number.isFinite(v) && v >= min;
const COMPONENT_KEYS = new Set(["depth", "control", "symmetry", "posture"]);

/** Strenge Prüfung eines gespeicherten Eintrags – kaputte oder fremde Daten dürfen keine Anzeige stören. */
function isEntry(e: unknown): e is TrainingEntry {
  if (!e || typeof e !== "object") return false;
  const x = e as Record<string, unknown>;
  if (typeof x.id !== "string" || x.id === "") return false;
  if (typeof x.date !== "string" || !Number.isFinite(Date.parse(x.date))) return false;
  if (x.exerciseId !== "squat") return false;
  if (!Number.isInteger(x.reps) || !num(x.reps)) return false;
  if (!Number.isInteger(x.targetReps) || !num(x.targetReps)) return false;
  if (!num(x.points) || !num(x.bestCombo) || !num(x.activeSeconds)) return false;
  if (x.averageScore !== null && !(num(x.averageScore) && x.averageScore <= 100)) return false;
  const c = x.components;
  if (!c || typeof c !== "object" || Array.isArray(c)) return false;
  for (const [k, v] of Object.entries(c)) if (!COMPONENT_KEYS.has(k) || !num(v) || v > 1) return false;
  return true;
}

export function loadHistory(): TrainingEntry[] {
  const v = read<unknown>(HISTORY_KEY);
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: TrainingEntry[] = [];
  for (const e of v) {
    if (!isEntry(e) || seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
  }
  return out.slice(-MAX_ENTRIES); // gleiche Aufbewahrungsregel wie beim Schreiben
}

/**
 * Speichert höchstens die letzten 1000 Einträge. Gibt genau diese Liste zurück (für den Store) und ob das
 * Schreiben geklappt hat – bei vollem/gesperrtem Speicher zeigt das Profil das an.
 */
export function saveHistory(entries: TrainingEntry[]): { entries: TrainingEntry[]; ok: boolean } {
  const kept = entries.slice(-MAX_ENTRIES);
  return { entries: kept, ok: write(HISTORY_KEY, kept) };
}

export function loadSettings(): Settings {
  const raw = read<unknown>(SETTINGS_KEY);
  const v: Partial<Record<keyof Settings, unknown>> = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    modelVariant: v.modelVariant === "full" ? "full" : "lite",
    defaultTarget: [5, 10, 15, 20].includes(v.defaultTarget as number) ? (v.defaultTarget as number) : DEFAULT_SETTINGS.defaultTarget,
    defaultView: typeof v.defaultView === "string" && isViewMode(v.defaultView) ? v.defaultView : DEFAULT_SETTINGS.defaultView,
    weeklyGoal:
      typeof v.weeklyGoal === "number" && Number.isInteger(v.weeklyGoal) && v.weeklyGoal >= 1 && v.weeklyGoal <= 7
        ? v.weeklyGoal
        : DEFAULT_SETTINGS.weeklyGoal,
    tvVideo: v.tvVideo === "on" || v.tvVideo === "off" ? v.tvVideo : "ask",
    room: isRoomId(v.room) ? v.room : DEFAULT_SETTINGS.room,
    avatar: isAvatarId(v.avatar) ? v.avatar : DEFAULT_SETTINGS.avatar,
    trainer: isAvatarId(v.trainer) ? v.trainer : DEFAULT_SETTINGS.trainer,
    arenaRoom: isArenaRoom(v.arenaRoom) ? v.arenaRoom : DEFAULT_SETTINGS.arenaRoom,
  };
}

export function saveSettings(s: Settings): boolean {
  return write(SETTINGS_KEY, s);
}

/**
 * Notfall, wenn ein Widerruf nicht gespeichert werden kann: gespeicherte Einstellungen ganz entfernen, damit beim
 * nächsten Start nicht die alte Freigabe gilt (danach wird wieder gefragt). false, wenn auch das scheitert.
 */
export function forgetSettings(): boolean {
  try {
    const st = storage();
    if (!st || st === "denied") return false;
    st.removeItem(SETTINGS_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Löscht den Verlauf; false, wenn der Speicher das verweigert. */
export function clearAll(): boolean {
  try {
    const st = storage();
    if (st === "denied") return false; // Zugriff verweigert → Löschen nicht bestätigt
    if (!st) return true; // kein Speicher vorhanden → es gibt nichts zu löschen
    st.removeItem(HISTORY_KEY);
    return true;
  } catch {
    return false;
  }
}
