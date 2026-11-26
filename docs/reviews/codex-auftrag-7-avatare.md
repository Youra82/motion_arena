# Codex-Auftrag 7 — Alle 15 Avatare als 3D-Figuren (Generator)

Stand: `5284e4d` (gepusht, live). Bisher ist nur **Lukas** eine animierte 3D-Figur (ausstaffierter Grab3D-Körper).
Die anderen 14 sind wählbar, erscheinen aber nur als Porträtkarte bzw. fallen in der Ansicht „Avatar“ auf die alte
2D-Zeichnung zurück (`view-modes.ts:hasLiveStage`, `render/draw.ts:698`). Der Nutzer will **alle 15 als 3D-Figur**.

## Entscheidung des Nutzers

**Alle 15 aus dem Menschengenerator** – Ara 3D Gen (`github.com/TuriaArt/3d-gen-TU`, MIT; Figurendaten MakeHuman CC0;
Exporte frei nutzbar). Deine Kopie liegt in `%TEMP%\motion-arena-avatar-lab\3d-gen-TU`, dein Lukas-Versuch in
`assets-src/lukas-reconstruction/` (`ara-preset.json`, `lukas-ara.glb`). Claude Code darf den Generator nicht
ausführen – du schon. Generator nicht ins Repo legen; Exporte + Presets ja (Presets unter `assets-src/avatars/`).

## Vorlage: Konzeptbild „Avatar-Auswahl“ (`docs/references/avatars_15.png`, Porträts in `public/arena/concepts/avatars/`)

| Nr | Name | Aussehen laut Konzeptbild |
| --- | --- | --- |
| 01 | Lukas | Mann ~30, kurzes braunes Haar, Bartschatten, athletisch; schwarzes T-Shirt mit orangen Akzenten |
| 02 | Elena | Frau, dunkles Haar im hohen Pferdeschwanz, schlank-athletisch; schwarzer Sport-BH, schwarze Leggings |
| 03 | Ken | Mann, ostasiatisch, schwarzes Haar mit schwarzem Stirnband, muskulös; ärmelloser schwarzer Hoodie, Handbandagen |
| 04 | Mia | Frau, blondes Haar im Dutt, hell; Sport-BH in Beere/Mauve |
| 05 | David | Mann, dunkle Haut, Glatze/sehr kurz, kurzer Bart, sehr muskulös; graues Tanktop |
| 06 | Aiko | Frau, ostasiatisch, schwarzes Haar im Dutt, schlank; salbeigrünes Tanktop |
| 07 | Viktor | Mann 55+, graues Haar und grauer Bart, kräftig; schwarzes T-Shirt |
| 08 | Nova | Frau, rotbrauner Zopf, athletisch; oliv-gelbe Outdoorjacke über dunklem Top |
| 09 | Matteo | Mann, dunkle Locken, freundlich; grauer Hoodie |
| 10 | Raven | Frau, schwarzes Haar mit Pony, tätowierte Arme; schwarzer Sport-BH |
| 11 | Finn | Mann, kurzes blond-braunes Haar, athletisch; hellgraues Tanktop |
| 12 | Sara | Frau, blonder Zopf, freundlich; türkis/petrolfarbenes Tanktop |
| 13 | Leo | Mann, dunkles Haar, kurzer Bart, muskulös; ärmelloser schwarzer Hoodie |
| 14 | Zara | Frau, dunkle Haut, lockiges Haar im Pferdeschwanz; limettengrünes Top |
| 15 | Echo | Mann, ostasiatisch, kurzes schwarzes Haar; schwarzer Funktionsanzug mit Cyan-/Silberakzenten |

Untenrum je Figur passende Sporthose/Leggings/Shorts und Sportschuhe (keine weißen Socken mit Straßenschuhen).
Was der Generator nicht kann (Tattoos, Bandagen, Akzentstreifen), per Material/Textur nachrüsten oder im Bericht nennen.

## Umsetzung

1. Je Avatar ein Preset (Alter, Muskeln, Gewicht, Größe, Proportionen, Haare, Augen, Kleidung, Farben, Rest-Pose A),
   exportieren, verkleinern wie gehabt (Texturen ≤ 1024 px: `scripts/shrink-glb-textures.py`; Geometrie meshopt –
   **Achtung:** three r187 lädt gltfpack-1.3-Kompression nicht zuverlässig; nimm den Weg aus
   `scripts/prepare-arena-model.mjs` bzw. prüfe das Laden im Browser). Ziel ≤ ~2,5 MB je Figur, on demand laden.
2. Einbau: Die gewählte Figur erscheint in der Ansicht „Avatar“ **und als Trainer in der Arena**; die 2D-Rückfallfigur
   entfällt. Mehrteil-Figuren mit eigenen Materialien und unterschiedliche Wirbelsäulen-Benennung werden schon
   unterstützt (`arena-three.ts`: `playerParts`, `tuneFigureMaterial`; `trainer-rig.ts`: `spineChain`). Lukas darf
   Grab3D bleiben, wenn er dort besser aussieht – dann im Bericht begründen.
3. Auswahlseite: Porträtkarten bleiben; Vorschau zeigt die 3D-Figur.

## Qualität (wichtig – Nutzerhinweis „darf nicht in der Luft hängen, kontrolliere dich“)

- **Jede der 15 Figuren selbst rendern und ansehen**: Avatar-Ansicht und Arena, Stand + tiefe Kniebeuge; als
  Übersicht zusammensetzen (`docs/screenshots/52-avatare-3d.jpg`) und mit dem Konzeptbild vergleichen.
  Prüfen: Füße auf dem Boden, keine Durchdringungen, Arme/Kniebeuge natürlich, Gesicht/Haare nicht kaputt, Proportionen.
- Bestehende Tests grün halten (`pnpm test`, `pnpm typecheck`, `pnpm build && pnpm e2e`, Node unter `D:\tools\node`),
  neue Tests für Avatar-Laden/-Wechsel; `docs/ASSETS.md` mit Herkunft/Lizenz je Figur ergänzen.
- **Nicht committen/pushen.** Bericht: `docs/reviews/codex-avatare-bericht.md` (Deutsch) mit Übersicht, Größen, Grenzen.
- Keine persönlichen Daten/echten IPs ins Repo (öffentlich).
