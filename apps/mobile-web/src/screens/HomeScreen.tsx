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

const TARGETS = [5, 10, 15, 20];
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

/**
 * Hauptmenü „Heute“: großes Bühnenbild mit dem gewählten Trainer, darauf das heutige Training und ein Startknopf.
 * Mit Programm zeigt es die nächste Einheit samt Wochenfortschritt, ohne Programm den Schnellstart Kniebeugen und
 * den Weg zum eigenen Programm. Alle Zahlen stammen aus Programm und Verlauf – nichts ist erfunden.
 */
export function HomeScreen() {
  const target = useApp((s) => s.targetReps);
  const program = useApp((s) => s.program);
  const workout = useApp((s) => s.workout);
  const tvStatus = usePhoneLink((s) => s.status);
  const [tvOpen, setTvOpen] = useState(false);
  const { trainer, backdrop, roomName } = useStage();
  const view = program ? programView(program) : null;
  const minutes = Math.max(1, Math.round((target * 3.2 + 15) / 60));
  const running = workout && workout.index < workout.steps.length ? workout : null;
  useEffect(() => {
    if (tvStatus === "connected") setTvOpen(false);
  }, [tvStatus]);

  const coach = view
    ? view.finished
      ? "Du hast das ganze Programm geschafft – Zeit für das nächste Ziel!"
      : view.doneThisWeek > 0
        ? `Schon ${view.doneThisWeek} von ${view.plan.weekdays.length} Einheiten diese Woche – weiter so!`
        : `Heute ${view.next.title} – ich zeige dir jede Übung.`
    : "Ich mache jede Wiederholung vor – die Kamera zählt mit.";

  return (
    <MainLayout className="nx-home">
      <section className="nx-stage" aria-label="Dein Training heute">
        <img className="nx-stage-bg" src={backdrop} alt="" />
        <img className="nx-stage-trainer" src={trainerPhoto(trainer.id)} alt={`Trainer ${trainer.name}`} />
        <header className="nx-top">
          <div>
            <div className="nx-hello">{greeting(new Date().getHours())}</div>
            <div className="nx-brand">
              MOTION <span>ARENA</span>
            </div>
          </div>
          <span className="app-version" title="Installierte Version">
            {VERSION_LABEL}
          </span>
          <div className="nx-top-actions">
            <button className="nx-round" aria-label={tvStatus === "connected" ? "Fernseher verbunden" : "Auf dem Fernseher zeigen"} onClick={() => setTvOpen(true)}>
              <Icon d={ICONS.tv} size={20} />
            </button>
            <button className="nx-round" aria-label="Trainer und Arena wählen" onClick={() => actions.navigate("studio")}>
              <Icon d={ICONS.studio} size={20} />
            </button>
          </div>
        </header>
        <p className="nx-coach">{coach}</p>

        <div className="nx-today">
          {view && !view.finished ? (
            <>
              <span className="nx-chip">
                {view.name} · Woche {view.week} · Tag {view.dayInWeek}
              </span>
              <h1>{view.next.title}</h1>
              <p className="nx-meta">
                {view.next.minutes} Min · {view.next.steps.length} Übungen · mit {trainer.name}
              </p>
              <button className="nx-start" onClick={() => actions.startProgramSession()}>
                <span className="nx-start-icon">
                  <Icon d={ICONS.play} size={16} />
                </span>
                Training starten
              </button>
            </>
          ) : view && view.finished ? (
            <>
              <span className="nx-chip">{view.name} · abgeschlossen</span>
              <h1>Programm geschafft!</h1>
              <p className="nx-meta">{view.total} Einheiten erledigt</p>
              <button className="nx-start" onClick={() => actions.navigate("programs")}>
                <span className="nx-start-icon">
                  <Icon d={ICONS.next} size={16} />
                </span>
                Zu den Programmen
              </button>
            </>
          ) : (
            <>
              <span className="nx-chip">Schnellstart · {roomName}</span>
              <h1>Kniebeugen</h1>
              <p className="nx-meta">
                ca. {minutes} Min · Kamera zählt mit · mit {trainer.name}
              </p>
              <div className="segmented compact" role="group" aria-label="Anzahl Wiederholungen">
                {TARGETS.map((t) => (
                  <button key={t} aria-pressed={t === target} onClick={() => actions.setTarget(t)}>
                    {t}
                  </button>
                ))}
              </div>
              <button className="nx-start" onClick={() => actions.openLive("camera", target)}>
                <span className="nx-start-icon">
                  <Icon d={ICONS.play} size={16} />
                </span>
                <span className="sr-only">▶ </span>Training starten
              </button>
            </>
          )}
          <button className="link-btn nx-demo" onClick={() => actions.openLive("demo", target)}>
            Demo ohne Kamera ansehen
          </button>
        </div>
      </section>

      {running && (
        <button className="nx-resume" onClick={() => actions.openWorkout()}>
          <Icon d={ICONS.play} />
          <span>
            <small>Training läuft</small>
            <b>
              {running.title} · Übung {running.index + 1} von {running.steps.length}
            </b>
          </span>
          <span className="nx-resume-go">Fortsetzen</span>
        </button>
      )}

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

      <nav className="nx-more" aria-label="Hauptmenü">
        <button onClick={() => actions.navigate("training")}>
          <Icon d={ICONS.analysis} />
          Körperanalyse
        </button>
        <button onClick={() => actions.navigate("studio")}>
          <Icon d={ICONS.studio} />
          Avatar & Raum
        </button>
        <button onClick={() => setTvOpen(true)}>
          <Icon d={ICONS.tv} />
          {tvStatus === "connected" ? "Fernseher verbunden" : "Fernseher"}
        </button>
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
