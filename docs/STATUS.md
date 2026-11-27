# Status — Version 0.2 (Kniebeuge, Fortschritt, 10 Ansichten, Körperanalyse, TV, Avatare & Räume)

Stand: 26.11.2026. Gebaut von Claude Code, geprüft in fünf Runden von Codex (`docs/reviews/`).

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
| **Datenschutz:** ohne TV-Kopplung verlässt keine Anfrage das Gerät (Start, Silhouette, Beenden) | Playwright mit Netzwerkmitschnitt + CSP | grün – MediaPipe-Telemetrie an `odml.pa.googleapis.com` wird per CSP blockiert |
| Laden abbrechen → zurück zum Start | Playwright | grün |
| Installierbare Web-App: Manifest/Icons, Service Worker, **Offline-Start**, Installationskarte Android/iPhone, Unterpfad `/motion_arena/` für GitHub Pages | Playwright + Unterpfad-Prüfung | grün |
| Windows-Installer (`Installieren.bat`): Node-Download mit Prüfsumme, pnpm, Build, Verknüpfung; Start mit QR-Code; Aktualisieren; Deinstallieren | echter Lauf in isolierter Kopie | grün (Firewall-Dialog und SmartScreen nicht automatisiert prüfbar) |
| Kalibrierung, Bewertung, Combo, Pause/Fortsetzen, Zusammenfassung | Vitest | grün |
| Kompletter UI-Ablauf Start → Kalibrierung → Countdown → Training → Ansichtswechsel → Pause → Ergebnis | Playwright, Demo-Quelle | grün, keine Konsolenfehler |
| Kamera + MediaPipe im Browser (Testbild und **Personenbild**): Modell lokal, „Keine Person“, Silhouette mit GPU-Maske, Körperanalyse erkennt Ausfallschritt | Playwright mit Chrome-Testkamera | grün |
| **Fortschritt & Speicher:** Kalendertage, Sommerzeit, Wochenbeginn, Challenge-Abschnitte, Zukunftsdaten, beschädigte/doppelte Einträge, Speicher voll/gesperrt, Aufbewahrung 1000, Löschfehler sichtbar | Vitest (Codex-Runden 3–4) | grün |
| **Live-Körperanalyse:** Bewegungen frontal/seitlich, gekippte Kamera, Gehen, Hinsetzen, Vorbeugen, tiefe Kniebeuge mit Vorlage, Armschwingen, Ausreißer (auch Knöchel), Bildlücken, verdeckte Gelenke, NaN, fehlende 3D-Daten, kollabierte Pose, Seitenzuordnung | Vitest (Codex-Runden 3–5) | grün |
| **10 Ansichten** inkl. Gittermodell (degenerierte/seitliche Posen), Hologramm (halbe Auflösung, reduzierte Bewegung), Muskelansicht, Bewegungszonen | Vitest + Sichtprüfung der Screenshots | grün |
| **TV-Modus, Protokoll:** Typen, Längen, Grenzen, Version, Tiefenreihenfolge, ältere Posen verworfen | Vitest (Codex-Runden 4–5) | grün |
| **TV-Modus, Sitzung:** QR mit Schlüssel koppelt sofort; Code braucht „Annehmen“ am TV; Ablehnen; zweites Handy abgewiesen; Rennen beim Auf-/Abbau; Aufräumen von Anruf, Videospuren, Timern; Widerruf auch bei Speicherfehler und nach Neuladen; Start-Fehler und Fristen | Vitest + Playwright (lokaler Kanal) | grün |
| **TV-Modus, echte Verbindung:** zwei Chrome-Instanzen über 0.peerjs.com + WebRTC-Video | Skript mit Chrome-Testkamera | grün: gekoppelt in ~1 s, Video 390×844, nur 0.peerjs.com extern |
| **Avatare & Räume:** 15 Avatare, 20 Räume, Einstellungen (alt/manipuliert), fehlende/ungültige Punkte, kollabierte Pose, Raum-Cache, Auswahlseite, Größenwechsel, reduzierte Bewegung, TV zeigt Raum/Avatar | Vitest + Playwright (Codex-Runde 5) | grün |
| Typprüfung strikt, Produktions-Build (Hauptbündel 377 kB, Körpererkennung lädt erst beim Kameratraining) | `tsc -b`, `vite build` | grün |

