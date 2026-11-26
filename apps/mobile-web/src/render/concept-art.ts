export function conceptArt(kind: "avatars" | "rooms", number: number): string {
  return `${import.meta.env.BASE_URL}arena/concepts/${kind}/${String(number).padStart(2, "0")}.webp`;
}

const wideBackdrops: Record<number, string> = {
  1: "core-studio", 2: "mountain-arena", 10: "ocean-deck", 14: "neon-arena",
};

/**
 * Bodenhöhe je Raumbild (Anteil der Bildhöhe, von oben) an der Standposition von Spieler (x≈0,39) und Trainer
 * (x≈0,68). Die Figuren werden darauf gestellt, damit sie in jedem Raum auf dem Boden stehen statt zu schweben.
 * Gemessen an den Hintergründen in `public/arena/concepts/` (16:9-Ausschnitt); Bezug ist das Core Studio.
 */
export const ROOM_GROUND: Record<number, { player: number; trainer: number }> = {
  1: { player: 0.714, trainer: 0.662 },
  2: { player: 0.74, trainer: 0.69 },
  3: { player: 0.84, trainer: 0.80 },
  4: { player: 0.84, trainer: 0.80 },
  5: { player: 0.84, trainer: 0.80 },
  6: { player: 0.84, trainer: 0.80 },
  7: { player: 0.83, trainer: 0.79 },
  8: { player: 0.83, trainer: 0.78 },
  9: { player: 0.89, trainer: 0.86 },
  10: { player: 0.76, trainer: 0.71 },
  11: { player: 0.87, trainer: 0.84 },
  12: { player: 0.88, trainer: 0.85 },
  13: { player: 0.85, trainer: 0.81 },
  14: { player: 0.74, trainer: 0.69 },
  15: { player: 0.81, trainer: 0.77 },
  16: { player: 0.715, trainer: 0.675 }, // Vordergrund ist Becken – Standfläche am Ufer unter dem Wasserfall
  17: { player: 0.78, trainer: 0.73 },
  18: { player: 0.85, trainer: 0.81 },
  19: { player: 0.85, trainer: 0.81 },
  20: { player: 0.87, trainer: 0.83 },
};

/**
 * Liegt der Boden im Raumbild sehr tief, wird das Bild leicht vergrößert und unten verankert – so bleiben die
 * Figuren über Rückmeldung und Bedienleiste, statt hinter ihnen zu verschwinden.
 */
/** Raumbilder ohne Standfläche im Vordergrund (z. B. nur Wasser): Figuren stehen auf dem 3D-Studioboden. */
export const ROOM_PLATFORM = new Set<number>([16]);

export function backdropZoom(number: number): number {
  const g = ROOM_GROUND[number];
  return g && g.player > 0.8 ? 1.2 : 1;
}

export function roomBackdrop(number: number): string {
  const wide = wideBackdrops[number];
  const filename = wide ? `${wide}.webp` : `live/${String(number).padStart(2, "0")}.webp`;
  return `${import.meta.env.BASE_URL}arena/concepts/${filename}`;
}

const catalogueImages = new Map<string, HTMLImageElement>();

export function conceptImage(url: string): HTMLImageElement {
  let image = catalogueImages.get(url);
  if (!image) {
    image = new Image();
    image.src = url;
    catalogueImages.set(url, image);
  }
  return image;
}

export function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number): void {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
}
