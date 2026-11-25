# Technische Architektur — Vorschlag, nicht implementiert
- Monorepo: pnpm, TypeScript, React/Vite für mobile PWA und TV-Weboberfläche.
- Kamera: getUserMedia unter HTTPS oder localhost; Berechtigungen und iOS-Browserbeschränkungen testen.
- Pose: MediaPipe Pose Landmarker; Personenmaske optional für Freistellung. In Worker/geeigneter Pipeline Performance messen.
- 3D: Three.js + React Three Fiber; GLB/glTF mit Retargeting und zeitlicher Glättung. Pose-Landmarks sind keine vollständige zuverlässige 3D-Rekonstruktion.
- App-State: Zustand; Logik und Rendering strikt getrennt.
- Device pairing: Fastify/Node WebSocket für Signaling; später WebRTC DataChannel für Posen und separater Videostream für echte Silhouette auf TV. Gelenkkoordinaten allein erzeugen keine echte ausgeschnittene Silhouette.
- Privacy by default: Kameraverarbeitung lokal, keine Rohvideospeicherung; explizite Einwilligung bei Stream/Cloud.
- Testing: Vitest für Bewegung/Scoring, Playwright für UI; echte Hardwaretests für FPS, Latenz, Licht, Okklusion, Gerätekopplung.

## Paketstruktur
apps/mobile-web, apps/tv-web, packages/pose-engine, packages/motion-scoring, packages/exercise-library, packages/game-engine, packages/shared, server/signaling, tests.

## Sicherheits- und Qualitätsregeln
Unbekannte oder verdeckte Bewegungen als unsicher markieren; kein erfundenes präzises Muskel- oder Kalorienmessverfahren. Kein Versprechen einer medizinischen Beurteilung. Fehlerhafte Pose darf keine Strafpunkte erzeugen. Kameradaten nur auf ausdrücklichen Wunsch übertragen/speichern.
