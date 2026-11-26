import { useEffect, useRef, useState } from "react";
import { challenge30, movementSummary, progressStats } from "@motion-arena/motion-scoring";
import { BrandMark, MainLayout, Ring } from "../components/common";
import { actions, useApp } from "../store";
import { InstallCard } from "./InstallCard";
import { TvLinkCard, TvVideoConsent } from "../components/TvLink";
import { avatarById } from "../render/avatars";
import { roomById } from "../render/rooms";
import { conceptArt, roomBackdrop } from "../render/concept-art";
import { usePhoneLink } from "../tv/phone-link";
import { VERSION_LABEL } from "../version";

const TARGETS = [5, 10, 15, 20];
const base = import.meta.env.BASE_URL;
/** Freigestelltes Standbild einer Figur aus der Arena (scripts/render-menu-figures.cjs). */
const figure = (id: string) => `${base}menu/figures/${id}.webp`;

function Icon({ d, size = 30 }: { d: string; size?: number }) {
  return (
    <svg className="menu-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

const ICONS = {
  analysis: "M3 12h4l2-6 4 12 2-6h6",
  workouts: "M2 12h3M19 12h3M5 8v8M19 8v8M8 6v12M16 6v12M8 12h8",
  progress: "M5 20V13M10 20V8M15 20v-5M20 20V4",
  studio: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 21a7 7 0 0 1 14 0M3 21h18",
  tv: "M3 5h18v12H3zM8 21h8M12 17v4",
  profile: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
};

/**
 * Hauptmenü wie bei einer Konsole: oben die Bühne (gewählte Arena, gewählter Trainer als echte 3D-Figur, großer
 * Startknopf), darunter große, per Tastatur/Fernbedienung erreichbare Kacheln. Zeigt nur echte, gespeicherte Daten.
 */
export function HomeScreen() {
  const target = useApp((s) => s.targetReps);
  const history = useApp((s) => s.history);
  const settings = useApp((s) => s.settings);
  const tvStatus = usePhoneLink((s) => s.status);
  const [tvOpen, setTvOpen] = useState(false);
  const now = new Date();
  const stats = progressStats(history, now);
  const challenge = challenge30(history, now);
  const last = stats.last;
  const summary = movementSummary(last);
  const minutes = Math.max(1, Math.round((target * 3.2 + 15) / 60));
  const trainer = avatarById(settings.trainer);
  const me = avatarById(settings.avatar);
  const lebombo = settings.arenaRoom === "lebombo";
  const room = roomById(settings.room);
  const roomName = lebombo ? "Lebombo" : room.name;
  const backdrop = lebombo ? `${base}arena/lebombo.jpg` : roomBackdrop(room.nr);
  // Gekoppelt: Fenster schließt sich, der Status steht dann direkt im Menü
  useEffect(() => {
    if (tvStatus === "connected") setTvOpen(false);
  }, [tvStatus]);

  return (
    <MainLayout className="home menu">
      <section className="menu-stage" style={{ backgroundImage: `url("${backdrop}")` }} aria-label="Dein nächstes Training">
        <header className="menu-top">
          <div className="brand">
            <BrandMark />
            <div>
              <div className="brand-name">Motion Arena</div>
              <div className="brand-sub">Kinetic Studio</div>
            </div>
          </div>
          <span className="app-version" title="Installierte Version">
            {VERSION_LABEL}
          </span>
          <button className="menu-me" onClick={() => actions.navigate("studio")} aria-label={`Dein Avatar: ${me.name} – Avatar & Arena ändern`}>
            <img src={conceptArt("avatars", me.nr)} alt="" />
            <span>
              <small>Ich</small>
              {me.name}
            </span>
          </button>
        </header>
        <div className="menu-hero">
          <div className="menu-copy">
            <p className="eyebrow">Dein nächstes Training</p>
            <h1>Kniebeugen</h1>
            <div className="hero-meta">
              <span>⏱ ca. {minutes} Min</span>
              <span>Trainer: {trainer.name}</span>
              <span>Arena: {roomName}</span>
            </div>
            <div className="segmented compact" role="group" aria-label="Anzahl Wiederholungen">
              {TARGETS.map((t) => (
                <button key={t} aria-pressed={t === target} onClick={() => actions.setTarget(t)}>
                  {t}
                </button>
              ))}
            </div>
            <button className="btn btn-primary menu-start" onClick={() => actions.openLive("camera", target)}>
              ▶ Training starten
            </button>
            <button className="link-btn" onClick={() => actions.openLive("demo", target)}>
              Demo ohne Kamera ansehen
            </button>
          </div>
          <figure className="menu-figure">
            <img src={figure(trainer.id)} alt={`Trainer ${trainer.name} in der Kniebeuge`} />
            <span className="menu-platform" aria-hidden="true" />
          </figure>
        </div>
      </section>

      <InstallCard />
      <TvVideoConsent />
      {!tvOpen && <TvLinkCard compact />}

      <nav className="menu-grid" aria-label="Hauptmenü">
        <div className="menu-tile wide analysis-entry">
          <Icon d={ICONS.analysis} />
          <div className="menu-tile-text">
            <b>Körperanalyse</b>
            <span>Freie Bewegung – Haltung und beanspruchte Zonen live (geschätzt)</span>
          </div>
          <div className="menu-tile-actions">
            <button className="btn" onClick={() => actions.openLive("camera", target, "analysis")}>
              Analyse starten
            </button>
            <button className="link-btn" onClick={() => actions.openLive("demo", target, "analysis")}>
              Analyse-Demo ohne Kamera
            </button>
          </div>
        </div>
        <MenuTile icon={ICONS.workouts} title="Workouts" text="Übungen und Programme" onClick={() => actions.navigate("training")} />
        <MenuTile icon={ICONS.progress} title="Fortschritt" text={last ? `${stats.totalReps} Wiederholungen gesamt` : "Challenges & Verlauf"} onClick={() => actions.navigate("progress")} />
        <MenuTile icon={ICONS.studio} title="Avatar & Raum" text={`${trainer.name} · ${me.name} · ${roomName}`} onClick={() => actions.navigate("studio")} />
        <MenuTile icon={ICONS.tv} title="Fernseher" text={tvStatus === "connected" ? "verbunden" : "Auf dem TV anzeigen"} onClick={() => setTvOpen(true)} />
        <MenuTile icon={ICONS.profile} title="Profil & Einstellungen" text="Erkennung, Ansicht, Daten" onClick={() => actions.navigate("profile")} />
      </nav>

      <div className="menu-cards">
        <section className="card precision-card" aria-label="Bewegungspräzision">
          <p className="eyebrow precision-title">Bewegungspräzision</p>
          <div className="precision-ring">
            <Ring size={96} value={last?.averageScore != null ? last.averageScore / 100 : null} label="Geschätzte Trainingsbewertung des letzten Trainings" />
            <span className="muted tiny">{last ? "letztes Training · geschätzt" : "noch keine Daten"}</span>
          </div>
          <div className="precision-text">
            <b>Deine Bewegung</b>
            {summary.length ? (
              <ul className="quality-list">
                {summary.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            ) : (
              <span className="muted">Nach deinem ersten Training siehst du hier, wie sauber du dich bewegst.</span>
            )}
          </div>
        </section>

        <section className="card challenge-card" aria-label="Aktive Challenge">
          <div className="row-between">
            <p className="eyebrow">Aktive Challenge</p>
            <button className="link-btn small" onClick={() => actions.navigate("progress")}>
              Mehr anzeigen ›
            </button>
          </div>
          <h2>{challenge.title}</h2>
          <p className="muted">
            An {challenge.goalDays} von {challenge.length} Tagen trainieren
          </p>
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(challenge.progress * 100)}>
            <div className="bar-fill" style={{ width: `${challenge.progress * 100}%` }} />
          </div>
          <div className="row-between small">
            <span>{challenge.day ? `Tag ${challenge.day} von ${challenge.length}` : "Startet mit deinem ersten Training"}</span>
            <span>
              {challenge.trainedDays}/{challenge.goalDays} Tage
            </span>
          </div>
        </section>
      </div>

      <p className="privacy">
        <span aria-hidden="true">🔒</span>
        <span>
          Kamerabild und Trainingsverlauf bleiben auf diesem Gerät – außer du koppelst einen Fernseher. Bewertungen sind
          Schätzungen aus dem Kamerabild – keine medizinische Beurteilung.
        </span>
      </p>

      {tvOpen && <TvDialog onClose={() => setTvOpen(false)} />}
    </MainLayout>
  );
}

function MenuTile({ icon, title, text, onClick }: { icon: string; title: string; text: string; onClick: () => void }) {
  return (
    <button className="menu-tile" onClick={onClick}>
      <Icon d={icon} />
      <span className="menu-tile-text">
        <b>{title}</b>
        <span>{text}</span>
      </span>
    </button>
  );
}

/** Fernseher koppeln – eigenes Fenster statt langer Erklärung mitten im Menü. */
function TvDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => {
      removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [onClose]);
  return (
    <div className="picker-backdrop" onClick={onClose}>
      <div className="picker-dialog tv-dialog" role="dialog" aria-modal="true" aria-label="Fernseher koppeln" ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="picker-head">
          <h2>Fernseher koppeln</h2>
          <button className="btn btn-ghost" onClick={onClose}>
            Schließen
          </button>
        </div>
        <TvLinkCard />
      </div>
    </div>
  );
}
