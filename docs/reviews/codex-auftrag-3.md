# Codex-Auftrag 3 — Startseite/Fortschritt, neue Spiegelungen, Live Body Load

Kontext: Runden 1–2 (`docs/reviews/codex-review-1.md`, `-2.md`) sind abgearbeitet. Seitdem neu (noch nicht committet):

- **Fortschritt**: `packages/motion-scoring/src/progress.ts` (Einträge, Statistik, Wochenplan, 30-Tage-Challenge,
  Bewegungsbeschreibung), App-Speicher `apps/mobile-web/src/persist.ts` (localStorage), Store-Erweiterung
  `apps/mobile-web/src/store.ts` (Navigation, Einstellungen, Verlauf; nur Kamera-Trainings werden gespeichert).
- **Oberfläche**: `screens/HomeScreen.tsx`, `TrainingScreen.tsx`, `ProgressScreen.tsx`, `ProfileScreen.tsx`,
  `components/common.tsx`, `components/BodyDiagram.tsx`, Versionsanzeige (`version.ts`, `vite.config.ts` define).
- **Spiegelungen**: Gittermodell/Hologramm (`render/body-shapes.ts`, `render/draw.ts`), Muskelansicht und
  Bewegungszonen (`render/draw.ts`).
- **Live Body Load**: `packages/motion-scoring/src/bodyload.ts` (Merkmale aus Weltkoordinaten, Bewegungserkennung,
  Zonen-Heuristik, Glättung/Hysterese), Analysemodus in `engine/LiveEngine.ts`, `engine/demo.ts`, `screens/LiveScreen.tsx`.
  Anforderungen: `docs/LIVE_BODY_LOAD.md` (Intensität vs. vermutete Beanspruchung trennen, keine Prozentwerte, unsicher
  statt Raten, keine Medizin).
- Synthetischer Generator erweitert (`packages/pose-engine/src/synth.ts`: arms, legSpreadDeg, liftLeftKneeDeg, lunge, pitchDeg).

## Aufgabe

1. Gegnerische Tests (nur **neue** Dateien, Namen mit `-r3`): `packages/*/test/codex/*-r3.test.ts`,
   `apps/mobile-web/src/**/*-r3.test.ts`. Schwerpunkte:
   - Fortschritt: Zeitzonen/Sommerzeit, Mitternacht, Wochenbeginn Montag, Challenge-Abschnitte, defekte/manipulierte
     localStorage-Daten, sehr viele Einträge, doppeltes Speichern, Demo darf nie zählen.
   - Body Load: Fehlklassifikation (z. B. Kniebeuge seitlich, gekippte Kamera, Person läuft, Hinsetzen, Bücken,
     schnelles Wackeln, einzelne Ausreißer, NaN), Seitenverwechslung links/rechts (Spiegelung!), Zonen bei teilweiser
     Verdeckung, Übergänge zwischen Bewegungen, zeitliche Stabilität, Verhalten ohne Weltkoordinaten.
   - Renderer-Geometrie (`body-shapes.ts`): degenerierte Posen, kollineare Punkte, Seitenansicht.
   Echte Fehler rot lassen und mit `// CODEX-BEFUND:` markieren; Ermessensfragen als `// FRAGE:`.
2. Code-Review dieser Teile: Fehler, irreführende Aussagen in der UI (Medizin/Messung), Datenschutz (localStorage,
   keine Übertragung), Barrierefreiheit der neuen Bildschirme, Leistung pro Frame (Hologramm/Gitter/Analyse).
3. Bericht: `docs/reviews/codex-review-3.md` (Deutsch), Befunde nach Schwere mit Datei:Zeile, Szenario, Vorschlag.

Ausführen: `pnpm test`, `pnpm typecheck` (Node unter `D:\tools\node`), `pnpm build && pnpm e2e` nur wenn nötig.
Keine bestehenden Dateien ändern, nichts committen, keine Pakete installieren. Nur in `D:\botprojekte\motion_arena`.
