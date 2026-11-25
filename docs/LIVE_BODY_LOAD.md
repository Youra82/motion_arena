# Live Body Load — Anforderung
Ziel: freier Analysemodus, der ohne vorherige Übungsauswahl Körperhaltung und Bewegung verfolgt und **grobe, relative, modellbasierte Beanspruchung** anzeigt.

## Beispiele
- Einbeinstand: Standbein/Hüftstabilisatoren/Rumpf vermutlich stärker beteiligt.
- Hampelmann: Bein- und Schulterbewegung dynamisch, Beanspruchung phasenabhängig.
- Kniebeuge: Oberschenkel/Gesäß stärker, Rumpf stabilisiert.
- Ausfallschritt: vorderes Bein/Gesäß und Stabilisation.
- Plank: Rumpf/Schulter/Arme statisch beansprucht.

## Technisches Konzept
Pose-Landmarks -> Gelenkwinkel/relative Geschwindigkeiten/Phasen/Balance-Indikatoren -> Bewegungsklassifikation (optional) -> heuristische biomechanische Zonenbewertung mit Konfidenz -> Heatmap. Glätten, bei fehlender Sichtbarkeit zurückhalten, Wechsel zwischen Ansichten ohne Sessionverlust.

## Unbedingt trennen
- Bewegungsintensität: aus Video teilweise schätzbar.
- Vermutete Beanspruchung: nur grobe Heuristik, auch bei statischer Haltung.
- Tatsächliche Muskelaktivität, Kräfte, Druck, Gewicht pro Bein: mit Einzelkamera **nicht messbar**.

## Anzeige
Zonen: gering/mittel/hoch/unsicher, mit Hinweis 'geschätzt'. Keine erfundenen Prozentwerte (z.B. Quadrizeps 92%). Keine Aussagen über Verletzung oder medizinische Diagnose.

## Testplan
Erst Einbeinstand, Hampelmann, Kniebeuge, Ausfallschritt, Armheben; manuell plausibilisieren, Konfidenz prüfen, unbekannte Bewegungen auf 'unbekannt/unsicher' setzen.
