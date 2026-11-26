# Codex-Review 3 – Fortschritt, Spiegelungen und Live Body Load

Die Startseite kann nach einem beschädigten Verlauf ausfallen. Die Live-Körperanalyse meldet bei fehlenden oder mehrdeutigen Daten teilweise konkrete Belastungsstufen und sichere Bewegungslabels. Die Datenschutzhinweise auf Startseite und Profil sind bei aktiver TV-Kopplung zu pauschal. Die Kopplung überträgt Posedaten und Analysewerte, mit zusätzlicher Freigabe auch die Live-Ansicht.

## Hoch

### H1 – Ein einziger defekter Verlaufseintrag kann die Startseite blockieren

**Szenario.** Der Lader akzeptiert jedes Objekt mit einem Datumsstring und einer endlichen Wiederholungszahl. Ein gültig datierter Eintrag mit `components: null` erreicht als letzter Eintrag die Startseite. Dort wirft `movementSummary` beim Lesen von `depth` einen TypeError. Derselbe Lader akzeptiert ungültige Datumsstrings, negative Wiederholungszahlen, Punkte als String und doppelte IDs. Dadurch können außerdem Summen, Challenge und Verlauf falsch sein. Beide Fälle sind rot. [persist.ts:49](../../apps/mobile-web/src/persist.ts#L49) · [HomeScreen.tsx:22](../../apps/mobile-web/src/screens/HomeScreen.tsx#L22) · [progress.ts:189](../../packages/motion-scoring/src/progress.ts#L189)

**Vorschlag.** Das gespeicherte Schema je Eintrag beim Laden validieren und normalisieren. Gültige Einträge behalten, IDs deduplizieren und Komponentenfelder auf die erlaubten Schlüssel und Werte begrenzen. Die Startseite bei einem fehlenden Komponentenobjekt weiterhin rendern.

### H2 – Löschen kann fehlschlagen, während das Profil einen leeren Verlauf zeigt

**Szenario.** Wirft `removeItem` einen Fehler, wird er geschluckt. Der Store leert seinen Verlauf und der Bestätigungsdialog schließt. Nach dem Neuladen erscheinen die Daten wieder. Der rote Test simuliert diesen Fehler. Auch beim Speichern kann die Oberfläche Sitzungen als auf dem Gerät gespeichert ausweisen, obwohl ein Quota-Fehler den Schreibvorgang verhindert hat. [persist.ts:41](../../apps/mobile-web/src/persist.ts#L41) · [persist.ts:76](../../apps/mobile-web/src/persist.ts#L76) · [store.ts:199](../../apps/mobile-web/src/store.ts#L199) · [store.ts:239](../../apps/mobile-web/src/store.ts#L239) · [ProfileScreen.tsx:59](../../apps/mobile-web/src/screens/ProfileScreen.tsx#L59)

**Vorschlag.** Speicheraktionen mit einem Erfolgs- oder Fehlerstatus abschließen. Den Verlauf erst nach bestätigtem Löschen leeren. Fehlgeschlagene Schreibvorgänge als temporäre Ergebnisse kennzeichnen und einen fehlgeschlagenen Löschvorgang im Profil sichtbar und erneut ausführbar machen.

### H3 – Die Datenschutzformulierung unterschlägt die optionale TV-Übertragung

**Szenario.** Das Profil sagt „Nichts wird übertragen“ und die Startseite erklärt, das Kamerabild bleibe auf dem Gerät. Bei aktiver Kopplung sendet der im Arbeitsbaum hinzugekommene TV-Code Bild-Landmarks und den Live-Anzeigestand einschließlich Body Load. Die separate Videofreigabe aktiviert außerdem einen Canvas-Stream. In Echtbild und Hybrid enthält dieser Canvas Kamerabilder. Die Kopplung nutzt standardmäßig PeerJS und einen STUN-Dienst. Für gewöhnliches Training ohne Pairing bleibt der Sender laut Code inaktiv. Die Reichweite direkter Verbindungen wurde im Browser nicht geprüft. [ProfileScreen.tsx:59](../../apps/mobile-web/src/screens/ProfileScreen.tsx#L59) · [HomeScreen.tsx:143](../../apps/mobile-web/src/screens/HomeScreen.tsx#L143) · [phone-link.ts:43](../../apps/mobile-web/src/tv/phone-link.ts#L43) · [phone-link.ts:67](../../apps/mobile-web/src/tv/phone-link.ts#L67) · [phone-link.ts:99](../../apps/mobile-web/src/tv/phone-link.ts#L99) · [TvLink.tsx:21](../../apps/mobile-web/src/components/TvLink.tsx#L21) · [draw.ts:548](../../apps/mobile-web/src/render/draw.ts#L548) · [transport.ts:34](../../apps/mobile-web/src/tv/transport.ts#L34) · [vite.config.ts:20](../../apps/mobile-web/vite.config.ts#L20)

**Vorschlag.** Die Datenschutzhinweise auf den gespeicherten Verlauf und den Standardbetrieb beziehen. Vor der Kopplung Zielgerät, übertragene Datenfelder und externe Verbindungsanbahnung benennen. Die separate Freigabe für Kamerabilder beibehalten und den aktiven Sendestatus im Live-Bildschirm erkennbar machen. Den vorhandenen Browser-Netzwerktest um die Zustände vor, während und nach der Kopplung ergänzen. [camera.spec.ts:10](../../tests/e2e/camera.spec.ts#L10)

### H4 – Unsicherheit wird als niedrige oder weiterhin hohe Beanspruchung ausgegeben

**Szenario.** Ein verdeckter linker Knöchel macht die Wade unsicher, doch der linke Oberschenkel bleibt auf der zuvor hohen Stufe, obwohl sein Kniewinkel den Knöchel benötigt. Ein im Bild sichtbares Knie mit `NaN` in den Weltkoordinaten kann dieselbe alte Stufe behalten. Sind sämtliche Zonen unsicher, fasst das Körperschema sie als „Keine Zone deutlich beansprucht“ zusammen. Die drei Fälle sind rot. [bodyload.ts:99](../../packages/motion-scoring/src/bodyload.ts#L99) · [bodyload.ts:309](../../packages/motion-scoring/src/bodyload.ts#L309) · [bodyload.ts:336](../../packages/motion-scoring/src/bodyload.ts#L336) · [BodyDiagram.tsx:31](../../apps/mobile-web/src/components/BodyDiagram.tsx#L31) · [BodyDiagram.tsx:77](../../apps/mobile-web/src/components/BodyDiagram.tsx#L77)

**Vorschlag.** Pro Zone sämtliche tatsächlich verwendeten Winkel-, Stand- und Dynamikmerkmale anhand von Sichtbarkeit und endlichen Koordinaten prüfen. Fehlen die Voraussetzungen, die Zone als unsicher ausgeben und ihren alten Filterzustand gezielt verwerfen. Im Text ausweisen, wenn keine oder nur einzelne Zonen beurteilbar sind.

## Mittel

### M1 – Bewegungslabels sind bei mehrdeutigen Posen zu bestimmt

**Szenario.** Symmetrisches Stehen bei 30 Grad Kameraroll wird zum Einbeinstand. Alternierende Schritte werden im letzten vollständigen Zyklus in 25 von 25 Bildern als Einbeinstand klassifiziert. Nach dem Hinsetzen erreicht die gehaltene sitzähnliche Position die im HUD als „sicher erkannt“ bezeichnete Schwelle für Kniebeuge. Eine tiefe Vorbeuge mit gestreckten Beinen wird zum Plank. Schnelles Armschwingen mit unveränderten Beinen wird als Hampelmann ausgegeben. Die fünf synthetischen Gegenbeispiele sind rot. Die seitlich gehaltene Kniebeuge funktioniert im Positivtest. [bodyload.ts:144](../../packages/motion-scoring/src/bodyload.ts#L144) · [bodyload.ts:168](../../packages/motion-scoring/src/bodyload.ts#L168) · [bodyload.ts:321](../../packages/motion-scoring/src/bodyload.ts#L321) · [LiveHud.tsx:80](../../apps/mobile-web/src/components/LiveHud.tsx#L80)

**Vorschlag.** Kameravertikale und Standbeinwechsel berücksichtigen. Für Kniebeuge, Plank und Hampelmann jeweils unabhängige Evidenz aus dem Bewegungsverlauf, dem möglichen Stützbild oder der Beinbewegung verlangen. Bei unvermeidbarer Mehrdeutigkeit „unbekannt“ oder eine beobachtbare Pose anzeigen. Im HUD „vermutete Bewegung“ verwenden und die Sicherheit für den tatsächlich gewählten Kandidaten berechnen, da dessen Mehrheitsanteil aktuell mit dem Abstand zur Schwelle des jüngsten Rohkandidaten kombiniert wird.

### M2 – Ausreißer, Bildlücken und fehlende Weltdaten verfälschen die Live-Rückmeldung

**Szenario.** Ein einzelner unrealistischer Handgelenksprung erzeugt am ruhenden Körper „lebhaft“. Nach einer mehrsekündigen Bildlücke bleibt die zuvor hohe Intensität aktiv, weil die Geschwindigkeitsberechnung übersprungen wird und die alten Werte in der Map stehen. Eine sichtbare 2D-Pose ohne Weltpunkte ergibt „Keine Person“. Im Renderer setzt die Ansicht „Bewegungszonen“ fehlende Geschwindigkeit auf null und zeichnet Türkis wie bei ruhiger Bewegung. Die ersten drei Fälle sind rot. Der Übergang von gehaltener Kniebeuge zu stabilem Stehen funktioniert bei durchgehenden gültigen Bildern. [bodyload.ts:275](../../packages/motion-scoring/src/bodyload.ts#L275) · [bodyload.ts:293](../../packages/motion-scoring/src/bodyload.ts#L293) · [draw.ts:338](../../apps/mobile-web/src/render/draw.ts#L338)

**Vorschlag.** Unplausible Positionssprünge und Geschwindigkeiten vor dem Glätten verwerfen, nach einer Lücke neu initialisieren und die Intensität erst nach zwei verwertbaren Zeitpunkten wieder anzeigen. Fehlende Weltpunkte und fehlende Person im Status unterscheiden. Gelenke ohne gültige Geschwindigkeit in den Bewegungszonen neutral oder schraffiert darstellen.

### M3 – Wochenziel und Challenge zählen künftige Tage, der letzte Eintrag kann falsch sein

**Szenario.** Nach einer Uhrkorrektur auf Montag wird das weiterhin vorhandene Dienstagstraining sowohl im Wochenplan als auch in der Challenge eingerechnet. Auch kann ein älterer Eintrag mit Offset `+02:00` vor einem jüngeren UTC-Eintrag landen, wenn die ISO-Texte statt der Zeitpunkte verglichen werden. Beide Tests sind rot. Die normalen Mitternachts-, Montag-, Sommerzeit- und Abschnittsgrenzen sind in beiden getesteten Zeitzonen grün. [progress.ts:90](../../packages/motion-scoring/src/progress.ts#L90) · [progress.ts:111](../../packages/motion-scoring/src/progress.ts#L111) · [progress.ts:132](../../packages/motion-scoring/src/progress.ts#L132) · [progress.ts:160](../../packages/motion-scoring/src/progress.ts#L160)

**Vorschlag.** Daten einmal in gültige Zeitpunkte umwandeln, künftige Zeitpunkte in tagesbezogenen Kennzahlen ausklammern und den jüngsten Eintrag per Zeitvergleich bestimmen.

### M4 – Der Verlauf ändert seine Statistik beim Neuladen

**Szenario.** Beim 1.001. Training zeigt der Store 1.001 Einträge an, der gespeicherte Verlauf enthält 1.000. Ein Reload verändert dadurch Summen und kann den Starttag des laufenden 30-Tage-Abschnitts verschieben. Beim Laden einer manuell vergrößerten Liste wird das Limit ebenfalls nicht angewandt. Der Store-/Speichervergleich ist rot. Die Speicherfunktion behält in einem separaten grünen Test die letzten 1.000 Einträge. [persist.ts:9](../../apps/mobile-web/src/persist.ts#L9) · [persist.ts:52](../../apps/mobile-web/src/persist.ts#L52) · [store.ts:196](../../apps/mobile-web/src/store.ts#L196) · [progress.ts:163](../../packages/motion-scoring/src/progress.ts#L163)

**Vorschlag.** Die gleiche Aufbewahrungsregel beim Laden, Aktualisieren und Speichern anwenden. Falls Langzeitkennzahlen und Challenge unabhängig vom Aufbewahrungslimit fortlaufen sollen, Startdatum und dafür benötigte Aggregate separat erhalten.

### M5 – Wichtige Diagrammwerte fehlen in Textalternativen

**Szenario.** Der Ring zeigt beispielsweise 83 %, sein zugänglicher Name enthält nur den Titel. Das Balkendiagramm ist ein einziges Bild für Hilfstechnologien und nennt die Tageswerte nur in `title` der Spalten. Wochenplan und Körperschema haben keine gleichwertige Textdarstellung für „heute“ bzw. alle Zonenstufen und Seiten. Das Ring-Problem ist per statischem React-Rendering rot. [common.tsx:40](../../apps/mobile-web/src/components/common.tsx#L40) · [common.tsx:60](../../apps/mobile-web/src/components/common.tsx#L60) · [ProgressScreen.tsx:31](../../apps/mobile-web/src/screens/ProgressScreen.tsx#L31) · [ProgressScreen.tsx:84](../../apps/mobile-web/src/screens/ProgressScreen.tsx#L84) · [BodyDiagram.tsx:35](../../apps/mobile-web/src/components/BodyDiagram.tsx#L35)

**Vorschlag.** Ringwert oder „noch keine Daten“ im zugänglichen Namen bereitstellen. Zu den Balken eine nach Datum beschriftete Datentabelle oder Liste anbieten, den aktuellen Wochentag semantisch auszeichnen und die Zonen mit anatomischer Seite und Stufe textlich zugänglich machen.

### M6 – Ansichtswechsel kann Fokus und Orientierung verlieren

**Szenario.** Die Hauptnavigation zeigt ihre Auswahl über `aria-current` und die Schaltflächen haben einen sichtbaren Tastaturfokus. Bei einem Seitenwechsel rendert `App` aber einen anderen Screen samt neuer Navigation. Es gibt keinen Fokusübergang zur Seitenüberschrift. Beim Löschen verschwindet die jeweils fokussierte Schaltfläche, sowohl beim Öffnen der Bestätigung als auch beim Schließen. Das Live-HUD kann bis zu zehnmal pro Sekunde aktualisiert werden. Wechselnde Texte in seiner Live-Region können auf unruhigen Posen zu häufigen Ansagen führen. [App.tsx:15](../../apps/mobile-web/src/App.tsx#L15) · [common.tsx:119](../../apps/mobile-web/src/components/common.tsx#L119) · [styles.css:47](../../apps/mobile-web/src/styles.css#L47) · [ProfileScreen.tsx:61](../../apps/mobile-web/src/screens/ProfileScreen.tsx#L61) · [LiveHud.tsx:80](../../apps/mobile-web/src/components/LiveHud.tsx#L80) · [LiveEngine.ts:292](../../apps/mobile-web/src/engine/LiveEngine.ts#L292)

**Vorschlag.** Nach Navigation die neue Überschrift fokussieren oder eine stabile Navigation mit klarer Seitenankündigung verwenden. Für die Bestätigung Fokusübergang und -rückgabe festlegen. Analyse-Ansagen auf längere stabile Zustandswechsel begrenzen.

### M7 – Gitter und Hologramm verlieren bei exakter Seitenansicht die Rumpffläche

**Szenario.** Überlagern sich linke und rechte Schulter sowie die Hüften exakt, kollabiert das Rumpfpolygon. Die Rumpfmitte liegt laut `insideBody` außerhalb der Figur. Das stilisierte Hologramm ohne Segmentierungsmaske füllt dasselbe Polygon direkt. In einer weniger extremen seitlichen Kniebeuge liefert das Gitter zwei Dreiecke mit praktisch null Fläche. Beide Tests sind rot. Identische und rein kollineare Eingabepunkte ohne Körperfläche liefern erwartungsgemäß keine Dreiecke. [body-shapes.ts:27](../../apps/mobile-web/src/render/body-shapes.ts#L27) · [body-shapes.ts:109](../../apps/mobile-web/src/render/body-shapes.ts#L109) · [body-shapes.ts:136](../../apps/mobile-web/src/render/body-shapes.ts#L136) · [draw.ts:419](../../apps/mobile-web/src/render/draw.ts#L419)

**Vorschlag.** Ein degeneriertes Rumpfpolygon beim Aufbau durch eine schmale Kapsel zwischen Schulter- und Hüftmitte ersetzen, wie es die Muskelansicht bereits stilisiert. Nahe Duplikate vor der Triangulierung zusammenführen und Dreiecke unterhalb einer skalenbezogenen Flächengrenze verwerfen. [draw.ts:291](../../apps/mobile-web/src/render/draw.ts#L291)

### M8 – Rendering und Analyse skalieren mit der Bildrate und dem Viewport

**Szenario.** Das Gitter erzeugt pro Frame Punkte und trianguliert sie neu. Für jeden Punkt durchsucht Bowyer–Watson die bisherige Dreiecksliste und legt neue Arrays, Rand-Maps und String-Schlüssel an. Die Stichprobendichte je Gliedmaßensegment ist nach oben offen. Das Hologramm verarbeitet einen DPR-skalierten Canvas, zeichnet je sechs Pixel eine Scanline und kombiniert den Vollbildpuffer mit Schatten und Mischoperationen. Im Kameramodus lässt es zudem die Maske berechnen und kopieren. Der Analyzer kopiert Weltpunkte, scannt das Klassifikationsfenster und sortiert die Stimmen je Frame. Die Engine berechnet auch im reinen Analysemodus Kniebeugemerkmale und pflegt die Bewegungsspur unabhängig von der gewählten Ansicht. Wie viel Framezeit diese Pfade kosten, hängt vom Gerät ab. [body-shapes.ts:60](../../apps/mobile-web/src/render/body-shapes.ts#L60) · [body-shapes.ts:117](../../apps/mobile-web/src/render/body-shapes.ts#L117) · [draw.ts:391](../../apps/mobile-web/src/render/draw.ts#L391) · [draw.ts:449](../../apps/mobile-web/src/render/draw.ts#L449) · [landmarker.ts:105](../../apps/mobile-web/src/engine/landmarker.ts#L105) · [bodyload.ts:303](../../packages/motion-scoring/src/bodyload.ts#L303) · [LiveEngine.ts:222](../../apps/mobile-web/src/engine/LiveEngine.ts#L222) · [LiveEngine.ts:283](../../apps/mobile-web/src/engine/LiveEngine.ts#L283)

**Vorschlag.** Stichproben pro Segment begrenzen und Gittertopologie wiederverwenden oder mit eigener Frequenz aktualisieren. Den Hologrammpuffer niedriger auflösen und ein wiederholbares Scanline-Muster einmal pro Puffergröße erstellen. Im Analyzer das Zeitfenster über eine begrenzte Queue und laufende Stimmen führen. Nur die für den aktuellen Modus nötigen Features, die Trackingqualität und gegebenenfalls die Spur berechnen. Auf einem schwächeren Mobilgerät Inferenz-, Analyse- und Renderzeit je Ansicht getrennt erfassen, einschließlich P95 und ausgelassener Frames.

## Niedrig

### N1 – Die Standard-Ansicht ist nach Analyse, Demo und beschädigten Einstellungen inkonsistent

**Szenario.** Die Analyse setzt `viewMode` auf „muskel“, die Kniebeugen-Demo auf „skelett“. Das nächste Kameratraining erbt den flüchtigen Wert. Der rote Test zeigt „muskel“ statt „hybrid“ nach der Analyse. Ein unbekannter gespeicherter Ansichtsstring bleibt außerdem in den Einstellungen erhalten. Die Live-Ansicht fällt auf Hybrid zurück und im Profil ist keine Auswahl aktiv. Dieser Fall ist ebenfalls rot. [persist.ts:61](../../apps/mobile-web/src/persist.ts#L61) · [store.ts:128](../../apps/mobile-web/src/store.ts#L128) · [store.ts:151](../../apps/mobile-web/src/store.ts#L151) · [ProfileScreen.tsx:42](../../apps/mobile-web/src/screens/ProfileScreen.tsx#L42)

**Vorschlag.** Beim Laden gegen die gemeinsamen Ansichts-IDs validieren. Beim Einstieg ins Kameratraining die persistierte Einstellung verwenden und die Demo-/Analyse-Ansicht nur für den jeweiligen Durchlauf setzen.

### N2 – Die Zielauswahl der Startseite unterschlägt eine gültige Einstellung

**Szenario.** Im Profil und im Trainingsscreen sind 20 Wiederholungen wählbar. Die Startseite bietet nur 5, 10 und 15 an. Mit Standardziel 20 ist dort keine Schaltfläche gedrückt, obwohl das Training mit 20 startet. [HomeScreen.tsx:7](../../apps/mobile-web/src/screens/HomeScreen.tsx#L7) · [HomeScreen.tsx:45](../../apps/mobile-web/src/screens/HomeScreen.tsx#L45) · [TrainingScreen.tsx:4](../../apps/mobile-web/src/screens/TrainingScreen.tsx#L4) · [ProfileScreen.tsx:32](../../apps/mobile-web/src/screens/ProfileScreen.tsx#L32)

**Vorschlag.** Die gleichen Zielwerte verwenden oder den ausgewählten Wert dauerhaft an der Startschaltfläche ausgeben.

### N3 – Aufnahme, Präzisionswert und Spiegelung brauchen klarere Beschriftungen

- **Aufnahme.** „Posen aufnehmen“ exportiert auf Anforderung und beim Erreichen der Obergrenze eine lokale JSON-Datei mit 2D- und Weltlandmarks samt Zeitangaben. Das Profil erklärt nur die Verarbeitung von Kamerabildern. Beim Start der Aufnahme kurz benennen, welche Posedaten aufgezeichnet und wann sie lokal heruntergeladen werden. [LiveScreen.tsx:183](../../apps/mobile-web/src/screens/LiveScreen.tsx#L183) · [LiveEngine.ts:212](../../apps/mobile-web/src/engine/LiveEngine.ts#L212) · [recorder.ts:25](../../apps/mobile-web/src/engine/recorder.ts#L25)
- **Messsprache.** Live Body Load trennt Intensität und vermutete Beanspruchung sichtbar, zeigt keine Lastprozente und enthält einen Hinweis auf die Grenzen der Schätzung. Der separate Ring auf der Startseite bezeichnet den Trainingsscore als „Bewegungspräzision“ in Prozent. „Geschätzte Trainingsbewertung, 83 von 100 Punkten“ würde die Herkunft des Werts klarer benennen. [LiveHud.tsx:86](../../apps/mobile-web/src/components/LiveHud.tsx#L86) · [LiveHud.tsx:94](../../apps/mobile-web/src/components/LiveHud.tsx#L94) · [HomeScreen.tsx:61](../../apps/mobile-web/src/screens/HomeScreen.tsx#L61)
- **Seiten.** Der Analyzer behält beim Spiegeln der Bildkoordinaten die anatomische Zuordnung. Der Canvas spiegelt die Punkte bei Frontkamera und Demo. Bei einem als `environment` gemeldeten Track bleibt das Kamerabild ungespiegelt, das Körperschema hat weiterhin links die anatomisch linke Seite. Bei frontaler Person kann dieselbe Zone dadurch in Live-Bild und Schema auf entgegengesetzten Bildschirmseiten liegen. Den Schema-Bezug „deine linke/rechte Seite“ explizit nennen. Die Prüfung deckt synthetische Spiegelung und die Projektionslogik ab. [bodyload-r3.test.ts:128](../../packages/motion-scoring/test/codex/bodyload-r3.test.ts#L128) · [LiveEngine.ts:146](../../apps/mobile-web/src/engine/LiveEngine.ts#L146) · [draw.ts:44](../../apps/mobile-web/src/render/draw.ts#L44) · [BodyDiagram.tsx:8](../../apps/mobile-web/src/components/BodyDiagram.tsx#L8)
- **Bewegungseffekte.** Hologramm-Flimmern und gelegentliche Sprünge laufen unabhängig von der Einstellung für reduzierte Bewegung. Für diesen Modus einen stabilen Hologrammeffekt anbieten, wenn reduzierte Bewegung gewünscht ist. [draw.ts:478](../../apps/mobile-web/src/render/draw.ts#L478)

## Offene Produktentscheidungen

- Soll ein Training nach einem Zeitzonenwechsel den lokalen Tag des Trainingsorts behalten? Der aktuelle Code gruppiert nach der lokalen Zeitzone beim Anzeigen. Der Test sichert die bestehende Mitternachtslogik. [progress.ts:24](../../packages/motion-scoring/src/progress.ts#L24) · [progress-r3.test.ts:46](../../packages/motion-scoring/test/codex/progress-r3.test.ts#L46)
- Soll „Gesamt“ den verfügbaren Verlauf oder die gesamte Trainingshistorie meinen? Diese Entscheidung bestimmt, ob das Aufbewahrungslimit sichtbar erklärt werden muss oder ältere Kennzahlen separat zu erhalten sind. [persist.ts:57](../../apps/mobile-web/src/persist.ts#L57) · [ProgressScreen.tsx:68](../../apps/mobile-web/src/screens/ProgressScreen.tsx#L68)

## Prüflauf

| Prüfung | Ergebnis |
| --- | --- |
| `pnpm test` vor den neuen Tests | 113 bestanden, 1 übersprungen, 1 Todo |
| `pnpm test` mit `TZ=Europe/Berlin` | 137 bestanden, 22 bewusst rot markiert, 1 übersprungen, 1 Todo |
| Kalenderdatei mit `TZ=America/Los_Angeles` | 7 bestanden, dieselben 2 Kalenderbefunde rot |
| `pnpm typecheck` | Bestanden |

Node und pnpm liefen aus `D:\tools\node`. Die beiden Zeitzonen wurden über `Intl` und die 23- bzw. 25-Stunden-Abstände zwischen lokalen Mitternachten verifiziert. Fünf neue Testdateien enthalten insgesamt 46 Fälle. Wiederholtes Beenden derselben Kamera-Session schreibt einmal. Beide Demo-Modi lassen einen vorhandenen Kameraverlauf unangetastet.

Auf Build und E2E habe ich für diesen Review ohne Produktionscodeänderungen verzichtet. Netzwerkverkehr, Screenreader-Ausgabe und Renderleistung auf Mobilgeräten wurden daher anhand der jeweiligen Codepfade beurteilt. Die synthetischen Tests prüfen die Heuristik mit kontrollierten Koordinaten. Aussagen zur Trefferquote des tatsächlichen Kameramodells erfordern Aufnahmen auf realen Geräten.
