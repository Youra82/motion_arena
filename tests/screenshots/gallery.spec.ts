import { expect, test, type Page } from "@playwright/test";

/**
 * Fotografiert jeden Bildschirm und Zustand der App für die README.
 * Demo-Abläufe nutzen synthetische Bewegung; Kamera-Aufnahmen die Chrome-Testkamera (keine Person).
 */
const dir = "docs/screenshots";
const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: `${dir}/${name}.png`, fullPage });
/** Toasts blenden 220 ms ein – kurz warten, damit sie voll sichtbar sind. */
const settle = (page: Page, ms = 350) => page.waitForTimeout(ms);

test.describe("Demo-Ablauf", () => {
  test("Start, Kalibrierung, Countdown, Ansichten, Feedback, Warnung, Pause, Ergebnis", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "15" }).click();
    await expect(page.getByRole("heading", { name: "Kniebeugen" })).toBeVisible();
    await shot(page, "01-start");
    await shot(page, "02-start-ganze-seite", true);

    await page.getByRole("button", { name: "Demo ohne Kamera ansehen" }).click();
    await expect(page.getByText("Kalibrierung")).toBeVisible();
    await page.waitForTimeout(900);
    await shot(page, "03-kalibrierung");

    await expect(page.locator(".countdown")).toBeVisible({ timeout: 10_000 });
    await shot(page, "04-countdown");

    // Erste gezählte Wiederholung mit Rückmeldung und leuchtendem Präzisionsring
    await expect(page.locator(".toast.good")).toBeVisible({ timeout: 20_000 });
    await settle(page);
    await shot(page, "05-wiederholung-gezaehlt");

    await page.getByRole("button", { name: "Bewegungsspur" }).click();
    await page.waitForTimeout(700);
    await shot(page, "06-ansicht-bewegungsspur");
    await page.getByRole("button", { name: "Avatar (Platzhalter)" }).click();
    await page.waitForTimeout(700);
    await shot(page, "07-ansicht-avatar-platzhalter");
    await page.getByRole("button", { name: "Skelett" }).click();
    await page.waitForTimeout(700);
    await shot(page, "08-ansicht-skelett");

    // Die Demo macht jede 5. Kniebeuge absichtlich zu flach
    await expect(page.locator(".toast", { hasText: "Zu flach" })).toBeVisible({ timeout: 30_000 });
    await settle(page);
    await shot(page, "09-feedback-zu-flach");

    // Nach ca. 25 s verschwindet die Demo-Person kurz → Warnung statt Wertung
    await expect(page.locator(".banner")).toBeVisible({ timeout: 30_000 });
    await settle(page);
    await shot(page, "10-warnung-keine-person");

    await page.getByRole("button", { name: "❚❚ Pause" }).click();
    await expect(page.getByRole("heading", { name: "Pausiert" })).toBeVisible();
    await shot(page, "11-pause");
    await page.getByRole("button", { name: "Training beenden" }).last().click();
    await expect(page.getByRole("heading", { name: "Training beendet" })).toBeVisible();
    await shot(page, "12-ergebnis", true);
  });

  test("Ziel erreicht", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "5", exact: true }).click();
    await page.getByRole("button", { name: "Demo ohne Kamera ansehen" }).click();
    await expect(page.locator(".toast", { hasText: "Ziel erreicht" })).toBeVisible({ timeout: 60_000 });
    await settle(page);
    await shot(page, "13-ziel-erreicht-live");
    await expect(page.getByRole("heading", { name: "Ziel erreicht" })).toBeVisible({ timeout: 10_000 });
    await shot(page, "14-ergebnis-ziel-erreicht", true);
  });

  test("Querformat (Tablet/TV-nah)", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: "Demo ohne Kamera ansehen" }).click();
    await expect(page.locator(".toast.good")).toBeVisible({ timeout: 25_000 });
    await settle(page);
    await shot(page, "15-querformat-training");
    await ctx.close();
  });
});

test.describe("Fehlerzustände", () => {
  test("Kamera verweigert", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "▶ Training starten" }).click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 20_000 });
    await shot(page, "16-fehler-kamera-verweigert");
  });
});
