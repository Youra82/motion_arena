import { useRef, useState, type CSSProperties } from "react";
import { Icon } from "./common";

export interface DeckOption {
  title: string;
  sub?: string;
  icon: string;
  run: () => void;
}

const STEP = 50; // so weit ragt jede hintere Karte hervor (px)
const SWIPE = 28; // ab dieser Wischstrecke wird gedreht (px)

/**
 * Kartenstapel wie bei Apple: vorn die gewählte Möglichkeit (orange), dahinter die anderen.
 * Nach oben wischen dreht die vordere Karte in 3D nach hinten und holt die nächste nach vorn, nach unten wischen
 * zurück; eine hintere Karte antippen holt sie nach vorn; die vordere antippen startet sie.
 */
export function CardDeck({ options }: { options: DeckOption[] }) {
  const n = options.length;
  const [front, setFront] = useState(0);
  const [flip, setFlip] = useState<{ index: number; dir: 1 | -1; key: number } | null>(null);
  const [drag, setDrag] = useState(0);
  const start = useRef<{ y: number; x: number; vertical: boolean | null } | null>(null);
  const moved = useRef(false);
  if (front >= n && n) setFront(0);

  const rotate = (dir: 1 | -1) => {
    if (n < 2) return;
    // dir 1: vordere Karte nach hinten; -1: hinterste nach vorn
    const leaving = dir === 1 ? front : (front - 1 + n) % n;
    setFlip({ index: leaving, dir, key: Date.now() });
    setFront((f) => (f + dir + n) % n);
  };

  return (
    <div className="nx-deck-wrap">
      <div
        className="nx-deck"
        style={{ height: 76 + Math.max(0, n - 1) * STEP }}
        onPointerDown={(e) => {
          start.current = { y: e.clientY, x: e.clientX, vertical: null };
          moved.current = false;
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const dy = e.clientY - s.y;
          const dx = e.clientX - s.x;
          if (s.vertical === null && Math.abs(dy) + Math.abs(dx) > 8) {
            s.vertical = Math.abs(dy) > Math.abs(dx);
            if (s.vertical) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }
          if (!s.vertical) return;
          moved.current = true;
          setDrag(Math.max(-90, Math.min(90, dy)));
        }}
        onPointerUp={() => {
          const s = start.current;
          start.current = null;
          if (s?.vertical && Math.abs(drag) > SWIPE) rotate(drag < 0 ? 1 : -1);
          setDrag(0);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDrag(0);
        }}
      >
        {options.map((o, i) => {
          const k = (i - front + n) % n; // 0 = vorn
          const isFront = k === 0;
          const flipping = flip && flip.index === i;
          const dragStyle = isFront && drag ? { transform: `translateY(${drag * 0.6}px) rotateX(${(-drag / 3).toFixed(1)}deg)` } : undefined;
          // Startpunkt der Dreh-Animation: dort, wo die Karte vorher lag (vorn bzw. ganz hinten)
          const from = flipping ? (flip!.dir === 1 ? -k * STEP : (n - 1) * STEP) : 0;
          const faceStyle = { ...(dragStyle ?? {}), ["--from" as string]: `${from}px` } as CSSProperties;
          return (
            <button
              key={o.title}
              className={`nx-deck-card${isFront ? " front" : ""}`}
              style={{ top: k * STEP, zIndex: 20 - k, transform: `scale(${(1 - 0.045 * k).toFixed(3)})` }}
              aria-label={isFront ? `${o.title}${o.sub ? ` – ${o.sub}` : ""}` : `${o.title} nach vorn holen`}
              onClick={(e) => {
                if (moved.current) {
                  e.preventDefault();
                  moved.current = false;
                  return;
                }
                if (isFront) o.run();
                else {
                  setFlip({ index: front, dir: 1, key: Date.now() });
                  setFront(i);
                }
              }}
            >
              <span
                key={flipping ? flip!.key : "still"}
                className={`nx-deck-face${flipping ? (flip!.dir === 1 ? " to-back" : " to-front") : ""}`}
                style={faceStyle}
              >
                <span className="nx-deck-icon">
                  <Icon d={o.icon} size={isFront ? 16 : 15} />
                </span>
                <span className="nx-deck-text">
                  <b>{o.title}</b>
                  {isFront && o.sub ? <small>{o.sub}</small> : null}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      {n > 1 && (
        <div className="nx-deck-side" aria-hidden="true">
          {options.map((o, i) => (
            <span key={o.title} className={i === front ? "on" : ""} />
          ))}
        </div>
      )}
      {n > 1 && <p className="nx-deck-hint">Nach oben wischen oder Karte antippen</p>}
    </div>
  );
}
