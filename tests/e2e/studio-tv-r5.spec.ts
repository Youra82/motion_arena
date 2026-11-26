import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ deviceScaleFactor: 3, serviceWorkers: "block" });

test.beforeEach(async ({ context }) => {
  await context.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort(),
  );
});

async function openStudio(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Avatar & Raum" }).click();
  await expect(page.getByRole("heading", { name: "Avatar & Raum" })).toBeFocused();
}

function rasterPasst(canvas: Locator) {
  return canvas.evaluate((c: HTMLCanvasElement) =>
    c.width === Math.round(c.clientWidth * 2) && c.height === Math.round(c.clientHeight * 2),
  );
}

test("Avatar und Raum sind per Tastatur wählbar und haben zugängliche Zustände", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openStudio(page);
  const category = page.getByRole("group", { name: "Kategorie" });
  const all = category.getByRole("button", { name: "Alle", pressed: true });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Demo als Avatar ansehen" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(all).toBeFocused();
  const balance = category.getByRole("button", { name: "Balance" });
  await balance.focus();
  await page.keyboard.press("Space");
  await expect(balance).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Avatar wählen" }).getByRole("button").filter({ hasText: "Aiko" })).toBeVisible();
  const aiko = page.getByRole("button", { name: /^Aiko,.*Intensität 2 von 5/ });
  await aiko.focus();
  await page.keyboard.press("Enter");
  await expect(aiko).toBeFocused();
  await expect(aiko).toHaveAttribute("aria-pressed", "true");
  const room = page.getByRole("button", { name: /^Neon Arena,/ });
  await room.focus();
  await page.keyboard.press("Space");
  await expect(room).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("img", { name: "Vorschau: Aiko im Raum Neon Arena" })).toBeVisible();
});

test("Thumbnails behalten nach Größenwechsel passende Pixelmaße", async ({ page }) => {
  // CODEX-BEFUND: Die Thumbnails werden nur bei Wechsel der Definition gerastert und beim Resize per CSS gestreckt.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openStudio(page);
  const portrait = page.locator(".studio-grid:not(.rooms) canvas").first();
  const room = page.locator(".studio-grid.rooms canvas").first();
  expect(await page.evaluate(() => devicePixelRatio)).toBe(3);
  for (const canvas of [portrait, room]) await expect.poll(() => rasterPasst(canvas)).toBe(true);
  const widths = await Promise.all([portrait, room].map((c) => c.evaluate((el) => el.clientWidth)));
  await page.setViewportSize({ width: 820, height: 600 });
  for (const [i, canvas] of [portrait, room].entries()) {
    await expect.poll(() => canvas.evaluate((el) => el.clientWidth)).not.toBe(widths[i]);
    await expect.soft.poll(() => rasterPasst(canvas), { timeout: 1500 }).toBe(true);
  }
});

test("Statische Vorschau zeichnet nach Größenwechsel erneut", async ({ page }) => {
  // CODEX-BEFUND: Bei reduzierter Bewegung bleibt das Bitmap der Vorschau nach Resize auf der alten Größe.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openStudio(page);
  const preview = page.getByRole("img", { name: /^Vorschau:/ });
  await expect.poll(() => rasterPasst(preview)).toBe(true);
  const width = await preview.evaluate((c) => c.clientWidth);
  await page.setViewportSize({ width: 820, height: 600 });
  await expect.poll(() => preview.evaluate((c) => c.clientWidth)).not.toBe(width);
  await expect.poll(() => rasterPasst(preview), { timeout: 1500 }).toBe(true);
});

async function sampleFrames(canvas: Locator) {
  return canvas.evaluate(async (c: HTMLCanvasElement) => {
    const frames = new Set<string>();
    for (let i = 0; i < 8; i++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      frames.add(c.toDataURL());
    }
    return frames.size;
  });
}

test("Vorschau bleibt bei bereits eingestellter Bewegungsreduktion stehen", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openStudio(page);
  const preview = page.getByRole("img", { name: /^Vorschau:/ });
  await expect.poll(() => rasterPasst(preview)).toBe(true);
  expect(await sampleFrames(preview)).toBe(1);
});

test("Vorschau übernimmt Bewegungsreduktion während sie geöffnet ist", async ({ page }) => {
  // CODEX-BEFUND: Preview liest die Media Query nur beim Start des Effekts.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openStudio(page);
  const preview = page.getByRole("img", { name: /^Vorschau:/ });
  await expect.poll(() => sampleFrames(preview)).toBeGreaterThan(1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => sampleFrames(preview), { timeout: 2000 }).toBe(1);
});

