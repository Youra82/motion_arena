# Codex-Auftrag 5 — Avatare & Räume (Block D) und Nachprüfung Runde 4

Kontext: Runde 4 (`docs/reviews/codex-review-4.md`) ist abgearbeitet; alle `-r4`-Tests sind grün. In
`tests/e2e/tv-r4.spec.ts` wurde nur die Hilfsfunktion `join` angepasst: Sie öffnet jetzt den Link aus dem QR-Code
(`data-pair-url`, enthält Code + Schlüssel), weil ein nackter Code seit H2 am Fernseher bestätigt werden muss.

## Neu bzw. geändert (nicht committet)

- **Block D – Avatare & Räume** (eigenständig, prozedural gezeichnet, keine fremden Assets):
  - `apps/mobile-web/src/render/rooms.ts` – 20 Räume (Definitionen, `paintRoom`, Cache `roomCanvas`, `drawRoom` mit
    dezenter Lichtreaktion), deterministischer Zufall je Raum.
  - `apps/mobile-web/src/render/avatars.ts` – 15 Avatare (Kleidung, Frisur, Statur), `drawAvatar` auf Landmarks
    (Tiefenreihenfolge, Seitenansicht mit Rumpfband, Kopf/Haare).
  - `render/draw.ts` – Raum als Hintergrund aller Ansichten ohne Kamerabild, Avatar-Ansicht, `roomLight`.
  - `screens/StudioScreen.tsx` – Auswahlseite (Kategorien, Karten, animierte Vorschau), Einstieg über Startseite und Profil.
  - `persist.ts` (`room`, `avatar` validiert), `store.ts` (`openLive(..., view)`), `engine/LiveEngine.ts`
    (Raum/Avatar; MediaPipe jetzt per dynamischem Import), TV: `tv/phone-link.ts`/`TvScreen.tsx` senden bzw. nutzen
    Raum/Avatar und Bewegungsspur.
- **Korrekturen Runde 4**: `tv/transport.ts` (eine bestätigte Sitzung, Schlüssel im QR-Code, Bestätigung am TV bei
  Code-Eingabe, Video nur vom aktiven Handy, geordnete Übertragung, lokale Adressierung), `tv/protocol.ts` (strenge
  Prüfung aller Nachrichten, Krypto-Code + Schlüssel), `tv/phone-link.ts` (Sitzungsnummer, Aufräumen von Anruf/Spuren/
  Timern, Widerruf bei Speicherfehler), `tv/tv-host.ts` (Sitzungsnummer, Code-Ablauf 10 min, Annehmen/Ablehnen,
  Pose-Reihenfolge), `TvScreen.tsx`/`TvLink.tsx` (Bestätigungsdialog, Ergebnis wie am Handy, Texte), `bodyload.ts`
  (Ausreißer auch für Haltung/Fenster, kollabierter Körper, Vorlage-Kniebeuge), `persist.ts`/`store.ts`/`ProfileScreen.tsx`
  (Aufbewahrung beim Laden, Speicherfehler sichtbar, Fokus).

## Aufgabe

1. Gegnerische Tests (nur **neue** Dateien, Namen mit `-r5`): `packages/*/test/codex/*-r5.test.ts`,
   `apps/mobile-web/src/**/*-r5.test.ts`, optional `tests/e2e/*-r5.spec.ts` (lokaler Kanal, kein echtes Netz).
   Schwerpunkte:
   - Avatare/Räume: degenerierte oder unvollständige Posen (fehlende Ohren/Zehen, Seitenansicht, NaN, Punkte außerhalb),
     Speicher/Rechenzeit (Cache-Größe, Pixeldichte, Größenwechsel, Thumbnails), Einstellungen (manipuliert, alt),
     Barrierefreiheit der Auswahlseite, reduzierte Bewegung, Avatar-Demo darf die Standard-Ansicht nicht ändern,
     TV zeigt denselben Raum/Avatar.
   - Nachprüfung Runde 4: Sitzungsbindung, Bestätigung, Rennen beim Auf-/Abbau, Protokollgrenzen, Aufräumen.
   Echte Fehler rot lassen und mit `// CODEX-BEFUND:` markieren; Ermessensfragen als `// FRAGE:`.
2. Code-Review: Fehler, Leistung pro Frame (Raum/Avatar), Speicher, Darstellung (Proportionen, Spiegelung,
   Seitenzuordnung), irreführende Aussagen (z. B. „3D“), Lizenz-/Markenfragen (eigenständige Gestaltung?).
3. Bericht: `docs/reviews/codex-review-5.md` (Deutsch), Befunde nach Schwere mit Datei:Zeile, Szenario, Vorschlag.

Ausführen: `pnpm test`, `pnpm typecheck` (Node unter `D:\tools\node`), `pnpm build && pnpm e2e` nur wenn nötig.
Keine bestehenden Dateien ändern, nichts committen, keine Pakete installieren. Nur in `D:\botprojekte\motion_arena`.
Temporäre Ausgaben bitte nach dem Lauf wieder entfernen.
