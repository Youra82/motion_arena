# Codex-Auftrag 6 — Übergabe: 3D-Gameplay „Arena“ wie im Konzeptbild

**Du übernimmst jetzt die Entwicklung (nicht nur Review).** Claude Code hat bis `ae27ac2` gebaut (v0.2, alles grün:
235 Vitest, 30 Playwright). Lies zuerst `README.md`, `docs/STATUS.md`, `docs/DESIGN_SYSTEM.md`, `docs/FEATURES.md`.

## Ziel (Wunsch des Nutzers)

Das Training soll **genauso aussehen wie das Gameplay-Konzeptbild** – nicht „billig“ wie die bisherige 2D-Avatar-Ansicht.
Konzeptbild beschrieben (Bild liegt nicht im Repo; ähnlich `docs/references/tv_kinetic_studio.png` und
`mobile_kinetic_studio.png`):

- Fotorealistischer Raum: helles Loft/Studio, große Fenster (Bergblick), spiegelnder dunkler Boden, warme Lichtleisten.
- **Links: der Spieler als Hologramm** – türkis leuchtende, halbtransparente Körperfigur mit leuchtenden Gelenkpunkten
  und 2–3 Nachbildern (Motion-Spur) hinter ihr; darunter ein **Präzisionsring am Boden** (perspektivische Ellipse,
  türkis/orange Segmente) mit „94 % PRÄZISION“.
- **Rechts: realistischer Trainer** (3D-Mensch in Sportkleidung), der dieselbe Kniebeuge vormacht.
- **HUD:** oben links Übungskarte („Kniebeugen · Ganzkörper“ mit Icon); links Panel mit großem Ring-Zähler
  „18 / 20 Wiederholungen“, darunter Punkte (★) und geschätzte kcal (🔥, als „geschätzt“ kennzeichnen);
  oben rechts Zeit „12:46 / 22:00“ mit Fortschrittsbalken; rechts Haltungs-Checks mit grünen Häkchen
  („Rücken gerade“, „Knie stabil“, „Tiefe gut“ – aus den vorhandenen Bewertungsteilen ableiten); unten breites Banner
  „✓ Sehr gut! | Saubere Bewegung. Noch 2 Wiederholungen.“; dezentes Logo „Motion Arena · Kinetic Studio“ im Raum.
- **Keinen Puls (bpm) anzeigen** – die Kamera misst ihn nicht; nichts erfinden.

## Entscheidungen des Nutzers (verbindlich)

1. **Assets nur CC0** (Repo ist öffentlich). Bereits heruntergeladen nach `assets-src/cc0/`:
   - `man-base-character-rigged.glb` (Grab3d, CC0, realistischer Mann 1,80 m, T-Shirt/Shorts, Rig mit Walk/Run,
     **keine** Kniebeuge → Kniebeuge prozedural über Knochenrotationen erzeugen), Lizenz `LICENSE-grab3d.txt`.
   - `photo_studio_loft_hall_2k.hdr`, `lebombo_2k.hdr` (Poly Haven, CC0) als Raum-Panoramen.
   Weitere CC0-Quellen nur, wenn ohne Netz verfügbar oder vom Nutzer nachgeliefert. Lizenzen in `docs/ASSETS.md` belegen.
2. **Zuerst nur der Training-Bildschirm** (2–3 Räume, ein Trainer). Übrige Räume/Avatare später.

## Technische Leitplanken

- three.js (neue Abhängigkeit ok – falls ohne Netz nicht installierbar: im Bericht melden, nicht umgehen).
  Szene **lazy laden** (wie MediaPipe/TvScreen), Hauptbündel < 500 kB. Assets komprimieren (GLB: Draco/Meshopt oder
  Light-Variante ~4 MB; HDR → 1k/2k, ggf. KTX2/JPG-Equirect), in `apps/mobile-web/public/` ablegen; Service Worker
  precacht alles in `public/` – Größe im Blick behalten (Precache ggf. auf Kern begrenzen, 3D on demand cachen).
- Neue Ansicht **„Arena“** als Standard-Ansicht fürs Training (`view-modes.ts`, `persist.ts`-Validierung), die
  übrigen 10 Ansichten bleiben. Raum als `GroundedSkybox`/Env-Map, spiegelnder Boden, ACES-Tonemapping.
- **Hologramm-Spieler:** Kamera-Modus = vorhandene Personenmaske (`engine/landmarker.ts` → `renderMask`) türkis
  eingefärbt + Fresnel/Scanline-Look + Gelenkpunkte aus Landmarks + Nachbilder; Demo-Modus = 3D-Modell mit
  Hologramm-Material, Pose aus `packages/pose-engine/src/synth.ts` (Kniewinkel → Knochen).
- **Trainer:** dasselbe GLB, Kniebeuge synchron zum Tempo, Sportkleidung per Material/Farbe (Kinetic-Studio-Farben).
- HUD als React/CSS über dem 3D-Canvas, Daten aus `components/hud-view.ts` (TV nutzt dasselbe – TV muss weiter
  funktionieren; ohne Bildfreigabe zeigt der TV die Arena aus Körperpunkten).
- Datenschutz unverändert: keine neuen externen Verbindungen (CSP in `vite.config.ts`), Assets selbst ausliefern.
- „Bewegung reduzieren“ beachten; Leistung: Pixelbudget/DPR begrenzen, Schatten sparsam, fps im HUD prüfen.
- Kleinigkeit: In `screens/LiveScreen.tsx:171` steht noch hart „ (Platzhalter)“ am Avatar-Knopf – entfernen.

## Qualität

- Tests ergänzen (Vitest für Logik: Haltungs-Checks, kcal-Schätzung, Ansichts-Validierung; Playwright: Arena lädt,
  Demo zählt, keine Konsolenfehler, Screenshot `docs/screenshots/45-arena.png` per `tests/screenshots/`).
- Alle bestehenden Tests müssen grün bleiben: `pnpm test`, `pnpm typecheck`, `pnpm build && pnpm e2e`
  (Node unter `D:\tools\node`; Playwright nutzt installiertes Chrome).
- Screenshot mit dem Konzeptbild vergleichen und nachbessern, bis es sehr nah dran ist.
- **Nicht committen/pushen** – der Nutzer gibt den Push frei. Am Ende Bericht `docs/reviews/codex-arena-bericht.md`
  (Deutsch): was gebaut, was getestet, Bundle-/Asset-Größen, offene Punkte, Screenshots.
- Keine persönlichen Daten/echten IPs ins Repo (öffentlich).
