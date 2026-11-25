import { useState } from "react";
import { actions, useApp } from "../store";
import { InstallCard } from "./InstallCard";

export function BrandMark() {
  // Eigene Wort-/Bildmarke: zwei versetzte Bewegungsbalken (keine Fremdmarke).
  return (
    <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
      <rect x="4" y="10" width="9" height="24" rx="4.5" fill="#FF704B" transform="skewX(-14)" />
      <rect x="17" y="6" width="9" height="28" rx="4.5" fill="#FF704B" opacity="0.75" transform="skewX(-14)" />
      <rect x="30" y="14" width="9" height="20" rx="4.5" fill="#47D4D0" transform="skewX(-14)" />
    </svg>
  );
}

const TARGETS = [5, 10, 15];

export function StartScreen() {
  const [target, setTarget] = useState(10);
  const modelVariant = useApp((s) => s.modelVariant);

  return (
    <main className="start">
      <header className="brand">
        <BrandMark />
        <div>
          <div className="brand-name">Motion Arena</div>
          <div className="brand-sub">Kinetic Studio</div>
        </div>
      </header>

      <InstallCard />

      <section className="hero">
        <p className="eyebrow">Core Studio · Kraft &amp; Stabilität</p>
        <h1>Kniebeugen</h1>
        <div className="hero-meta">
          <span>{target} Wiederholungen</span>
          <span>Kamera-Tracking</span>
        </div>
        <div className="actions">
          <button className="btn btn-primary" onClick={() => actions.openLive("camera", target)}>
            ▶ Training starten
          </button>
          <button className="btn btn-ghost" onClick={() => actions.openLive("demo", target)}>
            Demo ohne Kamera ansehen
          </button>
        </div>
      </section>

      <section className="card">
        <p className="eyebrow">Ziel</p>
        <div className="segmented" role="group" aria-label="Anzahl Wiederholungen">
          {TARGETS.map((t) => (
            <button key={t} aria-pressed={t === target} onClick={() => setTarget(t)}>
              {t}
            </button>
          ))}
        </div>
      </section>

      <section className="card">
        <p className="eyebrow">So klappt die Erkennung</p>
        <ul className="tips">
          <li>Handy etwa auf Hüfthöhe aufstellen, 2–3 m Abstand.</li>
          <li>Ganzer Körper im Bild – Kopf bis Füße.</li>
          <li>Gutes Licht von vorne, ruhiger Hintergrund hilft.</li>
          <li>Leicht schräg oder seitlich zur Kamera ist am genauesten.</li>
        </ul>
      </section>

      <section className="card">
        <p className="eyebrow">Erkennungsmodell</p>
        <div className="segmented" role="group" aria-label="Modell">
          <button aria-pressed={modelVariant === "lite"} onClick={() => useApp.setState({ modelVariant: "lite" })}>
            Schnell (lite)
          </button>
          <button aria-pressed={modelVariant === "full"} onClick={() => useApp.setState({ modelVariant: "full" })}>
            Genauer (full)
          </button>
        </div>
      </section>

      <p className="privacy">
        <span aria-hidden="true">🔒</span>
        <span>
          Das Kamerabild wird nur auf diesem Gerät verarbeitet und nicht gespeichert oder übertragen. Bewertungen sind
          Schätzungen aus dem Kamerabild – keine medizinische Beurteilung.
        </span>
      </p>
    </main>
  );
}