| **3D-Arena:** Start ohne Konsolenfehler, Demo-Wertung, Raumwechsel, Laufzeit-Cache, TV ohne Bildfreigabe; Figuren stehen in allen 20 Räumen auf dem Boden (Standhöhe je Raumbild, Waterfall mit Plattform) | Vitest + Playwright + Sichtprüfung aller 20 Räume (`docs/screenshots/51-arena-20-raeume.jpg`) | grün |

Gesamt: **242 Vitest-Tests grün** (eigene + Codex-Tests aus 5 Runden), 1 Aufnahme-Suite wartet auf echte Daten;
**34 Playwright-Tests grün**.

## Noch NICHT getestet (vor Freigabe nötig)

- **Echte Person vor echter Kamera.** Alle Zähler- und Analysetests nutzen synthetische Posen (plus ein Personenfoto).
  Vorgehen: siehe unten „Echte Aufnahmen als Testfälle“.
- Leistung auf Handys (fps, Wärme, Akku) – besonders Hologramm, Gitter, Avatar-Seite; iOS Safari, Android Chrome,
  Lichtverhältnisse, Kleidung, Hintergrund.
- Installation auf einem echten Handy und Offline-Betrieb dort.
- **TV-Modus auf einem echten Fernseher** (Smart-TV-Browser, Fernbedienung) und in Heimnetzen mit Gast-WLAN/Client-
  Isolation (ohne Relay kann die Direktverbindung dort scheitern).
- Schwellenwerte (Zähltiefe, Körperanalyse-Heuristiken) sind Annahmen, nicht an echten Menschen kalibriert.

## Echte Aufnahmen als Testfälle

1. App starten, **vor** der Kalibrierung „● Posen aufnehmen“ tippen.
2. Kalibrieren, z. B. genau 5 saubere Kniebeugen machen (oder bewusst Fehlerfälle: zu flach, Teilkörper …).
3. „■ Aufnahme stoppen & speichern“ tippen → JSON wird auf dem Gerät gespeichert (nur Gelenkkoordinaten, keine Bilder).
4. Datei nach `fixtures/recordings/` legen, `"expectedReps": 5` eintragen.
5. `pnpm test` spielt die Aufnahme exakt wie die App ab (Glättung → Kalibrierung → Zähler) und prüft die Anzahl.

## Bekannte Grenzen

- **MediaPipe-Telemetrie:** `@mediapipe/tasks-vision` 1.2.3 versucht beim Schließen, Nutzungsmetriken an Google zu
  senden. Die Content-Security-Policy blockiert das; der Browsertest prüft es. Bei jedem SDK-Update erneut `pnpm e2e`.
- Eine Kamera misst **keine** Muskelkraft, Gelenkbelastung oder Verletzungsrisiko. Bewertung und Körperanalyse sind
  schematische Schätzungen; die Körperanalyse nennt eine **vermutete** Bewegung und Beanspruchung, sonst „unbekannt“.
- Frontal ist der Kniewinkel nur über MediaPipe-Weltkoordinaten bestimmbar. Am genauesten: leicht schräg oder seitlich.
- **3D-Figuren:** animiert ist bisher nur Trainer Lukas (CC0-Grundmodell); die übrigen Avatare sind Porträtkarten. Ohne Bildfreigabe zeigt der Fernseher Kamera-Ansichten (Echtbild, Hybrid, Silhouette) als Skelett.
- Nur die Übung Kniebeuge wird gezählt und bewertet.
- **Programme (v0.3):** Der Planer (`src/program/planner.ts`) baut aus 6 Antworten ein 6–8-Wochen-Programm
  (Phasen Grundlage/Aufbau/Steigerung, Ersatzübungen bei Knie-/Rücken-/Schulterbeschwerden, Dauer passend zur
  gewünschten Zeit). Kniebeugen laufen darin mit Kamera-Zählung; alle anderen Übungen sind geführte Schritte mit
  Anleitung und Timer, die von Hand abgehakt werden. Gespeichert werden nur Antworten und Fortschritt (Gerät).
- Der Verlauf hält höchstens 1000 Trainings; Kennzahlen beziehen sich auf den gespeicherten Verlauf.

## Nächste Schritte

1. Echte Aufnahmen auf 1–2 Handys (frontal, schräg, seitlich; Fehlerfälle) → Schwellen anpassen.
2. Test am echten Fernseher.
3. Weitere Übungen mit Zählung und Bewertung; Trainer-Avatar, der die Übung vormacht.
