import { useEffect, useRef, useState } from "react";
import { installKind, promptInstall, usePwa } from "../pwa";

function ShareIcon() {
  // Teilen-Symbol wie in Safari (Kasten mit Pfeil nach oben)
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Teilen-Symbol" style={{ verticalAlign: "-3px" }}>
      <path d="M12 3v12M7 8l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" strokeLinecap="round" />
    </svg>
  );
}

/** Karte „App installieren“ – passend zu Browser und Gerät, verschwindet nach der Installation. */
export function InstallCard() {
  const state = usePwa();
  const kind = installKind(state);
  const [open, setOpen] = useState(state.fromQr);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (state.fromQr) ref.current?.scrollIntoView({ block: "start" });
  }, [state.fromQr]);

  if (kind === "none") return null;
  if (kind === "installed") {
    return state.fromQr ? (
      <section className="card install-card done" ref={ref}>
        <p className="eyebrow">Installiert</p>
        <p style={{ margin: 0 }}>Motion Arena ist als App installiert und läuft auch ohne Internet.</p>
      </section>
    ) : null;
  }

  return (
    <section className={`card install-card${state.fromQr ? " highlight" : ""}`} ref={ref} aria-label="App installieren">
      <p className="eyebrow">Als App installieren</p>
      <p className="install-text">
        Startet wie eine normale App vom Startbildschirm, ohne Browserleiste – und funktioniert danach auch ohne Internet.
      </p>

      {kind === "prompt" && (
        <button className="btn btn-primary" onClick={() => void promptInstall()}>
          📲 Jetzt installieren
        </button>
      )}

      {kind === "ios" && (
        <>
          {!open && (
            <button className="btn btn-primary" onClick={() => setOpen(true)}>
              📲 So installierst du die App
            </button>
          )}
          {open && (
            <ol className="install-steps">
              <li>
                In Safari unten auf <b>Teilen</b> <ShareIcon /> tippen.
              </li>
              <li>
                Nach unten scrollen und <b>„Zum Home-Bildschirm“</b> wählen.
              </li>
              <li>
                Oben rechts auf <b>„Hinzufügen“</b> tippen – fertig.
              </li>
            </ol>
          )}
        </>
      )}

      {kind === "manual" && (
        <ol className="install-steps">
          <li>
            Im Browser das <b>Menü</b> öffnen (meist <b>⋮</b> oben rechts).
          </li>
          <li>
            <b>„App installieren“</b> oder <b>„Zum Startbildschirm hinzufügen“</b> wählen.
          </li>
        </ol>
      )}
    </section>
  );
}
