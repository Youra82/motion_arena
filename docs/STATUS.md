# Status Phase 1 — Smartphone-MVP Kniebeuge

Stand: 25.11.2026. Gebaut von Claude Code, geprüft in zwei Runden von Codex (`docs/reviews/`).

## Tatsächlich getestet

| Bereich | Wie getestet | Ergebnis |
| --- | --- | --- |
| Kniebeugen-Zähler: 3 saubere Kniebeugen = 3 Wiederholungen | Vitest, synthetische Posen: frontal/seitlich, mit/ohne 3D-Weltkoordinaten, Hoch-/Querformat, 20 Rausch-Seeds | grün |
| Hysterese, Wippen am Tiefpunkt, Zittern an Schwellen, zu flach, zu schnell, sehr langsam, sehr tief | Vitest (eigene + Codex-Tests) | grün |
| Teilkörper/unsichere Pose → Warnung statt Wertung, keine Strafpunkte, Combo bleibt | Vitest | grün |
| Abstandsänderung zur Kamera, seitliches Wandern, Drehung (mit 3D) | Vitest | grün |
| Ungültige Daten (NaN/Infinity, < 33 Punkte, doppelte/rückwärts laufende Zeitstempel, lange Kameralücken, Einzelausreißer) | Vitest (Codex-Runde 1) | grün |
| Gekippte/gerollte Kamera, Wechsel 3D↔2D-Messung, Lücken mit ungültigen Zwischenbildern, zu dünn abgetastete Wiederholungen, Pause zwischen zwei Bildern | Vitest (Codex-Runde 2) | grün |
| Engine-Lebenszyklus: Abbruch während Kamera-/Modell-Laden, React-StrictMode-Doppelstart, Fehler im laufenden Betrieb, Kamera getrennt, Masken-Umschaltung, Ziel-Timer | Vitest mit MediaPipe-Attrappe (Codex-Runde 2) | grün |
| **Datenschutz:** keine einzige Anfrage verlässt das Gerät (Start, Silhouette, Beenden) | Playwright mit Netzwerkmitschnitt + CSP | grün – MediaPipe-Telemetrie an `odml.pa.googleapis.com` wird per CSP blockiert |
| Laden abbrechen → zurück zum Start | Playwright | grün |
| Installierbare Web-App: Manifest/Icons, Service Worker, **Offline-Start**, Installationskarte Android (Installationsdialog) und iPhone (Anleitung), Unterpfad `/motion_arena/` für GitHub Pages | Playwright + Unterpfad-Prüfung mit Chrome-Testkamera | grün |
| Windows-Installer (`Installieren.bat`): Node-Download mit Prüfsumme, pnpm, Build, Verknüpfung; Start mit QR-Code; Aktualisieren; Deinstallieren | echter Lauf in isolierter Kopie | grün (Firewall-Dialog und SmartScreen nicht automatisiert prüfbar) |
| Kalibrierung: ruhiger Stand, Neustart bei Bewegung/Lücke/Hocke, Blickwinkel-Erkennung | Vitest | grün |
| Bewertung, Combo, Pause/Fortsetzen, Zusammenfassung | Vitest | grün |
| Kompletter UI-Ablauf Start → Kalibrierung → Countdown → Training → Ansichtswechsel (Zähler/Punkte bleiben) → Pause → Ergebnis | Playwright, Chrome headless, Demo-Quelle | grün, keine Konsolenfehler |
| Kamera + MediaPipe im Browser: Modell lädt lokal, Live-Bild, „Keine Person“ ohne Wertung | Playwright mit Chrome-Testkamera (Testbild, keine Person) | grün, ~20 fps headless |
| Kamerazugriff verweigert → Fehlerzustand mit Ausweg (Erneut / Demo / Zurück) | Playwright | grün |
| Typprüfung strikt, Produktions-Build | `tsc -b`, `vite build` | grün |

