import { useEffect, useRef, useState } from "react";
import { ICONS, Icon, MainLayout, trainerPhoto } from "../components/common";
import { actions, useApp } from "../store";
import { InstallCard } from "./InstallCard";
import { TvLinkCard, TvVideoConsent } from "../components/TvLink";
import { avatarById } from "../render/avatars";
import { roomById } from "../render/rooms";
import { roomBackdrop } from "../render/concept-art";
import { usePhoneLink } from "../tv/phone-link";
import { VERSION_LABEL } from "../version";
import { programView } from "../program/view";

const base = import.meta.env.BASE_URL;

function greeting(h: number): string {
  if (h < 11) return "Guten Morgen";
  if (h < 17) return "Hallo";
  return "Guten Abend";
}

/** Bühnenbild der gewählten Arena (Startseite, Programm-Seiten). */
export function useStage() {
  const settings = useApp((s) => s.settings);
  const trainer = avatarById(settings.trainer);
  const lebombo = settings.arenaRoom === "lebombo";
  const room = roomById(settings.room);
  return {
    trainer,
    roomName: lebombo ? "Lebombo" : room.name,
    backdrop: lebombo ? `${base}arena/lebombo.jpg` : roomBackdrop(room.nr),
  };
}

const TILE_ICONS = {
  training: "M2 12h3M19 12h3M5 8v8M19 8v8M8 6v12M16 6v12M8 12h8",
  programs: "M4 5h16v15H4zM4 10h16M9 3v4M15 3v4",
  analysis: ICONS.analysis,
  progress: "M5 20V13M10 20V8M15 20v-5M20 20V4",
  studio: ICONS.studio,
  tv: ICONS.tv,
};

/**
 * Startseite: Begrüßung in der eigenen Arena mit dem eigenen Trainer, ein klarer nächster Schritt (Training fortsetzen,
 * nächste Programm-Einheit oder Training wählen) und darunter das Hauptmenü mit allen Bereichen. Alle Zahlen stammen
 * aus Programm und gespeichertem Verlauf.
 */
