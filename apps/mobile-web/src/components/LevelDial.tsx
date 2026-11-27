import { useRef } from "react";

/** Farbe je Stufe: von Türkis (leicht) über Grün und Gelb nach Rot (schwer). */
export function levelHue(level: number, max: number): number {
  return Math.round(176 - ((level - 1) / Math.max(1, max - 1)) * 172);
}

const SWEEP = 270; // Drehbereich wie bei einem Lautstärkeknopf: 1 links unten, höchste Stufe rechts unten
const START = -SWEEP / 2; // Grad ab 12 Uhr, im Uhrzeigersinn
const R = 74;
const C = 100;

function point(deg: number, r: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function arcPath(fromDeg: number, toDeg: number, r: number): string {
  const [x1, y1] = point(fromDeg, r);
  const [x2, y2] = point(toDeg, r);
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

/**
 * Stufe 1–10 als analoger Drehregler (gleiches Aussehen wie der Pausen-Regler): Knopf im Bogen ziehen oder auf eine Zahl
 * tippen; „−“/„+“ zum Feinstellen; per Tastatur mit den Pfeiltasten.
 */
export function LevelDial({ value, names, onChange }: { value: number; names: string[]; onChange: (level: number) => void }) {
  const max = names.length;
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const last = useRef(value);
  last.current = value;
  const angleOf = (level: number) => START + ((level - 1) / (max - 1)) * SWEEP;

  const pick = (clientX: number, clientY: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    const x = clientX - (r.left + r.width / 2);
    const y = clientY - (r.top + r.height / 2);
    const deg = (Math.atan2(x, -y) * 180) / Math.PI; // 0 = oben, positiv im Uhrzeigersinn
    let level: number;
    // unten zwischen 1 und 10 liegt kein Wert: dort beim nächstgelegenen Ende bleiben, nicht springen
    if (Math.abs(deg) > SWEEP / 2) level = last.current > max / 2 ? max : 1;
    else level = Math.round(((deg - START) / SWEEP) * (max - 1)) + 1;
    level = Math.max(1, Math.min(max, level));
    if (level !== last.current) {
      last.current = level;
      onChange(level);
    }
  };

  const hue = levelHue(value, max);
  const color = `hsl(${hue} 68% 58%)`;
  const [kx, ky] = point(angleOf(value), R);
  const name = (names[value - 1] ?? "").replace(/^./, (c) => c.toUpperCase());

  return (
    <div className="nx-dial">
      <svg
        ref={svg}
        viewBox="0 0 200 200"
        role="slider"
        tabIndex={0}
        aria-label="Stufe wählen"
        aria-valuemin={1}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`Stufe ${value} – ${names[value - 1] ?? ""}`}
        onPointerDown={(e) => {
          e.preventDefault(); // kein Fokusrahmen/keine Textauswahl beim Drehen mit dem Finger
          dragging.current = true;
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          pick(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => dragging.current && pick(e.clientX, e.clientY)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={(e) => {
          const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
          if (!d) return;
          e.preventDefault();
          onChange(Math.max(1, Math.min(max, value + d)));
        }}
      >
        <defs>
          <radialGradient id="nx-level-face" cx="50%" cy="40%" r="60%">
            <stop offset="0" stopColor="#24393f" />
            <stop offset="1" stopColor="#14232a" />
          </radialGradient>
        </defs>
        <circle cx={C} cy={C} r={96} fill="url(#nx-level-face)" stroke="rgba(244,242,236,0.12)" />
        {/* Striche und Zahlen je Stufe, bis zur gewählten in ihrer Farbe */}
        {names.map((_, i) => {
          const level = i + 1;
          const deg = angleOf(level);
          const [x1, y1] = point(deg, 87);
          const [x2, y2] = point(deg, 94);
          const [tx, ty] = point(deg, 55);
          const on = level <= value;
          const c = `hsl(${levelHue(level, max)} 68% 58%)`;
          return (
            <g key={level}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={on ? c : "rgba(244,242,236,0.28)"} strokeWidth={2.2} strokeLinecap="round" />
              <text x={tx} y={ty + 4} textAnchor="middle" className={`nx-dial-label${level === value ? " cur" : ""}`} style={level === value ? { fill: c } : undefined}>
                {level}
              </text>
            </g>
          );
        })}
        <path d={arcPath(START, START + SWEEP, R)} fill="none" stroke="rgba(244,242,236,0.1)" strokeWidth={12} strokeLinecap="round" />
        {/* gefüllter Bogen als Farbverlauf: jedes Teilstück in der Farbe seiner Stufe */}
        {Array.from({ length: value - 1 }, (_, i) => (
          <path
            key={i}
            d={arcPath(angleOf(i + 1), angleOf(i + 2), R)}
            fill="none"
            stroke={`hsl(${levelHue(i + 1.5, max)} 68% 58%)`}
            strokeWidth={12}
            strokeLinecap="round"
          />
        ))}
        {value === 1 && <circle cx={kx} cy={ky} r={6} fill={color} />}
        <circle cx={kx} cy={ky} r={13} fill="#f4f2ec" stroke={color} strokeWidth={3} className="nx-dial-knob" />
        <text x={C} y={C + 6} textAnchor="middle" className="nx-dial-value" style={{ fill: color }}>
          {value}
        </text>
        <text x={C} y={C + 26} textAnchor="middle" className="nx-dial-unit">
          {name}
        </text>
      </svg>
      <div className="nx-dial-fine">
        <button type="button" aria-label="Eine Stufe leichter" disabled={value <= 1} onClick={() => onChange(value - 1)}>
          −
        </button>
        <span className="nx-dial-caption">
          Stufe {value} von {max}
        </span>
        <button type="button" aria-label="Eine Stufe schwerer" disabled={value >= max} onClick={() => onChange(value + 1)}>
          +
        </button>
      </div>
    </div>
  );
}
