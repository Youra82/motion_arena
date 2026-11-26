/** Spiegelungsmodi – gemeinsam für Store, Speicherung und Anzeigen. */
/** Spiegelungsmodi aus FEATURES.md. */
export type ViewMode =
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
  { id: "hybrid", label: "Hybrid", needsCamera: true },
  { id: "echtbild", label: "Echtbild", needsCamera: true },
  { id: "silhouette", label: "Silhouette", needsCamera: true, note: "lokal freigestellt" },
  { id: "skelett", label: "Skelett", needsCamera: false },
  { id: "gitter", label: "Gittermodell", needsCamera: false },
  { id: "hologramm", label: "Hologramm", needsCamera: false },
  { id: "avatar", label: "Avatar", needsCamera: false, note: "stilisiert, 2D" },
  { id: "muskel", label: "Muskelansicht", needsCamera: false, note: "geschätzte Beanspruchung" },
  { id: "zonen", label: "Bewegungszonen", needsCamera: false, note: "Bewegungsintensität" },
  { id: "spur", label: "Bewegungsspur", needsCamera: false },
];

export const isViewMode = (v: string): v is ViewMode => VIEW_MODES.some((m) => m.id === v);