export function HomeScreen() {
  const program = useApp((s) => s.program);
  const workout = useApp((s) => s.workout);
  const history = useApp((s) => s.history);
  const tvStatus = usePhoneLink((s) => s.status);
  const [tvOpen, setTvOpen] = useState(false);
  const { trainer, backdrop, roomName } = useStage();
  const view = program ? programView(program) : null;
  const running = workout && workout.index < workout.steps.length ? workout : null;
  const totalReps = history.reduce((t, e) => t + e.reps, 0);
  // „Neu starten“: zuletzt gestartetes Training – sonst die letzte Kniebeugen-Einheit aus dem Verlauf
  const lastSquat = history.at(-1);
  const restart = workout
    ? { label: `Neu starten: ${workout.title}`, run: () => actions.restartWorkout() }
    : lastSquat
      ? { label: `Neu starten: Kniebeugen ${lastSquat.targetReps}×`, run: () => actions.openLive("camera", lastSquat.targetReps) }
      : null;
  useEffect(() => {
    if (tvStatus === "connected") setTvOpen(false);
  }, [tvStatus]);

  const coach = running
    ? `Wir waren bei ${running.title} – machen wir weiter?`
    : view && !view.finished
      ? `Heute steht ${view.next.title} an. Ich bin bereit!`
      : history.length
        ? "Schön, dass du wieder da bist!"
        : `Hi, ich bin ${trainer.name}. Such dir aus, womit wir starten.`;

  return (
    <MainLayout className="nx-home">
      <section className="nx-stage" aria-label="Willkommen">
        <img className="nx-stage-bg" src={backdrop} alt="" />
        <img className="nx-stage-trainer" src={trainerPhoto(trainer.id)} alt={`Trainer ${trainer.name}`} />
        <header className="nx-top">
          <div className="nx-brand">
            MOTION <span>ARENA</span>
          </div>
          <span className="app-version" title="Installierte Version">
            {VERSION_LABEL}
          </span>
          <div className="nx-top-actions">
            <button className="nx-round" aria-label={tvStatus === "connected" ? "Fernseher verbunden" : "Auf dem Fernseher zeigen"} onClick={() => setTvOpen(true)}>
              <Icon d={ICONS.tv} size={20} />
            </button>
            <button className="nx-round" aria-label="Profil und Einstellungen" onClick={() => actions.navigate("profile")}>
              <Icon d={ICONS.studio} size={20} />
            </button>
          </div>
        </header>
        <p className="nx-coach">{coach}</p>

        <div className="nx-today">
          <span className="nx-hello">{greeting(new Date().getHours())}</span>
          <h1>Bereit fürs Training?</h1>
          <p className="nx-meta">
            Mit {trainer.name} · {roomName}
          </p>
          {(() => {
            // Hauptkarte vorn, weitere Möglichkeiten als Karten dahinter gestapelt (jede ragt als Knopfstreifen hervor)
            const primary = running
              ? { title: "Training fortsetzen", sub: `${running.title} · Übung ${running.index + 1} von ${running.steps.length}`, icon: ICONS.play, run: () => actions.openWorkout() }
              : view && !view.finished
                ? { title: `Weiter: ${view.next.title}`, sub: `${view.name} · Woche ${view.week} · Tag ${view.dayInWeek} · ${view.next.minutes} Min`, icon: ICONS.play, run: () => actions.startProgramSession() }
                : { title: "Training wählen", sub: "Übungen und Programme", icon: ICONS.next, run: () => actions.navigate("training") };
            const extras: Array<{ label: string; icon: string; run: () => void }> = [];
            if (restart) extras.push({ label: restart.label, icon: ICONS.restart, run: restart.run });
            if (running || (view && !view.finished)) extras.push({ label: "Anderes Training", icon: ICONS.next, run: () => actions.navigate("training") });
            return (
              <div className="nx-stack" style={{ height: 76 + extras.length * 50 }}>
                <button className="nx-start nx-stack-main" onClick={primary.run}>
                  <span className="nx-start-icon">
                    <Icon d={primary.icon} size={16} />
                  </span>
                  <span className="nx-stack-text">
                    <b>{primary.title}</b>
                    <small>{primary.sub}</small>
                  </span>
                </button>
                {extras
                  .map((x, i) => (
                    <button
                      key={x.label}
                      className="nx-stack-card"
                      style={{ top: 50 * (i + 1), zIndex: 5 - (i + 1), transform: `scale(${(1 - 0.045 * (i + 1)).toFixed(3)})` }}
                      onClick={x.run}
                    >
                      <span className="nx-stack-icon">
                        <Icon d={x.icon} size={15} />
                      </span>
                      {x.label}
                    </button>
                  ))}
              </div>
            );
          })()}
        </div>
      </section>

      {view && (
        <button className="nx-program-card" onClick={() => actions.navigate("program")}>
          <span className="nx-program-head">
            <b>Dein Programm: {view.name}</b>
            <span>{view.plan.weeks} Wochen</span>
          </span>
          <span className="nx-weeks" aria-hidden="true">
            {Array.from({ length: view.plan.weeks }, (_, i) => {
              const w = i + 1;
              const fill = w < view.week || view.finished ? 1 : w === view.week ? view.doneThisWeek / view.plan.weekdays.length : 0;
              return (
                <span key={w} className="nx-week">
                  <span style={{ width: `${Math.round(fill * 100)}%` }} />
                </span>
              );
            })}
          </span>
          <span className="nx-program-foot">
            {view.finished
              ? `Alle ${view.total} Einheiten geschafft`
              : `Diese Woche ${view.doneThisWeek} von ${view.plan.weekdays.length} Einheiten · insgesamt ${view.done}/${view.total}`}
          </span>
        </button>
      )}

      <nav className="nx-hub" aria-label="Hauptmenü">
        <HubTile icon={TILE_ICONS.training} title="Training" text="Übungen wählen – Kniebeugen zählt die Kamera" onClick={() => actions.navigate("training")} hot />
        <HubTile
          icon={TILE_ICONS.programs}
          title="Programme"
          text={view ? `${view.name} · ${view.finished ? "geschafft" : `Woche ${view.week}`}` : "Planen lassen oder selbst bauen"}
          onClick={() => actions.navigate("programs")}
        />
        <HubTile icon={TILE_ICONS.analysis} title="Körperanalyse" text="Haltung und Bewegung live (geschätzt)" onClick={() => actions.navigate("training")} />
        <HubTile
          icon={TILE_ICONS.progress}
          title="Fortschritt"
          text={history.length ? `${history.length} Trainings · ${totalReps} Wiederholungen` : "Noch keine Trainings"}
          onClick={() => actions.navigate("progress")}
        />
        <HubTile icon={TILE_ICONS.studio} title="Avatar & Raum" text={`${trainer.name} · ${roomName}`} onClick={() => actions.navigate("studio")} />
        <HubTile icon={TILE_ICONS.tv} title="Fernseher" text={tvStatus === "connected" ? "verbunden" : "Groß auf dem TV zeigen"} onClick={() => setTvOpen(true)} />
      </nav>

      <InstallCard />
      <TvVideoConsent />
      {!tvOpen && <TvLinkCard compact />}

      <p className="privacy">
        <span aria-hidden="true">🔒</span>
        <span>
          Kamerabild, Programm und Trainingsverlauf bleiben auf diesem Gerät – außer du koppelst einen Fernseher.
          Bewertungen sind Schätzungen aus dem Kamerabild – keine medizinische Beurteilung.
        </span>
      </p>

      {tvOpen && <TvDialog onClose={() => setTvOpen(false)} />}
    </MainLayout>
  );
}

function HubTile({ icon, title, text, onClick, hot = false }: { icon: string; title: string; text: string; onClick: () => void; hot?: boolean }) {
  return (
    <button className={`nx-tile${hot ? " hot" : ""}`} onClick={onClick}>
      <span className="nx-tile-icon">
        <Icon d={icon} size={24} />
      </span>
      <b>{title}</b>
      <span>{text}</span>
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
