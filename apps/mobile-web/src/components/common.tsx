import { useEffect, useRef } from "react";
import { synthPose } from "@motion-arena/pose-engine";
import type { Landmark } from "@motion-arena/shared";
import { drawHeroScene } from "../render/draw";
import { actions, useApp, type Screen } from "../store";
import { VERSION_LABEL } from "../version";

export function BrandMark() {
  // Eigene Wort-/Bildmarke: drei versetzte Bewegungsbalken (keine Fremdmarke).
  return (
    <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
      <rect x="4" y="10" width="9" height="24" rx="4.5" fill="#FF704B" transform="skewX(-14)" />
      <rect x="17" y="6" width="9" height="28" rx="4.5" fill="#FF704B" opacity="0.75" transform="skewX(-14)" />
      <rect x="30" y="14" width="9" height="20" rx="4.5" fill="#47D4D0" transform="skewX(-14)" />
    </svg>
  );
}

export function BrandHeader() {
  return (
    <header className="brand">
      <BrandMark />
      <div>
        <div className="brand-name">Motion Arena</div>
        <div className="brand-sub">Kinetic Studio</div>
      </div>
      <span className="app-version" title="Installierte Version">
        {VERSION_LABEL}
      </span>
    </header>
  );
}

/** Ring mit Prozentwert (Bewegungspräzision, Challenge …). value 0..1 oder null = keine Daten. */
export function Ring({ value, label, size = 120 }: { value: number | null; label: string; size?: number }) {
  const r = size / 2 - 9;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${label}: ${value === null ? "noch keine Daten" : `${Math.round(v * 100)} von 100`}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-raised)" strokeWidth="9" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="url(#ringGrad)"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - v)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FF8A62" />
          <stop offset="1" stopColor="#FF704B" />
        </linearGradient>
      </defs>
      <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" fill="var(--text)" fontSize={size * 0.24} fontWeight="800">
        {value === null ? "–" : `${Math.round(v * 100)}`}
        {value !== null && (
          <tspan fontSize={size * 0.12} fontWeight="600">
            %
          </tspan>
        )}
      </text>
    </svg>
  );
}

/** Stilisierte Kniebeuge mit Bewegungsspur – mit der eigenen Engine gezeichnet (synthetische Posen). */
export function HeroFigure() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (!w || !h) return;
      canvas.width = w;
      canvas.height = h;
      const aspect = w / h;
      const flexes = [5, 30, 55, 85];
      const poses: Landmark[][] = flexes.map(
        (flex, k) =>
          synthPose({ kneeFlexDeg: flex, view: "side", aspect, scale: 0.72, groundY: 0.9, centerX: 0.5 - (3 - k) * 0.035 })
            .landmarks,
      );
      const ctx = canvas.getContext("2d");
      if (ctx) drawHeroScene(ctx, w, h, poses);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);
  return <canvas ref={ref} className="hero-figure" aria-hidden="true" />;
}

type NavId = Exclude<Screen, "live" | "result" | "tv">;
const NAV: Array<{ id: NavId; label: string; icon: string; also?: NavId[] }> = [
  { id: "home", label: "Heute", icon: "M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z", also: ["workout"] },
  { id: "programs", label: "Programme", icon: "M4 5h16v15H4zM4 10h16M9 3v4M15 3v4", also: ["planner", "program", "builder"] },
  { id: "training", label: "Übungen", icon: "M2 12h3M19 12h3M5 8v8M19 8v8M8 6v12M16 6v12M8 12h8" },
  { id: "progress", label: "Fortschritt", icon: "M5 20V13M10 20V8M15 20v-5M20 20V4" },
  { id: "profile", label: "Profil", icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0", also: ["studio"] },
];

function NavIcon({ d }: { d: string }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

/** Untere Navigation: Heute · Programme · Übungen · Fortschritt · Profil. */
export function BottomNav() {
  const screen = useApp((s) => s.screen);
  return (
    <nav className="bottom-nav" aria-label="Hauptnavigation">
      {NAV.map((n) => {
        const here = screen === n.id || !!n.also?.includes(screen as NavId);
        return (
          <button key={n.id} className="nav-item" aria-current={here ? "page" : undefined} onClick={() => actions.navigate(n.id)}>
            <NavIcon d={n.icon} />
            <span>{n.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** Freigestelltes Foto eines Trainers (Kniebeuge, aus der Figuren-Werkstatt). */
export const trainerPhoto = (id: string) => `${import.meta.env.BASE_URL}menu/figures/${id}.webp`;

/** Einfaches Linien-Symbol (eigene Pfade, keine Fremd-Icons). */
export function Icon({ d, size = 22, className = "" }: { d: string; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export const ICONS = {
  back: "M15 5l-7 7 7 7",
  close: "M6 6l12 12M18 6 6 18",
  next: "M9 5l7 7-7 7",
  play: "M7 4v16l13-8z",
  sparkle: "M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z",
  blocks: "M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM17 14v6M14 17h6",
  list: "M4 6h16M4 12h16M4 18h10",
  analysis: "M3 12h4l2-6 4 12 2-6h6",
  studio: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21a7 7 0 0 1 14 0",
  tv: "M3 5h18v12H3zM8 21h8M12 17v4",
  check: "M5 12l5 5 9-10",
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 16a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  timer: "M12 8v5l3 2M9 2h6M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  restart: "M4 12a8 8 0 1 0 2.3-5.6M4 4v5h5",
};

/** Rahmen für die Hauptbereiche: Inhalt + untere Navigation. */
export function MainLayout({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <>
      <main className={`page ${className}`}>{children}</main>
      <BottomNav />
    </>
  );
}