Gesamt: **93 Vitest-Tests grün** (eigene Tests + Codex-Tests aus `test/codex/` und `LiveEngine-r2.test.ts`), 1 Aufnahme-Suite wartet auf echte Daten; **9 Playwright-Tests grün**.

## Noch NICHT getestet (vor Freigabe nötig)

- **Echte Person vor echter Kamera.** Alle Zählertests nutzen synthetische Posen. Die Definition of Done verlangt
  „echte Geräte manuell geprüft“ – offen. Vorgehen: siehe unten „Echte Aufnahmen als Testfälle“.
- Leistung auf Handys (fps, Wärme, Akku), iOS Safari, Android Chrome, Lichtverhältnisse, Kleidung, Hintergrund.
- Installation auf einem echten Handy (Android-Installationsdialog, iPhone „Zum Home-Bildschirm“) und Offline-Betrieb dort.
- Silhouette (Personenmaske) nur kompiliert und im Code geprüft, nicht mit echter Person gesehen.
- Schwellenwerte (Zähltiefe ≈ Kniewinkel 125–130°, „gut“ ≈ Oberschenkel waagerecht) sind Annahmen, nicht an echten
  Menschen kalibriert.

## Echte Aufnahmen als Testfälle

1. App starten, **vor** der Kalibrierung „● Posen aufnehmen“ tippen.
2. Kalibrieren, z. B. genau 5 saubere Kniebeugen machen (oder bewusst Fehlerfälle: zu flach, Teilkörper …).
3. „■ Aufnahme“ tippen → JSON wird auf dem Gerät gespeichert (nur Gelenkkoordinaten, keine Bilder).
4. Datei nach `fixtures/recordings/` legen, `"expectedReps": 5` eintragen.
5. `pnpm test` spielt die Aufnahme exakt wie die App ab (Glättung → Kalibrierung → Zähler) und prüft die Anzahl.

## Bekannte Grenzen

- **MediaPipe-Telemetrie:** `@mediapipe/tasks-vision` 1.2.3 versucht beim Schließen, aggregierte Nutzungsmetriken an
  Google zu senden. Die Content-Security-Policy (`apps/mobile-web/vite.config.ts`) erlaubt nur Verbindungen zum eigenen
  Server und blockiert das; der Browsertest prüft es. Bei jedem SDK-Update erneut `pnpm e2e` laufen lassen.
- Gewertet wird nur mit derselben Messquelle wie bei der Kalibrierung (3D-Weltkoordinaten oder 2D). Fallen die
  3D-Daten aus, pausiert die Wertung ohne Strafe.

- Eine Kamera misst **keine** Muskelkraft, Gelenkbelastung oder Verletzungsrisiko. Die Bewertung ist eine schematische
  Schätzung aus Tiefe, Absenktempo, Links/Rechts-Gleichmäßigkeit und (nur seitlich) Rumpfneigung.
- Frontal ist der Kniewinkel nur über MediaPipe-Weltkoordinaten (geschätzte Tiefe) bestimmbar; ohne sie zählt nur die
  Beinhöhe relativ zur Schulterbreite. Am genauesten: leicht schräg oder seitlich.
- Dreht sich die Person bei reinem 2D-Tracking stark, wird „Blickwinkel geändert“ gemeldet und nicht gewertet.
- Avatar-Ansicht ist ein **Platzhalter** aus Kapseln, kein riggbares 3D-Modell (keine lizenzierten Assets vorhanden).
- Phase 1 enthält 6 der 10 Spiegelungsmodi (Hybrid, Echtbild, Silhouette, Skelett, Bewegungsspur, Avatar-Platzhalter).
- Keine Navigation für Bibliothek/Fortschritt/Profil, kein Speichern von Ergebnissen über die Sitzung hinaus.

## Nächste Schritte

1. Echte Aufnahmen auf 1–2 Handys (frontal, schräg, seitlich; Fehlerfälle) → Schwellen anpassen.
2. Phase 2 TV-Kopplung (QR/Code, WebSocket-Signaling).
3. Phase 3 Live Body Load (relative Zonen, Disclaimer).
