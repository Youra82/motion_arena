import { useRef, type CSSProperties } from "react";

/** Farbe je Stufe: von Türkis (leicht) über Grün und Gelb nach Rot (schwer). */
export function levelHue(level: number, max: number): number {
  return Math.round(176 - ((level - 1) / Math.max(1, max - 1)) * 172);
}

/**
 * Stufenwahl als ansteigende Balkenleiste (wie eine Intensitätsanzeige): antippen oder mit dem Finger darüberziehen.
 * Jeder Balken ist ein eigener Knopf – auch per Tastatur und Bildschirmleser bedienbar.
 */
export function LevelMeter({ value, names, onChange }: { value: number; names: string[]; onChange: (level: number) => void }) {
  const max = names.length;
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const pick = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r || !r.width) return;
    const level = Math.max(1, Math.min(max, Math.floor(((clientX - r.left) / r.width) * max) + 1));
    if (level !== value) onChange(level);
  };
  const hue = levelHue(value, max);
  return (
    <div className="nx-meter" style={{ "--lv-hue": hue } as CSSProperties}>
      <div className="nx-meter-head" aria-hidden="true">
        <span className="nx-meter-num">{value}</span>
        <span className="nx-meter-name">
          {(names[value - 1] ?? "").replace(/^./, (c) => c.toUpperCase())}
          <small>Stufe {value} von {max}</small>
        </span>
      </div>
      <div
        ref={box}
        className="nx-meter-bars"
        role="group"
        aria-label="Stufe wählen"
        onPointerDown={(e) => {
          dragging.current = true;
          (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
          pick(e.clientX);
        }}
        onPointerMove={(e) => dragging.current && pick(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        {names.map((n, i) => {
          const level = i + 1;
          const on = level <= value;
          return (
            <button
              key={level}
              type="button"
              className={`nx-meter-bar${on ? " on" : ""}${level === value ? " cur" : ""}`}
              aria-pressed={level === value}
              aria-label={`Stufe ${level} – ${n}`}
              style={{ "--h": `${30 + (70 * i) / (max - 1)}%`, "--bar-hue": levelHue(level, max) } as CSSProperties}
              onClick={() => onChange(level)}
            >
              <span>{level}</span>
            </button>
          );
        })}
      </div>
      <div className="nx-levels-scale" aria-hidden="true">
        <span>leicht</span>
        <span>schwer</span>
      </div>
    </div>
  );
}