async function openTv(tv: Page) {
  await tv.setViewportSize({ width: 1280, height: 720 });
  await tv.goto("/?tv&transport=local");
  await expect(tv.getByText("Bereit – warte auf das Handy …")).toBeVisible();
}

test("Kurzcode braucht Bestätigung, Ablehnen gibt den TV für einen neuen Anlauf frei", async ({ context, page }) => {
  const tv = await context.newPage();
  await openTv(tv);
  const code = await tv.locator(".tv-code").innerText();
  const submit = async () => {
    await page.getByRole("textbox", { name: "Code vom Fernseher" }).fill(code);
    await page.getByRole("button", { name: "Verbinden" }).click();
    await expect(page.getByText(/Bitte am Fernseher auf/)).toBeVisible();
  };
  await page.goto("/?transport=local");
  await submit();
  const dialog = tv.getByRole("alertdialog", { name: "Ein Handy möchte sich verbinden" });
  const accept = dialog.getByRole("button", { name: "Annehmen" });
  await expect(accept).toBeFocused();
  await expect(page.getByText("Mit dem Fernseher verbunden")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Ablehnen" }).click();
  await expect(page.getByText("Am Fernseher abgelehnt.")).toBeVisible();
  await expect(tv.getByText("Bereit – warte auf das Handy …")).toBeVisible();
  await page.getByRole("button", { name: "Trennen" }).click();
  await submit();
  await accept.press("Enter");
  await expect(page.getByText("Mit dem Fernseher verbunden")).toBeVisible();
  await expect(tv.getByRole("main", { name: "Fernseher – Anzeige des Handys" })).toBeFocused();
});

function colors(canvas: Locator) {
  return canvas.evaluate((c: HTMLCanvasElement) => {
    const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let neon = 0;
    let lime = 0;
    for (let i = 0; i < data.length; i += 28) {
      const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
      if (r > 150 && g < 90 && b > 120) neon++;
      if (r > 120 && g > r + 22 && b < 120) lime++;
    }
    return [neon, lime];
  });
}

test("Gewählter Neon-Raum und Zara sind ohne Video auf Handy und TV gerendert", async ({ context, page }) => {
  const tv = await context.newPage();
  await openTv(tv);
  const qr = tv.getByAltText("QR-Code zum Koppeln");
  await expect(qr).toHaveAttribute("data-pair-url", /[?&]k=[A-Z2-9]{24}/);
  await page.goto((await qr.getAttribute("data-pair-url"))!);
  await expect(page.getByText("Mit dem Fernseher verbunden")).toBeVisible();
  await page.getByRole("button", { name: "Nein, nur Figur ohne Kamerabild" }).click();
  await page.getByRole("button", { name: "Avatar & Raum" }).click();
  await page.getByRole("button", { name: /^Zara,/ }).click();
  await page.getByRole("button", { name: /^Neon Arena,/ }).click();
  await page.getByRole("button", { name: "Demo als Avatar ansehen" }).click();
  await expect(tv.locator(".tv-stage video")).toBeHidden();
  for (const canvas of [page.locator(".live canvas"), tv.locator(".tv-stage canvas")]) {
    await expect(canvas).toBeVisible();
    await expect.poll(async () => (await colors(canvas)).every((count) => count > 30)).toBe(true);
  }
});

test("Nach fehlgeschlagenem Widerruf und Neuladen gilt das Bild als nicht freigegeben", async ({ context, page }) => {
  // CODEX-BEFUND: Der Widerruf lebt nur im Modulzustand. Nach einem echten Neuladen gilt erneut die alte Freigabe.
  const tv = await context.newPage();
  await openTv(tv);
  const qr = tv.getByAltText("QR-Code zum Koppeln");
  await expect(qr).toHaveAttribute("data-pair-url", /[?&]k=/);
  const pairUrl = (await qr.getAttribute("data-pair-url"))!;
  await page.goto(pairUrl);
  await page.getByRole("button", { name: "Ja, Bild 1:1 spiegeln" }).click();
  await expect(page.getByRole("button", { name: "Kamerabild nicht senden" })).toBeVisible();
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "motion-arena.settings.v1") throw new DOMException("Speicher voll", "QuotaExceededError");
      setItem.call(this, key, value);
    };
  });
  await page.getByRole("button", { name: "Kamerabild nicht senden" }).click();
  await expect(page.getByText("Nur Figur, ohne Kamerabild")).toBeVisible();
  await page.getByRole("button", { name: "Trennen" }).click();
  await expect(tv.getByText("Bereit – warte auf das Handy …")).toBeVisible();
  await page.goto(pairUrl);
  await expect(page.getByText("Mit dem Fernseher verbunden")).toBeVisible();
  await expect(page.getByRole("button", { name: "Kamerabild nicht senden" })).toHaveCount(0);
});
