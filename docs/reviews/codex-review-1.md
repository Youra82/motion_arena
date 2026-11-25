# Codex-Review 1 – Kniebeugen, Kalibrierung und Erkennungsqualität

Die Kernlogik zählt drei synthetische Kniebeugen bei stabilem Kameraabstand auch mit Bildrauschen und unregelmäßiger Framerate korrekt. Längerer Teilkörper mit fortlaufenden Frames erzeugt eine Warnung und erhält den Punktestand und die Combo. Schon eine Abstandsänderung kann jedoch drei vollständige Kniebeugen verschlucken. Eine Drehung in die Frontalansicht kann eine gültige Wiederholung als zu flach bewerten. Beschädigte Weltkoordinaten können den Session-Punktestand zu `NaN` machen.

Der Review umfasst die Pose-Engine, den Zähler, die Bewertung und den Session-Reducer. Der parallel hinzugekommene Mobile-Code setzt beim Darstellungswechsel separat den Ansichtsmodus. Beim Resume nach einer von der Frame-Schleife beobachteten Pause ruft er `resetMotion()` auf, wie im neuen Kernlogiktest. Browser- und Hardwareergebnisse gehören nicht zum Vitest-Lauf. [store.ts:119](../../apps/mobile-web/src/store.ts#L119), [LiveEngine.ts:193](../../apps/mobile-web/src/engine/LiveEngine.ts#L193)

## Kritisch

### K1 – Abstand kann Wiederholungen erfinden oder unterdrücken

**Stelle** [features.ts:146](../../packages/pose-engine/src/features.ts#L146), [squat.ts:184](../../packages/motion-scoring/src/squat.ts#L184).

**Szenario.** Bei 3D-Winkeln und durchgehend 0° Kniebeugung schrumpft die Bildgröße von 0,75 auf 0,46 und wächst wieder zurück. Der Zähler meldet eine Wiederholung. In einem zweiten Test schrumpft die Person während der ersten von drei vollständigen Kniebeugen um 20 %. Die geschätzte Tiefe im aufrechten Stand bleibt dadurch bei etwa 0,33, oberhalb der Top-Schwelle von 0,12. Ergebnis sind 0 statt 3 Wiederholungen.

**Vorschlag.** Absolute Hüftposition durch ein relatives, auf eine möglichst beugungsunabhängige aktuelle Referenzlänge normiertes Signal ersetzen. Die vertikale Hüfte-Knöchel-Distanz allein taugt als Referenzlänge während der Beugung kaum, weil sie mit der Tiefe sinkt. Bei widersprüchlichen Signalen die Wertung aussetzen und bei Bedarf den Stand neu erfassen.

### K2 – Ungültige Weltkoordinaten können den Session-Punktestand beschädigen

**Stelle** [geometry.ts:8](../../packages/pose-engine/src/geometry.ts#L8), [features.ts:39](../../packages/pose-engine/src/features.ts#L39), [features.ts:68](../../packages/pose-engine/src/features.ts#L68), [squat.ts:203](../../packages/motion-scoring/src/squat.ts#L203), [scoring.ts:41](../../packages/motion-scoring/src/scoring.ts#L41), [session.ts:95](../../packages/motion-scoring/src/session.ts#L95).

**Szenario.** Ein Welt-Knie enthält `NaN`, das andere fällt im gleichen Frame wegen degenerierter Geometrie auf 2D zurück. `angleDeg` liefert links `NaN`, das als 3D-Winkel durchgeht. Das zuletzt verarbeitete rechte Bein setzt die gemeinsame Quelle auf 2D. Frontal bleibt die Tiefe dadurch über die Bildhüfte endlich. Die Symmetrie wird trotzdem aus beiden Winkeln berechnet. Nach dem Aufrichten ist die Wiederholung gespeichert und der Session-Punktestand `NaN`. Ein Weltpunkt mit `Infinity` reproduziert den defekten Winkel auch isoliert.

**Vorschlag.** Pro Welt-Beinkette Punktverfügbarkeit und Endlichkeit prüfen und bei nicht endlichem oder degeneriertem Ergebnis auf einen geeigneten 2D-Winkel oder `null` fallen. Quellen pro Bein führen und Symmetrie nur aus vergleichbaren, endlichen Winkeln berechnen. Der Reducer sollte als letzte Schutzlinie nur endliche Wertungen verbuchen.

### K3 – Kameradrehung beendet eine Combo wegen falscher Bewegungsbewertung

**Stelle** [features.ts:148](../../packages/pose-engine/src/features.ts#L148), [squat.ts:210](../../packages/motion-scoring/src/squat.ts#L210), [session.ts:108](../../packages/motion-scoring/src/session.ts#L108).

**Szenario.** Nach einer gültigen seitlichen 2D-Wiederholung dreht sich die Person beim nächsten Abstieg zur Kamera und beugt die Knie auf 85°. Frontal erscheinen die Knie in 2D gestreckt. Die Kalibrierung bleibt auf `side` und der Zähler nutzt den Winkel weiter. Er meldet `shallow` und der Reducer setzt die Combo auf null.

**Vorschlag.** Die aktuelle Ansicht mit zeitlicher Stabilisierung prüfen. Während eines unsicheren Ansichtswechsels die betroffenen Winkel- und Haltungswerte aussetzen. Wenn die verbleibenden Signale für die laufende Wiederholung nicht ausreichen, eine Tracking-Warnung ohne Combo-Verlust auslösen.

## Wichtig

### W1 – Lange Kameralücken zählen als beobachtete Bewegung

**Stelle** [squat.ts:117](../../packages/motion-scoring/src/squat.ts#L117), [squat.ts:135](../../packages/motion-scoring/src/squat.ts#L135), [calibration.ts:64](../../packages/pose-engine/src/calibration.ts#L64).

**Szenario.** Nach einem Abstieg fehlen knapp zwei Sekunden Kameradaten. Mit und ohne einen einzelnen Teilkörper-Frame vor der Lücke zählen zwei gültige Aufstiegs-/Stand-Frames danach je eine Wiederholung. `badSince` wird beim ersten wieder gültigen Frame gelöscht, bevor seine Dauer ausgewertet wird. In der Kalibrierung genügen zwei Standbilder mit 3,5 Sekunden Abstand für `done`.

**Vorschlag.** Zeitabstände zwischen verarbeiteten Frames und Dauer seit dem ersten ungültigen Frame beim Wiedersehen prüfen. Bei einer langen Lücke den Versuch ohne Wertung abbrechen, erneuten Stand verlangen und die Kalibrierungszeit ab dem ersten neuen gültigen Frame messen.

### W2 – Ein Tiefen-Ausreißer im Stand erzeugt einen Fehlversuch

**Stelle** [squat.ts:153](../../packages/motion-scoring/src/squat.ts#L153), [squat.ts:168](../../packages/motion-scoring/src/squat.ts#L168), [squat.ts:219](../../packages/motion-scoring/src/squat.ts#L219), [session.ts:108](../../packages/motion-scoring/src/session.ts#L108).

**Szenario.** Bei 20 FPS zeigt genau ein Frame eine plausibel aussehende 100°-Beugung. Alle übrigen zeigen Stand. Der Zähler erzeugt `too-fast` mit 150 ms. Im Reducer würde das eine bestehende Combo beenden.

**Vorschlag.** Phasenübergänge mit zeitlicher Evidenz oder einer robusten Ausreißerprüfung bestätigen, bevor ein Frame eine Wiederholung startet oder einen Tiefpunkt setzt. Ein isolierter Sprung darf keine Bewegungsfehlwertung erzeugen.

### W3 – Ungültige Sichtbarkeit umgeht die Qualitätsprüfung

**Stelle** [quality.ts:18](../../packages/pose-engine/src/quality.ts#L18), [quality.ts:64](../../packages/pose-engine/src/quality.ts#L64), [features.ts:39](../../packages/pose-engine/src/features.ts#L39).

**Szenario.** Ein Schulterwert mit `NaN` liefert `ok` mit `NaN`-Konfidenz. Ein Kniewert mit `Infinity` liefert `ok` mit unendlicher Konfidenz. Eine hoch bewertete Schulter außerhalb des Bildes hebt den Mittelwert einer sonst unsicheren Pose über 0,65. Separat liefert ein Welt-Knöchel mit Sichtbarkeit 0 bei intaktem seitlichem Bildmaterial rund 180° statt 105°.

**Vorschlag.** Sichtbarkeiten pro Punkt als endliche Werte im dokumentierten Bereich validieren und nur tatsächlich verwendbare Punkte in die Konfidenz einbeziehen. Die Qualität der Weltpunkte separat prüfen. Bildgrenzen gelten dabei für Bildpunkte. [MediaPipe Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker?tab=Web#task_output)

### W4 – Nicht monotone Zeitstempel verändern Ablauf und Wertung

**Stelle** [shared/src/index.ts:15](../../packages/shared/src/index.ts#L15), [squat.ts:117](../../packages/motion-scoring/src/squat.ts#L117), [squat.ts:197](../../packages/motion-scoring/src/squat.ts#L197), [scoring.ts:35](../../packages/motion-scoring/src/scoring.ts#L35), [calibration.ts:73](../../packages/pose-engine/src/calibration.ts#L73).

**Szenario.** Der Typ dokumentiert monotone Zeitstempel. Ein Frame mit doppeltem Zeitstempel löst dennoch einen Fehlversuch aus. Ein verspäteter Tiefpunkt schreibt `bottomT = 1950` bei `startT = 2160` und führt damit zu einer negativen Absenkzeit in der Bewertung. In der Kalibrierung ergibt die Folge 600, 600, 550 ms einen Fortschritt von −0,033.

**Vorschlag.** Am Kamera- oder Merkmalseingang Zeitstempel auf Endlichkeit und strikten Anstieg prüfen, bevor sie den Zustand ändern. Bei einem Zeitbasiswechsel den Bewegungs- und Kalibrierungspuffer gezielt zurücksetzen. Der Mobile-Adapter erzwingt steigende Zeiten für MediaPipe. Die Kernlogik erhält separat `performance.now()` aus der Frame-Schleife. Im `requestAnimationFrame`-Fallback kann dasselbe dekodierte Bild dadurch mehrere frische Zeitstempel erhalten. Dort auch prüfen, ob ein neues Videobild vorliegt. [landmarker.ts:47](../../apps/mobile-web/src/engine/landmarker.ts#L47), [LiveEngine.ts:131](../../apps/mobile-web/src/engine/LiveEngine.ts#L131)

### W5 – Die frontale 2D-Kalibrierung akzeptiert die Hocke als Stand

**Stelle** [calibration.ts:60](../../packages/pose-engine/src/calibration.ts#L60), [calibration.ts:79](../../packages/pose-engine/src/calibration.ts#L79), [features.ts:141](../../packages/pose-engine/src/features.ts#L141).

**Szenario.** Eine Person bleibt ohne Weltkoordinaten zwei Sekunden bei 85° Kniebeugung in der Hocke. Beide Beinsegmente projizieren sich in der Frontalansicht auf dieselbe senkrechte Linie. Die Kalibrierung speichert 180° und die Hüfthöhe der Hocke als Standreferenz, obwohl die Tiefenmessung den frontalen 2D-Winkel später ausdrücklich ausklammert.

**Vorschlag.** Für den Nachweis des Stands eine verlässliche 3D-Beinkette oder seitliche Sicht verlangen. Eine frontale 2D-Standkalibrierung braucht ein zusätzliches Merkmal, das unter den unterstützten Kamerawinkeln Stand und Hocke unterscheidet.

### W6 – Ein ungültiger Punkt kann die Glättung dauerhaft stören

**Stelle** [smoothing.ts:22](../../packages/pose-engine/src/smoothing.ts#L22), [smoothing.ts:58](../../packages/pose-engine/src/smoothing.ts#L58), [LiveEngine.ts:163](../../apps/mobile-web/src/engine/LiveEngine.ts#L163).

**Szenario.** In drei aufeinanderfolgenden Frames ist nur die x-Koordinate eines Knöchels im mittleren Frame `NaN`. Auch die nächste gültige Eingabe liefert `NaN`. Mit fortlaufenden Zeitstempeln und gleicher Anzahl der Landmarks bleibt der Filterzustand ungültig.

**Vorschlag.** Nicht endliche Koordinaten vor der Filteraktualisierung abfangen und den betroffenen Kanal beim nächsten gültigen Wert wieder initialisieren. Eine fehlende Messung als unsicher weitergeben.

## Klein

### N1 – Unerreichbarer Zweig blockierte die Typprüfung, inzwischen behoben

**Stelle** [squat.ts:135](../../packages/motion-scoring/src/squat.ts#L135), ursprünglicher Zweig in `squat.ts:191`.

**Szenario.** Vor dem `switch` wird `uncertain` zu `standing`. Beim ersten Typcheck meldete TypeScript `TS2678` für den unerreichbaren `case "uncertain"`. Eine parallele Änderung hat den Zweig entfernt. Die abschließende Typprüfung der Pakete samt neuer Tests ohne Dateiausgabe war fehlerfrei.

**Vorschlag.** Den Typcheck neben den Laufzeittests ausführen.

### N2 – Synthetische Weltpose deckt Kameradrehung nur teilweise ab

**Stelle** [synth.ts:139](../../packages/pose-engine/src/synth.ts#L139), [synth.ts:156](../../packages/pose-engine/src/synth.ts#L156), [pose-engine.test.ts:39](../../packages/pose-engine/test/pose-engine.test.ts#L39).

**Szenario.** `view` ändert die 2D-Projektion und Sichtbarkeiten. Die XYZ-Werte der Weltpose bleiben in Front- und Seitenansicht identisch. Ein Vergleich dieser beiden Winkel prüft daher keine tatsächliche Rotation der Weltpunkte und keine blickwinkelabhängigen Fehler des Modells.

**Vorschlag.** Für 3D-Geometrietests die Weltpunkte gezielt um eine Achse rotieren und für den Kameraadapter echte Front-, Seiten- und Übergangsaufnahmen ergänzen.

## MediaPipe und Integration

- **Koordinaten.** Der Faktor Breite/Höhe für normalisiertes x in der 2D-Winkelberechnung entspricht den getrennten Normalisierungsachsen. Das Seitenverhältnis muss vom ausgewerteten Bild nach Drehung oder Zuschnitt kommen. Bild-z ist eine relative Tiefenschätzung. Die Weltpose liegt in Metern mit Ursprung zwischen den Hüften vor. Aus diesem Ursprung lässt sich kein absoluter Kameraabstand ableiten. [MediaPipe Pose Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker?tab=Web#task_output)
- **Spiegelung.** Die 2D-Reflexion `x → 1 − x` lässt im Test beide Kniewinkel und den Betrag der Rumpfneigung unverändert. Links und rechts bleiben anatomische Seiten. Die Vorschau kann unabhängig von der Inferenz gespiegelt werden. Der Overlay-Adapter muss dieselbe Anzeigetransformation wie das Video anwenden. [MediaPipe-Landmark-Indizes](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker?tab=Web#pose_landmarker_model)
- **Sichtbarkeit und Anwesenheit.** MediaPipe unterscheidet die Sichtbarkeit eines Punkts von seiner geschätzten Anwesenheit. Der Adapter setzt globale Detektions-, Anwesenheits- und Tracking-Schwellen auf jeweils 0,5 und übernimmt pro Punkt nur die Sichtbarkeit. Bei niedriger punktbezogener Anwesenheit kann die Kernlogik dieses zusätzliche Signal daher nicht berücksichtigen. [landmarker.ts:24](../../apps/mobile-web/src/engine/landmarker.ts#L24), [landmarker.ts:62](../../apps/mobile-web/src/engine/landmarker.ts#L62), [MediaPipe NormalizedLandmark](https://developers.google.com/edge/api/mediapipe/js/tasks-vision.normalizedlandmark#normalizedlandmarkpresence)

## Testinventar

`pnpm test` meldet **58 bestanden, 18 fehlgeschlagen, 1 TODO**. Von den 36 neuen Fällen bestehen 17. Alle 41 Bestandstests sind grün. Die 18 roten Fälle dokumentieren reproduzierte Befunde und tragen `CODEX-BEFUND` im Quelltext.

### Motion Scoring

[camera-adversarial.test.ts](../../packages/motion-scoring/test/codex/camera-adversarial.test.ts)

| Fall | Ergebnis |
| --- | --- |
| Drei seitliche 2D-Kniebeugen mit Rauschen und wechselnder Framerate | Grün |
| Zittern an Start- und Umkehrschwelle | Grün |
| Drei Kniebeugen bei seitlichem Wandern | Grün |
| Sehr tiefe Kniebeuge mit 145° Beugung | Grün |
| Start in Hocke, Aufstehen und erster vollständiger Zyklus | Grün |
| Rechte Beinkette durchgehend verdeckt | Grün, ohne Symmetriewertung |
| Abstand wächst und schrumpft im Stand | **Rot, K1**, 1 statt 0 Wiederholungen |
| Abstand wächst während der ersten von drei Kniebeugen | **Rot, K1**, 0 statt 3 Wiederholungen |
| Einzelner Tiefen-Ausreißer | **Rot, W2**, `too-fast` |
| Zittern an der oberen Schwelle | Grün |
| Drehung von seitlich zu frontal während einer 2D-Wiederholung | **Rot, K3**, `shallow` |
| Kurze beidseitige Verdeckung | Grün |
| Längerer Teilkörper mit fortlaufenden Frames | Grün, Warnung und Combo bleibt |
| Lange Kameralücke ohne Frame und mit einem Teilkörper-Frame | **Rot, W1**, je eine falsche Wiederholung in zwei Fällen |
| Doppelter Zeitstempel | **Rot, W4**, `too-fast` |
| Rückwärts datierter Tiefpunkt | **Rot, W4**, Tiefpunkt vor Beginn |
| Ein Stand-Frame genügt nach einem ausgelassenen Aufstiegsbild | Grün |
| Pause und Resume mitten in der Bewegung mit `resetMotion()` | Grün |
| Beschädigte Weltkoordinaten in einem einzelnen Frame | **Rot, K2**, nicht endliche Session-Punkte |

### Pose Engine

[pose-adversarial.test.ts](../../packages/pose-engine/test/codex/pose-adversarial.test.ts)

| Fall | Ergebnis |
| --- | --- |
| Auf 0, 28 oder 32 Bildpunkte gekürzte Pose | Grün in drei Fällen |
| `NaN` und `Infinity` in Bildkoordinaten der Knöchel | Grün, Teilkörper |
| `NaN` in Schulter-Sichtbarkeit | **Rot, W3**, `ok` |
| `Infinity` in Knie-Sichtbarkeit | **Rot, W3**, `ok` |
| Hohe Sichtbarkeit einer Schulter außerhalb des Bilds | **Rot, W3**, `ok` |
| Nicht endliche Weltkoordinate | **Rot, K2**, `NaN` im Kniewinkel |
| Unsichtbarer Welt-Knöchel bei intakter Bildpose | **Rot, W3**, rund 180° statt 105° |
| Gespiegelte 2D-Landmarks | Grün |
| Glättung nach einem einzelnen defekten Bildpunkt | **Rot, W6**, Folgewert bleibt `NaN` |
| Kalibrierung nach abgeschnittenem Frame | Grün, Standzeit beginnt neu |
| Frontal in tiefer Hocke kalibrieren, ohne Weltkoordinaten | **Rot, W5**, Kalibrierung akzeptiert |
| Zwei Standbilder mit dazwischenliegender Kameralücke | **Rot, W1**, Kalibrierung akzeptiert |
| Doppelter, danach rückwärts laufender Kalibrierungs-Zeitstempel | **Rot, W4**, Fortschritt unter null |
| Seitliches Wandern bei der Kalibrierung | **TODO**, Produktentscheidung zur erlaubten Translation |
