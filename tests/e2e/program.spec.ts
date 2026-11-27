import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

const programme = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("button", { name: "Programme" }).click();

test("Startseite zeigt nur das Training – Programme haben einen eigenen Menüpunkt", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Kniebeugen", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: /Programm erstellen|Für mich planen|Selbst bauen/ })).toHaveCount(0);
  await programme(page);
  await expect(page.getByRole("button", { name: /Für mich planen/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Selbst bauen/ })).toBeVisible();
});

test("Planer: sechs Fragen → Programm mit Begründung → Startseite zeigt die nächste Einheit", async ({ page }) => {
  await programme(page);
  await page.getByRole("button", { name: /Für mich planen/ }).click();
  await expect(page.getByRole("heading", { name: "Was willst du erreichen?" })).toBeVisible();
  await page.getByRole("button", { name: /Kraft & Muskeln/ }).click();
  await page.getByRole("button", { name: /Neu dabei/ }).click();
  await page.getByRole("button", { name: /^3 Tage/ }).click();
  await page.getByRole("button", { name: /^20 Minuten/ }).click();
  await expect(page.getByRole("button", { name: "Weiter" })).toBeDisabled();
  await page.getByRole("button", { name: /Beine & Po/ }).click();
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.getByRole("button", { name: /^Knie/ }).click();
  await expect(page.getByText(/stellt dein Programm zusammen/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kraft-Aufbau" })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText("18 Einheiten")).toBeVisible();
  await expect(page.getByText(/Wegen Knie/)).toBeVisible();
  // Bei Knieproblemen keine Kniebeugen im Plan
  await expect(page.locator(".nx-session-box").getByText("Kniebeugen", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Programm starten" }).click();
  await expect(page.getByRole("heading", { name: "Kraft-Aufbau", level: 1 })).toBeVisible();

  await page.reload(); // Programm bleibt gespeichert
  await expect(page.getByText(/Kraft-Aufbau · Woche 1 · Tag 1/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Beine & Po", level: 1 })).toBeVisible();
});

test("Programm-Einheit durchklicken zählt eine Einheit", async ({ page }) => {
  await programme(page);
  await page.getByRole("button", { name: /^Rücken entlasten/ }).click();
  await expect(page.getByRole("heading", { name: "Rücken entlasten", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Starten", exact: true }).click();
  for (let i = 0; i < 40; i++) {
    if (await page.getByRole("heading", { name: "Geschafft!" }).isVisible()) break;
    await page.getByRole("button", { name: /Satz erledigt|Ohne Kamera abhaken/ }).first().click();
  }
  await expect(page.getByRole("heading", { name: "Geschafft!" })).toBeVisible();
  await expect(page.getByText(/Einheit 1 von 24 erledigt/)).toBeVisible();
  await page.getByRole("button", { name: "Fertig" }).click();
  await expect(page.getByText(/Woche 1 · Tag 2/)).toBeVisible();
});

test("Baukasten rechnet Dauer mit und startet das eigene Training", async ({ page }) => {
  await programme(page);
  await page.getByRole("button", { name: /Selbst bauen/ }).click();
  const minutes = page.locator(".nx-stats b").first();
  const before = Number(await minutes.textContent());
  await page.getByRole("button", { name: /Seitheben/ }).click();
  await expect(page.getByRole("button", { name: "Seitheben entfernen" })).toBeVisible();
  expect(Number(await minutes.textContent())).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Jetzt trainieren" }).click();
  await expect(page.getByText("Übung 1 von 4")).toBeVisible();
  await expect(page.getByRole("button", { name: /Mit Kamera zählen/ })).toBeVisible();
});
