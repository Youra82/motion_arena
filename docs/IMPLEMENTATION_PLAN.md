# Umsetzung / Claude Code + Codex
## Phase 0 — Repository prüfen
Bestehenden Code und Abhängigkeiten inventarisieren. Nichts überschreiben. Fehlende Informationen benennen.

## Phase 1 — Funktionsfähiger Smartphone-MVP
1. pnpm Monorepo, React/Vite, Tests, Kamera-Berechtigungen.
2. MediaPipe Pose mit Echtzeit-Overlay, Kalibrierung, Konfidenzanzeige.
3. Kniebeugen-Zustandsmaschine mit Hysterese, Rep-Zähler, reproduzierbaren Tests.
4. Schematische Punktebewertung, keine behauptete medizinische Korrektheit.
5. Lokaler Silhouettenmodus; einfacher riggbarer Avatar falls Assets vorhanden, sonst klar gekennzeichneter Platzhalter.
6. Start/Training/Live/Ergebnis, Pausieren, Fehlerzustände.

## Phase 2 — TV
Pairing via QR/Code; WebSocket-Signaling; Posen/Score auf TV; echter Silhouettenstream erst mit WebRTC und getesteter Segmentierung. Disconnect/Reconnect.

## Phase 3 — Live Body Load
Relative Zonen-Heuristiken, Visualisierung, Testfälle und Disclaimer.

## Phase 4 — Content
20 Räume, 15 Avatare, 10 Darstellungen modular nach Asset-Verfügbarkeit. Lizenzierte Assets; keine direkte Xbox/Nike-Kopie.

## Definition of Done MVP
Drei korrekt ausgeführte Kniebeugen werden reproduzierbar als drei Wiederholungen gezählt; Teilkörper/unsichere Posen geben Warnung statt Fehlbewertung; Wechsel der Ansicht verliert keine Sessiondaten; Tests laufen; Datenschutz standardmäßig lokal; echte Geräte manuell geprüft.
