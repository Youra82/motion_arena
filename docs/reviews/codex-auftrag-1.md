# Codex-Auftrag 1 — Gegnerische Tests + Prüfung der Kernlogik

Projekt: Motion Arena (Fitness-Bewegungsspiel, Smartphone-Kamera + MediaPipe Pose). Kontext: `docs/*.md`.
Claude Code hat Phase-1-Kernlogik gebaut:

- `packages/pose-engine/src/` — Geometrie, Erkennungsqualität (`assessSquatQuality`), One-Euro-Glättung,
  Merkmale (`extractSquatFeatures`, `squatDepth`), Kalibrierung (`Calibrator`), synthetischer Posen-Generator (`synth.ts`).
- `packages/motion-scoring/src/` — Kniebeugen-Zustandsmaschine (`SquatCounter`), Bewertung (`scoreRep`), Session-Reducer (`session.ts`).
- Bestehende Tests: `packages/*/test/*.test.ts` (alle grün).

## Deine Aufgabe

1. Lies `docs/IMPLEMENTATION_PLAN.md`, `docs/TECHNICAL_ARCHITECTURE.md` und den Code oben.
2. Schreibe **unabhängige, gegnerische** Vitest-Tests, die versuchen, den Zähler/die Kalibrierung/die Qualitätsprüfung zu brechen.
   Denk an echte Kamera-Bedingungen: Rauschen, Zittern genau an den Schwellen (Hysterese), einzelne Ausreißer-Frames,
   schwankende Framerate/Zeitstempel-Lücken, gleiche/rückwärts laufende Zeitstempel, Person läuft während der Übung zur
   Kamera oder weg (Skalierung), seitliches Wandern, Ansicht dreht sich, eine Seite verdeckt, Person beginnt in der Hocke,
   Pause/Resume mitten in einer Wiederholung, sehr tiefe Kniebeuge, NaN/Infinity in Landmarks, weniger als 33 Punkte.
   - Nutze den synthetischen Generator aus `@motion-arena/pose-engine` (`synthFrame`, `synthSequence`, `seededRng`).
   - Lege **nur neue Dateien** an unter `packages/motion-scoring/test/codex/` und `packages/pose-engine/test/codex/`.
   - **Ändere keine Dateien unter `src/`** und keine bestehenden Tests. Wenn ein Test einen echten Fehler zeigt,
     lass ihn rot stehen und markiere ihn mit `// CODEX-BEFUND:` + kurzer Begründung.
   - Tests, deren Erwartung eine Ermessensfrage ist (Produktentscheidung), als `it.todo` oder mit Kommentar `// FRAGE:` kennzeichnen.
3. Prüfe die Logik inhaltlich (Code-Review): Fehler, falsche Annahmen über MediaPipe (Koordinatensysteme, Spiegelung,
   Weltkoordinaten, Sichtbarkeit), Grenzfälle, die die Definition of Done verletzen (3 saubere Kniebeugen = 3 Wiederholungen;
   Teilkörper/unsichere Posen → Warnung statt Fehlbewertung; keine Strafpunkte bei Erkennungsfehlern).
4. Schreibe deinen Bericht nach `docs/reviews/codex-review-1.md` (Deutsch): Befunde nach Schwere sortiert
   (kritisch / wichtig / klein), je Befund Datei:Zeile, konkretes Fehlerszenario, Vorschlag. Dazu Liste deiner Tests
   und welche rot sind.

Tests ausführen: `pnpm test` im Projektordner (Node liegt unter `D:\tools\node`). Keine Netzwerkinstallation neuer Pakete nötig.
Arbeite nur in `D:\botprojekte\motion_arena`. Keine anderen Projekte anfassen. Nichts committen.
