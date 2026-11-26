/** Spiegelungsmodi – gemeinsam für Store, Speicherung und Anzeigen. */
/** Spiegelungsmodi aus FEATURES.md. */
export type ViewMode =
  | "arena"
  | "echtbild"
  | "silhouette"
  | "skelett"
  | "gitter"
  | "hologramm"
  | "avatar"
  | "muskel"
  | "zonen"
  | "spur"
  | "hybrid";

export const VIEW_MODES: Array<{ id: ViewMode; label: string; needsCamera: boolean; note?: string }> = [
  { id: "arena", label: "Arena", needsCamera: false, note: "Training mit Hologramm und Trainer" },
  { id: "hybrid", label: "Hybrid", needsCamera: true },
  { id: "echtbild", label: "Echtbild", needsCamera: true },
  { id: "silhouette", label: "Silhouette", needsCamera: true, note: "lokal freigestellt" },
  { id: "skelett", label: "Skelett", needsCamera: false },
  { id: "gitter", label: "Gittermodell", needsCamera: false },
  { id: "hologramm", label: "Hologramm", needsCamera: false },
  { id: "avatar", label: "Avatar", needsCamera: false, note: "Ausgewählte Live-Figur" },
  { id: "muskel", label: "Muskelansicht", needsCamera: false, note: "geschätzte Beanspruchung" },
  { id: "zonen", label: "Bewegungszonen", needsCamera: false, note: "Bewegungsintensität" },
  { id: "spur", label: "Bewegungsspur", needsCamera: false },
];

export const isViewMode = (v: string): v is ViewMode => VIEW_MODES.some((m) => m.id === v);

export function hasLiveStage(mode: ViewMode, avatar: string): boolean {
  return mode === "arena" || mode === "muskel" || mode === "zonen" || mode === "gitter" || mode === "skelett" ||
    mode === "hologramm" || mode === "spur" || (mode === "avatar" && avatar === "lukas");
}
