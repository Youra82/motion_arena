import { useRef, useState, type ReactNode } from "react";

const OPEN = 96; // Breite des Löschen-Knopfs
const FULL = 0.62; // ab diesem Anteil der Zeilenbreite löscht ein langer Wisch sofort (wie in iOS)

/**
 * Zeile, die sich wie in iOS nach links wischen lässt: ein roter „Löschen“-Knopf erscheint; ein langer Wisch löscht
 * direkt. Für Tastatur/Screenreader ist der Knopf erreichbar und klappt die Zeile beim Fokussieren auf.
 */
export function SwipeToDelete({ children, onDelete, label }: { children: ReactNode; onDelete: () => void; label: string }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; dx: number; horizontal: boolean | null } | null>(null);
  const moved = useRef(false);

  const width = () => row.current?.clientWidth ?? 360;
  const remove = () => {
    setDx(-width());
    setTimeout(onDelete, 180);
  };

  return (
    <div className="swipe-row" ref={row}>
      <div
        className={`swipe-content${dragging ? " dragging" : ""}`}
        style={{ transform: `translateX(${dx}px)` }}
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY, dx, horizontal: null };
          moved.current = false;
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (!s) return;
          const mx = e.clientX - s.x;
          const my = e.clientY - s.y;
          if (s.horizontal === null && Math.abs(mx) + Math.abs(my) > 8) {
            s.horizontal = Math.abs(mx) > Math.abs(my);
            if (s.horizontal) (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          }
          if (!s.horizontal) return;
          moved.current = true;
          setDragging(true);
          setDx(Math.min(0, Math.max(-width(), s.dx + mx)));
        }}
        onPointerUp={() => {
          const s = start.current;
          start.current = null;
          setDragging(false);
          if (!s?.horizontal) return;
          if (-dx > width() * FULL) remove();
          else setDx(-dx > OPEN / 2 ? -OPEN : 0);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDragging(false);
          setDx(0);
        }}
        onClickCapture={(e) => {
          // Nach einem Wisch kein Antippen auslösen; offene Zeile schließt beim Antippen
          if (moved.current) {
            // Klick direkt nach dem Wisch: nur schlucken, Zeile bleibt offen
            e.preventDefault();
            e.stopPropagation();
            moved.current = false;
          } else if (dx !== 0) {
            // Antippen einer offenen Zeile schließt sie wieder (wie in iOS)
            e.preventDefault();
            e.stopPropagation();
            setDx(0);
          }
        }}
      >
        {children}
      </div>
      <button
        className="swipe-delete"
        aria-label={label}
        style={{ width: Math.max(OPEN, -dx) }}
        onFocus={() => setDx(-OPEN)}
        onClick={remove}
      >
        Löschen
      </button>
    </div>
  );
}
