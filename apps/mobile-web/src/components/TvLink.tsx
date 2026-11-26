import { useEffect, useRef, useState } from "react";
import { actions, useApp } from "../store";
import { connectToTv, disconnectTv, setTvVideo, usePhoneLink } from "../tv/phone-link";

const STATUS_TEXT: Record<string, string> = {
  connecting: "Verbinde mit dem Fernseher …",
  connected: "Mit dem Fernseher verbunden",
  waiting: "Warte auf den Fernseher …",
  approval: "Bitte am Fernseher auf „Annehmen“ drücken …",
  disconnected: "Verbindung getrennt – versuche erneut …",
  rejected: "Kopplung nicht möglich",
  error: "Verbindung nicht möglich",
};

/** Zustimmung zum Mitsenden des Live-Bildes – einmal fragen, dann in den Einstellungen gemerkt. */
export function TvVideoConsent() {
  const status = usePhoneLink((s) => s.status);
  const choice = useApp((s) => s.settings.tvVideo);
  const yesRef = useRef<HTMLButtonElement>(null);
  const open = status === "connected" && choice === "ask";
  useEffect(() => {
    if (open) yesRef.current?.focus();
  }, [open]);
  if (!open) return null;
  return (
    <section className="card tv-consent" role="alertdialog" aria-labelledby="tv-consent-title" aria-describedby="tv-consent-text">
      <p className="eyebrow" id="tv-consent-title">
        Auf dem Fernseher dasselbe Bild zeigen?
      </p>
      <p className="small" id="tv-consent-text">
        Dafür sendet das Handy sein Live-Bild – je nach Ansicht mit deinem Kamerabild – an den Fernseher: verschlüsselt und
        direkt zwischen den beiden Geräten, ohne Umweg über einen Server, nichts wird gespeichert. Ohne Zustimmung gehen nur
        Körperpunkte und Anzeige (Wiederholungen, Punkte, Hinweise) an den Fernseher; Kamera-Ansichten (Echtbild,
        Hybrid, Silhouette) erscheinen dort dann als Skelett.
      </p>
      <div className="actions">
        <button ref={yesRef} className="btn btn-primary" onClick={() => setTvVideo("on")}>
          Ja, Bild 1:1 spiegeln
        </button>
        <button className="btn btn-ghost" onClick={() => setTvVideo("off")}>
          Nein, nur Figur ohne Kamerabild
        </button>
      </div>
    </section>
  );
}

/** Kopplung mit einem Fernseher: Code eingeben oder QR-Code am TV scannen. */
export function TvLinkCard({ compact = false }: { compact?: boolean }) {
  const link = usePhoneLink();
  const video = useApp((s) => s.settings.tvVideo);
  const saveFailed = useApp((s) => s.settingsSaveFailed);
  const [code, setCode] = useState("");
  const active = link.status !== "off";

  if (compact && !active) return null;

  return (
    <section className={`card tv-link${link.status === "connected" ? " connected" : ""}`} aria-label="Fernseher">
      <div className="row-between">
        <p className="eyebrow">📺 Auf dem Fernseher anzeigen</p>
        {active && (
          <button className="link-btn small" onClick={() => disconnectTv()}>
            Trennen
          </button>
        )}
      </div>
      {active ? (
        <>
          <p className="tv-link-status" role="status">
            <span className="dot" style={{ background: link.status === "connected" ? "var(--success)" : "var(--warning)" }} />
            {STATUS_TEXT[link.status] ?? link.status}
            {link.code ? ` (Code ${link.code.slice(0, 3)} ${link.code.slice(3)})` : ""}
          </p>
          {(link.status === "error" || link.status === "rejected") && link.detail && (
            <p className="small error-text">{link.detail}</p>
          )}
          {link.status === "connected" && saveFailed && (
            <p className="small error-text" role="alert">
              Deine Wahl konnte nicht gespeichert werden – sie gilt nur bis zum Schließen der App; danach wird wieder
              gefragt.
            </p>
          )}
          {link.status === "connected" && video !== "ask" && (
            <div className="row-between small">
              <span className="muted">
                {video === "off"
                  ? "Nur Figur, ohne Kamerabild"
                  : link.streaming
                    ? "Bild wird 1:1 gespiegelt"
                    : "Bild freigegeben – wird gesendet, sobald ein Training läuft"}
              </span>
              <button className="link-btn small" onClick={() => setTvVideo(video === "on" ? "off" : "on")}>
                {video === "on" ? "Kamerabild nicht senden" : "Bild 1:1 spiegeln"}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="muted small">
            Am Fernseher <b>youra82.github.io/motion_arena/?tv</b> öffnen und den QR-Code scannen – oder den angezeigten
            Code hier eingeben (dann am Fernseher bestätigen). Der Fernseher zeigt dasselbe wie die App.
          </p>
          <p className="muted small">
            Gesendet werden Körperpunkte und Live-Werte; das Kamerabild nur nach deiner ausdrücklichen Zustimmung – jeweils
            verschlüsselt direkt an den Fernseher. Zum Finden der Geräte werden der Vermittlungsdienst 0.peerjs.com und
            ein STUN-Server von Google kontaktiert. Dein gespeicherter Trainingsverlauf wird nie gesendet.
          </p>
          <form
            className="tv-code-form"
            onSubmit={(e) => {
              e.preventDefault();
              void connectToTv(code);
            }}
          >
            <input
              aria-label="Code vom Fernseher"
              placeholder="Code, z. B. K7Q 4MZ"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={9}
              autoCapitalize="characters"
              autoComplete="off"
            />
            <button className="btn" type="submit">
              Verbinden
            </button>
          </form>
          {link.detail && <p className="small error-text">{link.detail}</p>}
          <button className="link-btn small" onClick={() => actions.openTv()}>
            Dieses Gerät ist der Fernseher
          </button>
        </>
      )}
    </section>
  );
}
