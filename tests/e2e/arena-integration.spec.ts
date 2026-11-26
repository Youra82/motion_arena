import { expect, test } from "@playwright/test";

test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader"] } });

test("Arena lädt lokal bei Bedarf, rendert in 3D und zählt im Demo-Training", async ({ page }) => {
  const errors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => requests.push(request.url()));

  await page.goto("/");
  const root = new URL(page.url()).origin;
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  const cachedFiles = () => page.evaluate(async () => {
    const cache = await caches.open((await caches.keys()).find((key) => key.startsWith("motion-arena-"))!);
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect((await cachedFiles()).some((url) => url.startsWith("/arena/"))).toBe(false);
  expect(requests.some((url) => /arena-three-|trainer\.glb/.test(url))).toBe(false);

  await page.getByRole("button", { name: "Demo ohne Kamera ansehen" }).click();
  await expect(page.locator(".modes").getByRole("button", { name: "Arena", exact: true })).toHaveAttribute("aria-pressed", "true");
  const canvas = page.getByLabel("Live-Ansicht mit Körpererkennung");
  await expect(canvas).toHaveAttribute("data-arena-renderer", "3d", { timeout: 30_000 });
  await expect(page.locator(".hud-reps")).toContainText(/^[1-9]/, { timeout: 25_000 });
  await expect(page.getByText("kcal geschätzt")).toBeVisible();
  await expect(page.locator(".arena-checks .good").first()).toBeVisible();
  await expect(page.locator(".arena-timer progress")).toBeVisible();
  await expect(page.getByText(/\bbpm\b/)).toHaveCount(0);
  await expect.poll(cachedFiles).toContain("/arena/trainer.glb");

  await page.getByRole("button", { name: /^Arena:/ }).click();
  await page.getByRole("dialog", { name: "Arena wählen" }).getByRole("button", { name: /Lebombo/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(canvas).toHaveAttribute("data-arena", "lebombo");
  await expect(canvas).toHaveAttribute("data-arena-renderer", "3d");
  await expect.poll(cachedFiles).toContain("/arena/lebombo.hdr");
  expect(requests.filter((url) => !url.startsWith(`${root}/`) && !/^(blob|data):/.test(url))).toEqual([]);
  expect(errors).toEqual([]);
});

test("TV rendert die Arena und dasselbe HUD ohne Bildfreigabe", async ({ context }) => {
  const tv = await context.newPage();
  await tv.setViewportSize({ width: 1050, height: 610 });
  await tv.goto("/?tv&transport=local");
  const qr = tv.getByAltText("QR-Code zum Koppeln");
  await expect(qr).toBeVisible();
  const phone = await context.newPage();
  await phone.goto((await qr.getAttribute("data-pair-url"))!);
  await phone.getByRole("button", { name: "Nein, nur Figur ohne Kamerabild" }).click();
  await phone.getByRole("button", { name: "Demo ohne Kamera ansehen" }).click();
  const stage = tv.locator(".tv-stage");
  await expect(stage.locator("canvas.tv-video")).toHaveAttribute("data-arena-renderer", "3d", { timeout: 30_000 });
  await expect(stage.getByText(/Darstellung aus Gelenkpunkten/)).toBeVisible();
  await expect(stage.locator("video")).toBeHidden();
  await expect(stage.locator(".hud-reps")).toContainText(/^[1-9]/, { timeout: 30_000 });
  await expect(stage.locator(".arena-timer")).toBeVisible();
});
