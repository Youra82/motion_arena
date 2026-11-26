# Arena-Assets

Die App liefert alle Grafikdateien vom eigenen Ursprung aus. Sie lädt das Modell und die Raumdateien beim ersten Einsatz und speichert sie danach im Service-Worker-Cache.

| Datei | Herkunft und Verwendung | Lizenz |
| --- | --- | --- |
| `arena/trainer.glb` | Grab3D, Man Base Character Rigged. Meshopt-komprimiertes Modell mit Originaltexturen und Rig. Die Kniebeuge entsteht zur Laufzeit. | CC0 1.0, [mitgelieferte Lizenz und KI-Hinweis](../assets-src/cc0/LICENSE-grab3d.txt) |
| `arena/loft.hdr`, `arena/loft.jpg` | HDR-Beleuchtung und fotografischer Hintergrund der Ersatzdarstellung aus [Photo Studio Loft Hall](https://polyhaven.com/a/photo_studio_loft_hall) von Poly Haven | [CC0 1.0](https://polyhaven.com/license) |
| `arena/lebombo.hdr`, `arena/lebombo.jpg` | HDR-Panorama und fotografischer Hintergrund aus [Lebombo](https://polyhaven.com/a/lebombo) von Greg Zaal, Poly Haven | [CC0 1.0](https://polyhaven.com/license) |

Das Loft mit Fensterfront, Bergkulisse, Pflanzen, reflektierendem Boden und Wandlogo entsteht aus Geometrie und Materialien in `studio-loft.ts`. [Visuelle Referenz](references/tv_kinetic_studio.png)

Die Bilddateien lassen sich mit `scripts/prepare-arena-rooms.py` aus den lokalen Quellen neu erzeugen. `scripts/prepare-arena-model.mjs` komprimiert das ursprüngliche Trainermodell für die App.

## Projektgrafiken für Katalog und Live-Räume

- `arena/concepts/rooms/*.webp` enthält die 20 Raummotive aus [der Raumvorlage](references/training_rooms_20.png). Die Aufnahmen dienen als Auswahlkarten und als Vorlage für die Live-Hintergründe.
- `arena/concepts/avatars/*.webp` enthält 15 Porträts aus [der Avatar-Vorlage](references/avatars_15.png). `scripts/export-concept-art.py` exportiert beide Serien ohne Beschriftungen aus den Vorlagen.
- `arena/concepts/core-studio.webp` ist die hochauflösende Live-Fassung des ersten Raummotivs. Sie entstand mit dem integrierten ImageGen aus der Raumvorlage. Der Prompt verlangte eine einzelne fotorealistische Breitbildaufnahme des Core Studio mit industriellem Beton, Stahlfenstern und Bergblick, warmen Lichtleisten, orangefarbenem MA-Zeichen, reflektierendem Graphitboden und freier Trainingsfläche ohne Personen oder Bedienoberfläche.
- `arena/concepts/mountain-arena.webp`, `arena/concepts/ocean-deck.webp` und `arena/concepts/neon-arena.webp` sind weitere 1672 × 941 px große Live-Fassungen aus ImageGen. Jeder Prompt verweist auf die entsprechende Karte der Raumvorlage und verlangt eine fotorealistische Breitbildaufnahme mit freier Trainingsfläche. Die Mountain Arena zeigt eine alpine Fensterfront im warmen Holzloft, Ocean Deck eine tiefblaue Aquarienlounge und die Neon Arena eine symmetrische Halle mit magenta und cyan leuchtenden Lichtleisten.
- `arena/concepts/live/` enthält die übrigen 16 Motive für die Live-Ansicht. `scripts/upscale-room-art.py` hat sie aus den Auswahlkarten vierfach hochskaliert. Die Aufbereitung lief lokal mit PyTorch und CUDA auf einer RTX 3060 Ti. [Offizieller Real-ESRGAN-Checkpoint](https://github.com/xinntao/Real-ESRGAN/releases/tag/v0.2.5.0)
- `arena/concepts/core-studio-light.hdr` enthält die Lichtumgebung für Core Studio (768 × 384 px, 355 kB). `scripts/bake-core-studio-light.py` projiziert die Raumgrafik auf eine Kugel und ergänzt geschätzte Lichtquellen für Fenster, Leisten und Aufhellung. Der CUDA-Lauf auf der RTX 3060 Ti dauerte 0,92 Sekunden. WebGL verwendet die resultierende Karte, um Haut- und Stoffreflexe im Live-Bild zu beleuchten.

Die Raumgrafiken definieren die Kulisse. Hologramm, Trainer, Körperzonen und Nachbilder werden darüber im laufenden Training animiert. Das für Lukas verwendete Rig animiert die 3D-Ansichten. Seine Sportschuhe entstehen aus eigenständiger Geometrie und bewegen sich mit den Fußknochen. Für die übrigen Porträts fehlen passende riggbare Modelle.
