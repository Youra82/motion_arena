import { useRef } from "react";

export const REST_MIN = 5;
export const REST_MAX = 120;
const MAX = REST_MAX; // eine volle Umdrehung = 2 Minuten
const MIN = REST_MIN;
const MAJOR = 15; // lange Striche alle 15 s
const R = 74; // Radius der Skala
const C = 100; // Mitte (viewBox 200×200)

const fmt = (s: number) => (s < 60 ? `${s} s` : s % 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min` : `${s / 60} min`);

/** Punkt auf dem Kreis für einen Sekundenwert (0 s oben, im Uhrzeigersinn). */
function at(sec: number, r: number): [number, number] {
  const a = (sec / MAX) * 2 * Math.PI - Math.PI / 2;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

/**
 * Pausenlänge als analoger Drehregler (wie eine Küchenuhr): Knopf im Kreis ziehen oder auf die Skala tippen – jede
 * Sekunde von 5 s bis 2 min; „−1 s“/„+1 s“ zum Feinstellen. Per Tastatur: Pfeile ±1 s, Bild auf/ab ±10 s.
 */
export function RestDial({ value, onChange }: { value: number; onChange: (sec: number) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const last = useRef(value);
  last.current = value;

  const pick = (clientX: number, clientY: number) => {
    const r = svg.current?.getBoundingClientRect();
    if (!r) return;
    const x = clientX - (r.left + r.width / 2);
    const y = clientY - (r.top + r.height / 2);
    let deg = (Math.atan2(y, x) * 180) / Math.PI + 90;
    if (deg < 0) deg += 360;
    let sec = Math.round((deg / 360) * MAX);
    // über die 12-Uhr-Stelle hinaus nicht springen: oben bleibt es bei 2 min bzw. beim Minimum
    if (last.current > MAX * 0.75 && sec < MAX * 0.25) sec = MAX;
    else if (last.current < MAX * 0.25 && sec > MAX * 0.75) sec = MIN;
    sec = Math.max(MIN, Math.min(MAX, sec));
    if (sec !== last.current) {
      last.current = sec;
      onChange(sec);
    }
  };

  const [kx, ky] = at(value, R);
  const large = value > MAX / 2 ? 1 : 0;
  const [sx, sy] = at(0, R);
  const arc = value >= MAX ? `M ${C} ${C - R} A ${R} ${R} 0 1 1 ${C - 0.01} ${C - R}` : `M ${sx} ${sy} A ${R} ${R} 0 ${large} 1 ${kx} ${ky}`;

  return (
    <div className="nx-dial">
      <svg
        ref={svg}
        viewBox="0 0 200 200"
        role="slider"
        tabIndex={0}
        aria-label="Pause zwischen den Sätzen"
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={value}
        aria-valuetext={fmt(value)}
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
          const d =
            e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : e.key === "PageUp" ? 10 : e.key === "PageDown" ? -10 : 0;
          if (!d) return;
          e.preventDefault();
          onChange(Math.max(MIN, Math.min(MAX, value + d)));
        }}
      >
        <defs>
          <linearGradient id="nx-dial-arc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#47d4d0" />
            <stop offset="1" stopColor="#2fa8c8" />
          </linearGradient>
          <radialGradient id="nx-dial-face" cx="50%" cy="40%" r="60%">
            <stop offset="0" stopColor="#24393f" />
            <stop offset="1" stopColor="#14232a" />
          </radialGradient>
        </defs>
        {/* Zifferblatt */}
        <circle cx={C} cy={C} r={96} fill="url(#nx-dial-face)" stroke="rgba(244,242,236,0.12)" />
        {/* Striche alle 5 s, längere alle 15 s */}
        {Array.from({ length: MAX / 5 }, (_, i) => {
          const s = i * 5;
          const major = s % MAJOR === 0;
          const [x1, y1] = at(s, major ? 88 : 90);
          const [x2, y2] = at(s, 94);
          return <line key={s} x1={x1} y1={y1} x2={x2} y2={y2} stroke={s <= value && s > 0 ? "#47d4d0" : "rgba(244,242,236,0.28)"} strokeWidth={major ? 2.2 : 1.2} strokeLinecap="round" />;
        })}
        {/* Beschriftung wie auf einer Uhr */}
        {[30, 60, 90].map((s) => {
          const [x, y] = at(s, 54);
          return (
            <text key={s} x={x} y={y + 4} textAnchor="middle" className="nx-dial-label">
              {s === 60 ? "1 min" : s === 90 ? "1:30" : "30 s"}
            </text>
          );
        })}
        {/* Spur und gefüllter Bogen */}
        <circle cx={C} cy={C} r={R} fill="none" stroke="rgba(244,242,236,0.1)" strokeWidth={12} />
        <path d={arc} fill="none" stroke="url(#nx-dial-arc)" strokeWidth={12} strokeLinecap="round" />
        {/* Drehknopf */}
        <circle cx={kx} cy={ky} r={13} fill="#f4f2ec" stroke="#47d4d0" strokeWidth={3} className="nx-dial-knob" />
        {/* Wert in der Mitte */}
        <text x={C} y={C + 4} textAnchor="middle" className="nx-dial-value">
          {value < 60 ? value : value % 60 ? `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}` : value / 60}
        </text>
        <text x={C} y={C + 24} textAnchor="middle" className="nx-dial-unit">
          {value < 60 ? "Sekunden" : value === 60 ? "Minute" : "Minuten"}
        </text>
      </svg>
      <div className="nx-dial-fine">
        <button type="button" aria-label="Pause 1 Sekunde kürzer" disabled={value <= MIN} onClick={() => onChange(Math.max(MIN, value - 1))}>
          −1 s
        </button>
        <span className="nx-dial-caption">Pause zwischen den Sätzen</span>
        <button type="button" aria-label="Pause 1 Sekunde länger" disabled={value >= MAX} onClick={() => onChange(Math.min(MAX, value + 1))}>
          +1 s
        </button>
      </div>
    </div>
  );
}
