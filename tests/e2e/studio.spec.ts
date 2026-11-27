import { expect, test } from "@playwright/test";
import { stageColors } from "./stage-colors";

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
  const stats = await stageColors(page, page.locator(".live"));
  expect(stats.magenta).toBeGreaterThan(50); // Neonleisten des Raums
  expect(stats.skin).toBeGreaterThan(50); // Hauttöne des Avatars
  await page.screenshot({ path: "tests/e2e/.results/screens/16-avatar-live.png" });

  // Standard-Ansicht fürs Kameratraining bleibt unverändert: Echtbild (Avatar galt nur für diese Demo)
  await page.getByRole("button", { name: "Training beenden" }).click();
  await page.getByRole("button", { name: "Zur Startseite" }).click();
  await page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("button", { name: "Profil" }).click();
  await expect(page.getByRole("button", { name: "Echtbild", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});
