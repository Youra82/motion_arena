"""Export individual room and portrait tiles from the project's approved concept sheets."""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
REFERENCES = ROOT / "docs/references"
OUTPUT = ROOT / "apps/mobile-web/public/arena/concepts"


def save_tiles(source, category, regions):
    destination = OUTPUT / category
    destination.mkdir(parents=True, exist_ok=True)
    with Image.open(REFERENCES / source) as sheet:
        for number, region in enumerate(regions, 1):
            sheet.crop(region).convert("RGB").save(destination / f"{number:02d}.webp", quality=91)


def main():
    room_columns = [(10, 298), (320, 607), (628, 910), (931, 1214), (1235, 1527)]
    room_rows = [(94, 246), (332, 483), (571, 708), (797, 934)]
    save_tiles("training_rooms_20.png", "rooms", [(x1, y1, x2, y2) for y1, y2 in room_rows for x1, x2 in room_columns])

    first_row = [(24, 214), (231, 424), (439, 630), (640, 834), (848, 1040), (1055, 1246), (1260, 1450), (1465, 1652)]
    second_row = [(34, 235), (261, 464), (487, 693), (727, 931), (960, 1162), (1197, 1400), (1431, 1639)]
    save_tiles("avatars_15.png", "avatars", [(x1, 134, x2, 410) for x1, x2 in first_row] + [(x1, 525, x2, 801) for x1, x2 in second_row])


if __name__ == "__main__":
    main()
