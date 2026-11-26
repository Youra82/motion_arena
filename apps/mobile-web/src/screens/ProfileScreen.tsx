import { useEffect, useRef, useState } from "react";
import { MainLayout } from "../components/common";
import { VIEW_MODES, actions, useApp } from "../store";
import { VERSION_LABEL } from "../version";
import { TvLinkCard } from "../components/TvLink";

/** Profil & Einstellungen: alles bleibt auf dem Gerät. */
export function ProfileScreen() {
  const settings = useApp((s) => s.settings);
  const count = useApp((s) => s.history.length);
  const [confirm, setConfirm] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const historySaveFailed = useApp((s) => s.historySaveFailed);
  const settingsSaveFailed = useApp((s) => s.settingsSaveFailed);
  const dataRef = useRef<HTMLParagraphElement>(null);
  // Fokus folgt dem Dialog: beim Öffnen auf "Abbrechen", beim Schließen zurück auf "Verlauf löschen".
  const cancelRef = useRef<HTMLButtonElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    if (confirm) cancelRef.current?.focus();
    else if (wasOpen.current) (openRef.current?.disabled ? dataRef.current : openRef.current)?.focus(); // nach dem Löschen ist der Knopf deaktiviert
    wasOpen.current = confirm;
  }, [confirm]);

  return (
    <MainLayout className="profile">
      <h1 className="page-title">Profil</h1>

      <section className="card row-between">
        <div>
          <p className="eyebrow">Avatar &amp; Trainingsraum</p>
          <p className="muted small">15 Avatare und 20 Räume für die Ansichten ohne Kamerabild.</p>
        </div>
        <button className="btn" onClick={() => actions.navigate("studio")}>
          Auswählen
        </button>
      </section>

      <section className="card">
        <p className="eyebrow">Erkennungsmodell</p>
        <div className="segmented" role="group" aria-label="Modell">
          <button aria-pressed={settings.modelVariant === "lite"} onClick={() => actions.updateSettings({ modelVariant: "lite" })}>
            Schnell (lite)
          </button>
          <button aria-pressed={settings.modelVariant === "full"} onClick={() => actions.updateSettings({ modelVariant: "full" })}>
            Genauer (full)
          </button>
        </div>
      </section>

      <section className="card">
        <p className="eyebrow">Standard-Ziel</p>
        <div className="segmented" role="group" aria-label="Standard-Ziel">
          {[5, 10, 15, 20].map((t) => (
            <button key={t} aria-pressed={settings.defaultTarget === t} onClick={() => actions.updateSettings({ defaultTarget: t })}>
              {t}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <p className="eyebrow">Standard-Ansicht</p>
        <div className="chips" role="group" aria-label="Standard-Ansicht">
          {VIEW_MODES.map((m) => (
            <button key={m.id} aria-pressed={settings.defaultView === m.id} onClick={() => {
              actions.updateSettings({ defaultView: m.id });
              useApp.setState({ viewMode: m.id });
            }}>
              {m.label}
            </button>
          ))}
        </div>
      </section>

      <TvLinkCard />

      <section className="card">
        <p className="eyebrow">Daten</p>
        <p className="muted" ref={dataRef} tabIndex={-1} role="status">
          {count} {count === 1 ? "Training" : "Trainings"} auf diesem Gerät gespeichert (höchstens die letzten 1000). Der
          Verlauf wird nicht hochgeladen.
        </p>
        {historySaveFailed && (
          <p className="error-text" role="alert">
            Das letzte Training konnte nicht gespeichert werden (Speicher voll oder gesperrt) – es geht beim Schließen
            der App verloren.
          </p>
        )}
        {settingsSaveFailed && (
          <p className="error-text" role="alert">
            Einstellungen konnten nicht dauerhaft gespeichert werden – sie gelten nur bis zum Schließen der App.
          </p>
        )}
        {deleteFailed && (
          <p className="error-text" role="alert">
            Löschen hat nicht geklappt – der Browser verweigert den Zugriff auf den Speicher. Bitte erneut versuchen.
          </p>
        )}
        {!confirm ? (
          <button ref={openRef} className="btn btn-ghost" disabled={count === 0} onClick={() => setConfirm(true)}>
            Verlauf löschen
          </button>
        ) : (
          <div className="actions" role="group" aria-label="Löschen bestätigen">
            <button
              className="btn btn-danger"
              onClick={() => {
                setDeleteFailed(!actions.clearHistory());
                setConfirm(false);
              }}
            >
              Ja, Verlauf endgültig löschen
            </button>
            <button ref={cancelRef} className="btn btn-ghost" onClick={() => setConfirm(false)}>
              Abbrechen
            </button>
          </div>
        )}
      </section>

      <section className="card muted-card">
        <p className="eyebrow">Über</p>
        <p className="muted small">
          Motion Arena {VERSION_LABEL}. Kamerabilder werden auf diesem Gerät verarbeitet und nicht gespeichert. Nur wenn du
          einen Fernseher koppelst, gehen Live-Anzeige und Körperpunkte – und nur mit deiner Zustimmung auch das Bild – direkt an
          diesen Fernseher; für die Kopplung wird einmal der Vermittlungsdienst 0.peerjs.com kontaktiert. Bewertungen sind
          Schätzungen aus dem Kamerabild und keine medizinische Beurteilung.
        </p>
        <a className="small" href="https://github.com/Youra82/motion_arena" target="_blank" rel="noreferrer">
          Projekt auf GitHub
        </a>
      </section>
    </MainLayout>
  );
}
