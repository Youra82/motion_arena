Der [Reviewbericht](/D:/botprojekte/motion_arena/docs/reviews/codex-review-1.md) enthält nach Schwere sortierte Befunde mit Dateizeilen, reproduzierbaren Szenarien und Korrekturvorschlägen.

Ich habe 36 neue Vitest-Fälle für [Motion Scoring](/D:/botprojekte/motion_arena/packages/motion-scoring/test/codex/camera-adversarial.test.ts) und die [Pose Engine](/D:/botprojekte/motion_arena/packages/pose-engine/test/codex/pose-adversarial.test.ts) ergänzt. `pnpm test` ergab **58 bestanden, 18 fehlgeschlagen und 1 TODO**. Alle 41 Bestandstests sind grün. Die 18 reproduzierten Fehler bleiben wie beauftragt rot und sind mit `CODEX-BEFUND` markiert.

Die kritischsten Befunde sind falsche oder fehlende Wiederholungen bei geändertem Kameraabstand, ein ungerechtfertigter Combo-Verlust bei Drehung zur Frontalansicht und ein `NaN`-Punktestand durch beschädigte Weltkoordinaten.

Ich habe ausschließlich die beiden Testdateien und den Bericht angelegt und nichts committet.