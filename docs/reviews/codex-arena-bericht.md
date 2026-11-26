# Arena-Trainingsansicht

Das Kniebeugen-Training startet mit der Arena, sofern im Profil keine andere Ansicht gespeichert ist. Die Demo öffnet die Arena direkt. Das Studio-Loft verbindet eine Bergkulisse, eine Fensterfront, warmes Licht und einen reflektierenden Boden. Lebombo steht als zweiter Raum zur Wahl. Ein texturiertes 3D-Modell führt die Kniebeuge aus. Der Spieler erscheint als türkisfarbenes Hologramm mit Gelenkpunkten und Nachbildern.

Im Kameratraining entsteht das Hologramm aus der lokalen Personenmaske und den Körperpunkten. Bei deaktivierter Bildfreigabe zeichnet der Fernseher das Hologramm aus den Körperpunkten. Das gemeinsame HUD zeigt Wiederholungen, Punkte, aktive Zeit, Richtzeit, geschätzte kcal, Präzision und Haltungs-Checks. Die Richtzeit ergibt sich aus dem Wiederholungsziel und dem Trainerrhythmus von 3,2 Sekunden pro Kniebeuge. Eine Wiederholung liefert nur die vom Kamerawinkel und der Erkennungsqualität unterstützten Checks. Das HUD enthält keine Pulsanzeige.

