import { expect, test } from "@playwright/test";

const shots = "tests/e2e/.results/screens";

test("Demo: Kalibrierung → Training → Ansichtswechsel ohne Datenverlust → Ergebnis", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kniebeugen" })).toBeVisible();
  await page.screenshot({ path: `${shots}/01-start.png` });

  await page.getByRole("button", { name: "Demo ohne Kamera ansehen" }).click();
  await expect(page.getByText("DEMO", { exact: true })).toBeVisible();
  await expect(page.getByText("Kalibrierung")).toBeVisible();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${shots}/02-kalibrierung.png` });

  // Nach Kalibrierung + Countdown erscheint das Trainings-HUD.
  await expect(page.getByText("Wiederholungen", { exact: true })).toBeVisible({ timeout: 15_000 });
  const reps = page.locator(".hud-reps");
  await expect(reps).toContainText(/^2/, { timeout: 20_000 });
  await page.screenshot({ path: `${shots}/03-training-skelett.png` });

  // Ansichtswechsel: Zähler und Punkte bleiben erhalten.
  const before = await page.locator(".hud-points").textContent();
  const repsBefore = await reps.textContent();
  for (const mode of ["Bewegungsspur", "Avatar (Platzhalter)", "Skelett"]) {
    await page.getByRole("button", { name: mode }).click();
    await page.waitForTimeout(400);
    if (mode !== "Skelett") await page.screenshot({ path: `${shots}/04-ansicht-${mode.split(" ")[0]}.png` });
  }
  const repsAfter = Number((await reps.textContent())!.split("/")[0]);
  expect(repsAfter).toBeGreaterThanOrEqual(Number(repsBefore!.split("/")[0]));
  const ptsAfter = Number((await page.locator(".hud-points").textContent())!.split(" ")[0]);
  expect(ptsAfter).toBeGreaterThanOrEqual(Number(before!.split(" ")[0]));

  // Pause / Fortsetzen
  await page.getByRole("button", { name: "❚❚ Pause" }).click();
  await expect(page.getByRole("heading", { name: "Pausiert" })).toBeVisible();
  await page.screenshot({ path: `${shots}/05-pause.png` });
  await page.getByRole("button", { name: "Fortsetzen" }).click();

  await page.getByRole("button", { name: "Training beenden" }).click();
  await expect(page.getByRole("heading", { name: /Training beendet|Ziel erreicht/ })).toBeVisible();
  await page.screenshot({ path: `${shots}/06-ergebnis.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("Kamera verweigert → verständlicher Fehlerzustand mit Ausweg", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "▶ Training starten" }).click();
  await expect(page.getByRole("alert")).toBeVisible({ timeout: 20_000 });
  await page.screenshot({ path: `${shots}/08-kamera-fehler.png` });
  await expect(page.getByRole("button", { name: "Demo ohne Kamera" })).toBeVisible();
});

test("PWA: Manifest und Icons sind eingebunden und erreichbar", async ({ page, request }) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");
  const res = await request.get(href!);
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ name: "Motion Arena", display: "standalone", start_url: "./" });
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  for (const icon of manifest.icons as Array<{ src: string }>) {
    const r = await request.get(`/${icon.src}`);
    expect(r.ok(), icon.src).toBe(true);
    expect(r.headers()["content-type"]).toContain("image/png");
  }
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect((await request.get(apple!)).ok()).toBe(true);
});
