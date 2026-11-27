import { expect, test } from "@playwright/test";

test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader"] } });

test("Konzept-Katalog und gewählter Raum sind mit dem Live-Renderer verbunden", async ({ page }) => {
  await page.goto("/");
  const asset = page.waitForResponse((response) => response.url().endsWith("/concepts/rooms/07.webp"));
  await page.getByRole("button", { name: "Avatar & Raum" }).click();
  await expect(page.locator(".studio-grid.rooms .studio-card")).toHaveCount(20);
  await expect(page.locator(".studio-grid:not(.rooms) .studio-card")).toHaveCount(15);
  const liveArt = page.waitForResponse((response) => response.url().endsWith("/concepts/live/07.webp"));
  await page.getByRole("button", { name: /^Ice Lab,/ }).click();
  await page.getByRole("button", { name: "Demo als Avatar ansehen" }).click();
  const canvas = page.getByLabel("Live-Ansicht mit Körpererkennung");
  await expect(canvas).toHaveAttribute("data-live-visual", "avatar", { timeout: 25_000 });
  await expect(canvas).toHaveAttribute("data-studio-room", "ice-lab");
  await expect(canvas).toHaveAttribute("data-studio-artwork", "ice-lab");
  expect((await asset).ok()).toBe(true);
  expect((await liveArt).ok()).toBe(true);
});

test("Muskelansicht und Bewegungszonen rendern dieselbe laufende 3D-Pose", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/");
  await page.getByRole("button", { name: "Körperanalyse" }).click();
  await page.getByRole("button", { name: "Analyse-Demo ohne Kamera" }).click();
  const canvas = page.getByLabel("Live-Ansicht mit Körpererkennung");
  await expect(canvas).toHaveAttribute("data-live-visual", "muskel", { timeout: 25_000 });
  await expect(page.getByText("Einbeinstand", { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Bewegungszonen", exact: true }).click();
  await expect(canvas).toHaveAttribute("data-live-visual", "zonen");
  await expect(page.getByText("Hampelmann", { exact: true })).toBeVisible({ timeout: 18_000 });
  expect(errors).toEqual([]);
});
