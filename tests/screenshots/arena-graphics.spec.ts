import { expect, test } from "@playwright/test";

test.use({
  viewport: { width: 1419, height: 789 },
  deviceScaleFactor: 1,
  launchOptions: { args: ["--enable-unsafe-swiftshader"] },
});

test("45 – Arena im Core Studio während einer Kniebeuge", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "5", exact: true }).click();
  await page.getByRole("button", { name: "Demo ohne Kamera ansehen" }).click();
  await expect(page.locator(".hud-reps")).toHaveText(/^3\s*\/\s*5$/, { timeout: 40_000 });
  await page.waitForFunction(() =>
    document.querySelector('canvas[data-arena-renderer="3d"][data-arena-pose="deep"]') &&
    document.querySelector(".arena-feedback"), undefined, { timeout: 25_000 });
  await page.screenshot({ path: "docs/screenshots/45-arena.png" });
});

test("46 – 3D-Körperanalyse im Core Studio", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Analyse-Demo ohne Kamera" }).click();
  const canvas = page.getByLabel("Live-Ansicht mit Körpererkennung");
  await expect(canvas).toHaveAttribute("data-studio-artwork", "core-studio", { timeout: 25_000 });
  await expect(page.getByText("Ausfallschritt", { exact: true })).toBeVisible({ timeout: 22_000 });
  await page.waitForTimeout(240);
  await page.screenshot({ path: "docs/screenshots/46-koerperanalyse-3d.png" });
});

test("50 – Lukas bei HDR-Studiolicht in der Live-Avatar-Ansicht", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await page.getByRole("button", { name: "Avatar & Raum", exact: true }).click();
  await page.getByRole("button", { name: /^Lukas,/ }).click();
  await page.getByRole("button", { name: "Demo als Avatar ansehen" }).click();
  const canvas = page.getByLabel("Live-Ansicht mit Körpererkennung");
  await expect(canvas).toHaveAttribute("data-live-visual", "avatar", { timeout: 25_000 });
  await expect(canvas).toHaveAttribute("data-studio-artwork", "core-studio");
  await expect(canvas).toHaveAttribute("data-arena-light", "core-hdr");
  await expect(page.locator(".hud-reps")).toContainText(/^[1-9]/, { timeout: 25_000 });
  await expect(canvas).toHaveAttribute("data-arena-pose", "deep", { timeout: 12_000 });
  await page.screenshot({ path: "docs/screenshots/50-lukas-studiolicht.png", clip: { x: 475, y: 175, width: 470, height: 540 } });
  expect(errors).toEqual([]);
});
