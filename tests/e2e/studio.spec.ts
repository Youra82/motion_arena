import { expect, test } from "@playwright/test";

/** Block D: Avatar & Trainingsraum wählen, gespeichert, im Training sichtbar. */
test("Avatar und Raum wählen, nach Neuladen erhalten, Demo zeigt den Avatar im Raum", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await page.getByRole("button", { name: "Avatar & Raum" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Avatar & Raum" })).toBeFocused();

  // 15 Avatare, 20 Räume
  await expect(page.locator(".studio-grid:not(.rooms) .studio-card")).toHaveCount(15);
  await expect(page.locator(".studio-grid.rooms .studio-card")).toHaveCount(20);

  // Kategorie-Filter
  await page.getByRole("button", { name: "Kämpferisch" }).click();
  await expect(page.locator(".studio-grid:not(.rooms) .studio-card")).toHaveCount(3);
  await page.getByRole("button", { name: "Alle", exact: true }).click();

  await page.getByRole("button", { name: /^Zara,/ }).click();
  await page.getByRole("button", { name: /^Neon Arena,/ }).click();
  await expect(page.getByRole("button", { name: /^Zara,/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("img", { name: "Vorschau: Zara im Raum Neon Arena" })).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({ path: "tests/e2e/.results/screens/15-avatar-raum.png", fullPage: true });

  await page.reload();
  await page.getByRole("button", { name: "Avatar & Raum" }).click();
  await expect(page.getByRole("button", { name: /^Neon Arena,/ })).toHaveAttribute("aria-pressed", "true");

  // Demo als Avatar: Live-Ansicht "Avatar" aktiv, Bild zeigt Raumfarben (Neon-Magenta) und die Figur
  await page.getByRole("button", { name: "Demo als Avatar ansehen" }).click();
  await expect(page.locator(".modes").getByRole("button", { name: /Avatar/ })).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(2500);
  const stats = await page.locator(".live canvas").evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let magenta = 0;
    let skin = 0;
    for (let i = 0; i < d.length; i += 4 * 7) {
      const [r, g, b] = [d[i]!, d[i + 1]!, d[i + 2]!];
      if (r > 150 && b > 120 && g < 90) magenta++;
      if (r > 90 && r > g && g > b && r - b > 40 && r < 200) skin++;
    }
    return { magenta, skin };
  });
  expect(stats.magenta).toBeGreaterThan(50); // Neonleisten des Raums
  expect(stats.skin).toBeGreaterThan(50); // Hauttöne des Avatars
  await page.screenshot({ path: "tests/e2e/.results/screens/16-avatar-live.png" });

  // Standard-Ansicht fürs Kameratraining bleibt unverändert (Avatar galt nur für diese Demo)
  await page.getByRole("button", { name: "Training beenden" }).click();
  await page.getByRole("button", { name: "Zur Startseite" }).click();
  await page.getByRole("button", { name: "Profil" }).click();
  await expect(page.getByRole("button", { name: "Hybrid" })).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});
