# Codex-Auftrag 2 — Fixes prüfen + App-Integration

Kontext: Deine Runde 1 (`docs/reviews/codex-review-1.md`) fand 18 Befunde. Claude Code hat sie behoben; alle deine
Tests in `packages/*/test/codex/` sind jetzt grün, ohne dass sie verändert wurden. Gesamt: 78 grün, 1 todo.

Wichtigste Änderungen:
- `packages/pose-engine/src/features.ts`: abstandsunabhängige Beinhöhen-Verhältnisse (`extent3d`, `extentSeg2d`,
  `extentShoulder2d`) statt absoluter Hüfthöhe; 3D nur wenn alle zuverlässigen Seiten gültige Weltketten haben;
  `squatDepthDetailed` meldet „Blickwinkel geändert“ bei reinem 2D nach Ansichtswechsel.
- `packages/pose-engine/src/calibration.ts`: Zeitstempel/Lücken, frontale 2D-Plausibilität, seitliches Wandern.
- `packages/motion-scoring/src/squat.ts`: Zeitstempelprüfung, lange Lücken, Geschwindigkeits-Plausibilität gegen
  Einzelausreißer (zwei konsistente Frames gelten), Grund für Ausfall.
- `scoring.ts`/`session.ts`: nicht endliche Werte abgefangen.
- Neu: `apps/mobile-web` (React/Vite, `src/engine/LiveEngine.ts`, `landmarker.ts`, `render/draw.ts`, `store.ts`,
  Screens) und Playwright-Tests `tests/e2e/*.spec.ts` (Demo-Ablauf, Chrome-Testkamera, verweigerte Kamera; alle grün).

## Deine Aufgabe

1. Prüfe, ob die Fixes die Befunde **wirklich** beheben oder nur deine konkreten Testfälle treffen. Suche gezielt nach
   neuen Fehlern, die durch die Fixes entstanden sind (z. B. Ausreißerfilter verschluckt echte schnelle Bewegungen;
   Verhältnis-Signale bei realen MediaPipe-Weltkoordinaten – deren y-Achse ist kameraausgerichtet, nicht schwerkraft-
   ausgerichtet –, gekippte Handykamera, Person sehr nah/teilweise; Pause → resetMotion → Lücke).
2. Prüfe die App-Integration: Lebenszyklus (React StrictMode, Kamera-Stream-Freigabe, Abbruch während Laden, erneuter
   Start), MediaPipe-Nutzung (Zeitstempel, Callback-Masken, GPU→CPU-Fallback, `setOptions` während laufender Erkennung),
   Spiegelung Video/Overlay, Zustände aus `docs/DESIGN_SYSTEM.md` (Initial, Laden, Kamerazugriff verweigert, keine Person,
   Teilkörper, kalibriert, bereit, läuft, pausiert, abgeschlossen, Fehler), Ansichtswechsel ohne Sessionverlust,
   Datenschutz (nichts verlässt das Gerät), Speicher-/CPU-Last pro Frame (Silhouette-Maske).
3. Neue gegnerische Tests wieder **nur** als neue Dateien unter `packages/*/test/codex/` (Dateiname mit `-r2`).
   Für App-Logik, die sich ohne Browser testen lässt, darfst du `apps/mobile-web/src/**/*.test.ts` anlegen
   (Vitest, Node-Umgebung). Keine Änderungen an bestehenden Dateien; echte Fehler rot lassen + `// CODEX-BEFUND:`.
4. Bericht: `docs/reviews/codex-review-2.md` (Deutsch), Befunde nach Schwere, Datei:Zeile, Szenario, Vorschlag.
   Zusätzlich ein kurzer Abschnitt „Was vor dem ersten echten Handytest noch fehlt“.

Ausführen: `pnpm test`, `pnpm typecheck` (Node unter `D:\tools\node`). `pnpm e2e` nur wenn nötig (startet Chrome headless).
Nur in `D:\botprojekte\motion_arena` arbeiten. Nichts committen, keine Pakete installieren.
