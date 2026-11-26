import type { Locator, Page } from "@playwright/test";

/** Bühne als Bildschirmfoto auswerten: die 3D-Arena liegt auf einer eigenen WebGL-Fläche unter der HUD-Leinwand. */
export async function stageColors(page: Page, stage: Locator): Promise<{ magenta: number; skin: number; lime: number }> {
  const png = (await stage.screenshot()).toString("base64");
  return page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let magenta = 0;
    let skin = 0;
    let lime = 0;
    for (let i = 0; i < d.length; i += 4 * 7) {
      const [r, g, b] = [d[i]!, d[i + 1]!, d[i + 2]!];
      if (r > 150 && b > 120 && g < 90) magenta++;
      if (r > 90 && r > g && g > b && r - b > 40 && r < 200) skin++;
      if (r > 120 && g > r + 22 && b < 120) lime++;
    }
    return { magenta, skin, lime };
  }, png);
}

/** Hauptmenü: Fernseher-Kopplung über die Kachel „Fernseher“ öffnen (falls die Code-Eingabe nicht schon offen ist). */
export async function openTvPanel(page: Page): Promise<void> {
  if (await page.getByRole("textbox", { name: "Code vom Fernseher" }).isVisible()) return;
  await page.getByRole("navigation", { name: "Hauptmenü" }).getByRole("button", { name: /^Fernseher/ }).click();
}