Die kcal-Zahl schätzt die Bruttoenergie aus der Dauer der gezählten Wiederholungen bei einem Referenzgewicht von 70 kg. Der Richtwert für allgemeine Körpergewichtsübungen beträgt 3 MET. Der Symmetrie-Check „Knie stabil“ beruht auf dem Unterschied zwischen den beiden Kniewinkeln. „Rücken gerade“ nutzt die geschätzte Oberkörperneigung. [Adult Compendium of Physical Activities, Eintrag 02056](https://pacompendium.com/conditioning-exercise/)

„Bewegung reduzieren“ blendet Nachbilder aus und hält die Scanlines der 2D-Figur statisch. Bei fehlendem WebGL läuft das Training mit einer 2D-Ersatzszene weiter. Ohne TV-Bildstream zeichnet der Browser die WebGL-Fläche direkt und legt die Maskenebene darüber. Für die freigegebene Spiegelung werden die Ebenen auf dieselbe Capture-Leinwand gezeichnet. Das WebGL-Bild ist auf rund 0,42 Megapixel im Hochformat und 0,65 Megapixel im Querformat begrenzt.

[Screenshot aus dem laufenden Demo-Training](../screenshots/45-arena.png)

## Build und Assets

| Bestandteil | Größe, gerundet |
| --- | ---: |
| Haupt-JavaScript | 385,03 kB, 122,68 kB gzip |
| Nachgeladenes 3D-Modul | 725 kB, 189 kB gzip |
| Komprimiertes Trainermodell | 2,48 MB, rund 90.000 Dreiecke, 24 Knochen |
| Studio-Loft HDR | 1,64 MB |
| Lebombo HDR | 1,48 MB |
| Beide JPG-Alternativen zusammen | 183 kB |

Die 3D-Dateien werden bei Bedarf vom eigenen Server geladen und danach lokal zwischengespeichert. Das verfeinerte Modell behält mehr Geometrie für Gesicht, Hände und Bewegungsfalten bei 2,48 MB gegenüber 11,35 MB im Original. Die optimierten Laufzeitdateien sind versionierbar, die bereitgestellten CC0-Originale bleiben lokale Eingaben für die Aufbereitungsskripte. [Grafikquellen und Lizenzen](../ASSETS.md)

## Prüfung und Grenzen

- `pnpm test` meldet 239 bestandene Tests, einen übersprungenen Test und ein bestehendes Todo.
- `pnpm typecheck` und `pnpm build` sind erfolgreich. Die Vite-Größenwarnung bezieht sich auf das nachgeladene 3D-Modul.
- `pnpm e2e` meldet im Gesamtlauf 30 bestandene Tests. Zwei Tests wurden übersprungen, weil ihre externen Personenbilder in dieser Umgebung nicht erreichbar waren. Die Testkamera lieferte im Headless-Lauf 4 Bilder pro Sekunde für die Erkennung.
- Die Arena-Browsertests prüfen den 3D-Start ohne Konsolenfehler, die Demo-Wertung, den Raumwechsel, den Laufzeitcache und die TV-Ansicht ohne Bildfreigabe.
- `pnpm screenshots arena-graphics.spec.ts` speichert das Studio im laufenden Chrome-Demo-Training bei drei gezählten Wiederholungen und zwei verbleibenden Wiederholungen.

Der Vergleich mit der vorhandenen TV-Referenz zeigt die räumliche Anordnung mit Hologramm und Ring links, Trainer rechts sowie dunklem Spiegelboden, warmem Licht und Rückmeldung am unteren Rand. Das prozedural modellierte Loft, die Pflanzen und das CC0-Modell bleiben sichtbar stilisierter als die Vorlage. Die Demo zeigt echte Zählerstände ihrer synthetischen Posen. Der frontal simulierte Blick lässt den Haltungs-Check offen. Eine echte Handykamera, ein Smart-TV und die Leistung auf verschiedenen Geräten brauchen einen Praxistest. [TV-Referenz](../references/tv_kinetic_studio.png)

## Grafik aus den Projektvorlagen

Alle 20 Vorlagenräume erscheinen im laufenden Training. Vier Breitbildfassungen wurden für den Live-Hintergrund neu gerendert. Die 16 übrigen Motive wurden mit CUDA auf der RTX 3060 Ti vierfach hochskaliert. Der gemessene Lauf dauerte 3,1 Sekunden. Chrome meldete dieselbe GPU für WebGL über ANGLE und Direct3D 11.

Körperpunkte animieren den vorhandenen 3D-Körper in Skelett, Gitter, Hologramm, Lukas, Muskelansicht, Bewegungszonen und Bewegungsspur. Die Muskelansicht färbt modellbasiert geschätzte Beanspruchung, die Bewegungszonen verwenden Bewegungsgeschwindigkeiten. Die Kameramaske erscheint in Grün. Hybrid zeigt die freigestellte Kameraaufnahme links und das Hologramm rechts. Die 15 Porträts im Katalog stammen aus den freigegebenen Projektgrafiken. Die übrigen 14 Avatare brauchen für die gewünschte Live-Optik jeweils ein eigenes geriggtes 3D-Modell.

Der Produktions-Build, 239 Unit-Tests, sechs abschließende Browsertests für Arena, TV, Katalog, Körperanalyse und Testkamera sowie beide Screenshot-Tests sind erfolgreich.

[3D-Körperanalyse im laufenden Ausfallschritt](../screenshots/46-koerperanalyse-3d.png) · [Grafikquellen und Aufbereitung](../ASSETS.md)

## Lukas in der Avatar-Ansicht

Lukas trägt dunkles Sportgewebe mit orangefarbenen Nähten und modellierte Sneaker mit Schnürung und farbiger Sohle. Das Bühnenlicht wurde auf das Gesicht und die Kleidung abgestimmt. Für die Kniebeugen-Demo nutzt die Figur den gemessenen Beugegrad der synthetischen Pose, einen breiteren Stand und eine leichte Dreiviertelansicht. Im Kameratraining folgt der Avatar den erkannten Körperpunkten. Gesicht, Haar und einzelne Handbewegungen bleiben durch das vorhandene Basismodell begrenzt. [Aufnahme aus der Demo](../screenshots/48-lukas-live.png)

Die zweite Überarbeitung ergänzt Hautstruktur mit entfernungsabhängig gedämpftem Porendetail, Übergänge zwischen matteren und glänzenderen Stellen und weichere Hautschatten. Ein relatives Morphziel formt Oberarme, Unterarme, Oberschenkel und Waden abhängig von der Beugetiefe. Die kurzen Strähnen folgen der vorhandenen Haaroberfläche und dem Kopfknochen. Das Gesichtsprofil stammt weiterhin aus dem Basismodell. [Detailaufnahme aus dem Live-Renderer](../screenshots/49-lukas-details.png)

Core Studio verwendet jetzt eine mit CUDA aufbereitete HDR-Lichtumgebung aus der Raumgrafik. Haut, Haare, Shirt und Shorts haben eigene Rauheits- und Reflexionseigenschaften. Die Fasern des Shirts streuen das Licht weicher, die Shorts zeigen breitere Reflexe in Bewegungsfalten. Kontakt- und Aufhelllicht bleiben unabhängig vom Kamerabild. [Lukas bei aktualisiertem Studiolicht](../screenshots/50-lukas-studiolicht.png)

## Fortsetzung durch Claude Code (26.11., nach Codex' Limit)

- **Lukas aus dem Menschengenerator geprüft:** Codex' Versuch `assets-src/lukas-reconstruction/lukas-ara.glb` (Ara 3D Gen, MIT, MakeHuman-Inhalte CC0) wurde texturreduziert (`scripts/shrink-glb-textures.py`) und mit gltfpack auf 2,3 MB gebracht und eingebaut. Ergebnis im Vergleich schwächer als der ausstaffierte Grab3D-Trainer (puppenhaftes Gesicht, einheitliche Uniform, weiße Socken) – daher **nicht übernommen**; Grab3D-Trainer bleibt.
- **Code robuster für künftige Modelle:** Wirbelsäule wird über die Hierarchie ab der Hüfte erkannt (Grab3D `Spine02→Spine01→Spine`, MakeHuman/Mixamo `Spine→Spine1→Spine2`); Mehrteil-Figuren mit eigenen Materialien (Haut, Augen, Haare, Kleidung, Schuhe) werden unterstützt, Detailteile nur in der Avatar-Ansicht.
- **Keine stillen Rückfälle mehr:** Scheitert das Laden oder Zeichnen der 3D-Szene, steht der Grund jetzt als Warnung in der Konsole (vorher wechselte die App wortlos auf die 2D-Ersatzszene).
- Lokale Modellversuche und Sicherungen sind per `.gitignore` vom öffentlichen Repo ausgeschlossen.
- Geprüft: `pnpm typecheck`, 239 Vitest, 34 Playwright, 3 Arena-Screenshots – alles grün.
