# Codex-Auftrag 4 — TV-Spiegelung (Block C) und Nachprüfung Runde 3

Kontext: Runde 3 (`docs/reviews/codex-review-3.md`) ist abgearbeitet; alle `-r3`-Tests sind grün. Bitte prüfen, ob die
Korrekturen die Befunde wirklich beheben (nicht nur die Tests erfüllen), und den TV-Modus gegnerisch testen.

## Was neu bzw. geändert ist (nicht committet)

- **TV-Modus** (Fernseher zeigt 1:1 dasselbe wie das Handy):
  - `apps/mobile-web/src/tv/protocol.ts` – Nachrichten Handy→TV (hello, pose, state, bye), Pose-Kodierung, Kopplungscode.
  - `apps/mobile-web/src/tv/transport.ts` – PeerJS (WebRTC, Vermittlung über 0.peerjs.com, nur STUN, kein TURN) und
    lokaler Kanal (BroadcastChannel, `?transport=local`) für Tests; Videoanruf mit Encoder-Einstellungen.
  - `apps/mobile-web/src/tv/phone-link.ts` – Handy-Seite: koppeln, Zustand senden (gedrosselt), Pose senden, Live-Canvas
    als Video (nur nach Zustimmung `settings.tvVideo === "on"`), Wiederverbinden.
  - `apps/mobile-web/src/tv/tv-host.ts`, `screens/TvScreen.tsx` – TV-Seite: QR/Code, Bühne im Seitenverhältnis des Handys,
    Video oder aus Körperpunkten gezeichnete Figur, gemeinsames HUD (`components/LiveHud.tsx`, `components/hud-view.ts`).
  - `components/TvLink.tsx` – Zustimmung zum Kamerabild, Kopplungskarte. `main.tsx`: `?tv`, `?pair=CODE`.
  - `vite.config.ts` – CSP `connect-src 'self' https://0.peerjs.com wss://0.peerjs.com`.
- **Korrekturen aus Runde 3**: `persist.ts` (Schema-Prüfung, Dedupe, Erfolgsrückgaben), `view-modes.ts`, `store.ts`
  (gekappter Verlauf, Standard-Ansicht, Löschen mit Rückmeldung), `progress.ts` (Zukunft/Sortierung),
  `bodyload.ts` (Körperachse statt Bildsenkrechte, Schwerpunkt über Füßen, Beinneigung, Beinbeleg für Hampelmann,
  Standbeinwechsel, Ausreißer/Lücken, NEEDS je Zone inkl. Weltkoordinaten, „Körper nicht auswertbar“),
  `body-shapes.ts` (Rumpfband, Dedupe, Flächengrenze), `BodyDiagram.tsx`, `common.tsx` (Ring), `ProgressScreen.tsx`
  (Tabelle/Woche), `ProfileScreen.tsx`, `App.tsx` (Fokus), `LiveHud.tsx` (ruhige Ansage), `draw.ts`
  (Hologramm halbe Auflösung, reduzierte Bewegung, neutrale Bewegungszonen), Datenschutztexte.

## Aufgabe

1. Gegnerische Tests (nur **neue** Dateien, Namen mit `-r4`): `packages/*/test/codex/*-r4.test.ts`,
   `apps/mobile-web/src/**/*-r4.test.ts`, optional `tests/e2e/*-r4.spec.ts` (lokaler Kanal, kein echtes Netz).
   Schwerpunkte:
   - Protokoll: manipulierte/übergroße/falsch typisierte Nachrichten an den TV (`isPhoneMessage`, `decodePose`),
     Code-Normalisierung, Zustände bei Neuverbindung, zweites Handy, Trennen/Wiederkommen, Reihenfolge TV/Handy.
   - Datenschutz: Kamerabild darf ohne Zustimmung nie gesendet werden (auch nach Widerruf, Ansichtswechsel, Neustart);
     ohne Kopplung keine externe Verbindung; Pose-Daten nur bei bestehender Kopplung.
   - Anzeige: TV zeigt dieselben Werte wie das Handy (Wiederholungen, Punkte, Analyse, Ergebnis), Seitenverhältnis,
     Spiegelung, Demo-Kennzeichnung.
   - Nachprüfung Runde 3: weitere Gegenbeispiele zu den neuen Heuristiken (z. B. Kniebeuge mit starker Vorlage,
     gekippte Kamera bei Ausfallschritt, Hampelmann mit kleinen Beinbewegungen, Ausreißer an Knöcheln).
   Echte Fehler rot lassen und mit `// CODEX-BEFUND:` markieren; Ermessensfragen als `// FRAGE:`.
2. Code-Review: Fehler, Sicherheit (fremde Peers, Code-Erraten, XSS über Nachrichten), Datenschutzaussagen in der UI,
   Ressourcen (Streams/Tracks/Timer nach Trennen), Barrierefreiheit des TV-Bildschirms.
3. Bericht: `docs/reviews/codex-review-4.md` (Deutsch), Befunde nach Schwere mit Datei:Zeile, Szenario, Vorschlag.

Ausführen: `pnpm test`, `pnpm typecheck` (Node unter `D:\tools\node`), `pnpm build && pnpm e2e` nur wenn nötig.
Keine bestehenden Dateien ändern, nichts committen, keine Pakete installieren. Nur in `D:\botprojekte\motion_arena`.
