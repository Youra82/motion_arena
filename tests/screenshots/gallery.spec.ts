import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Fotografiert jeden Bildschirm und Zustand der App für die README.
 * Demo-Abläufe nutzen synthetische Bewegung; Kamera-Aufnahmen die Chrome-Testkamera (keine Person).
 * Der Trainingsverlauf für „Fortschritt“ wird als Beispiel in den Browserspeicher gelegt (keine echten Trainings).
 */
const dir = "docs/screenshots";
const shot = (page: Page, name: string, fullPage = false) => page.screenshot({ path: `${dir}/${name}.png`, fullPage });
/** Toasts blenden 220 ms ein – kurz warten, damit sie voll sichtbar sind. */
const settle = (page: Page, ms = 350) => page.waitForTimeout(ms);
const view = (page: Page, name: string | RegExp) => page.locator(".modes").getByRole("button", { name }).click();

/** Beispielverlauf: 9 Trainings in den letzten 14 Tagen. */
async function seedHistory(ctx: BrowserContext) {
  await ctx.addInitScript(() => {
    if (localStorage.getItem("motion-arena.history.v1")) return;
    const now = Date.now();
    const days = [0, 1, 2, 4, 5, 7, 9, 10, 12];
    const entries = days.map((d, i) => ({
      id: `beispiel-${i}`,
      date: new Date(now - d * 86_400_000 - 3_600_000).toISOString(),
      exerciseId: "squat",
      reps: 8 + (i % 4) * 3,
      targetReps: 15,
      points: 700 + i * 90,
      averageScore: 72 + (i % 5) * 4,
      bestCombo: 4 + (i % 3),
      activeSeconds: 70 + i * 6,
      components: { depth: 0.86, control: 0.82, symmetry: 0.9 },
    }));
    localStorage.setItem("motion-arena.history.v1", JSON.stringify(entries.reverse()));
  });
}

test.describe("Startseite und Bereiche", () => {
  test("Start, Workouts, Fortschritt, Profil, Avatar & Raum", async ({ page, context }) => {
    await seedHistory(context);
    await page.goto("/");
    await page.getByRole("button", { name: "15", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Kniebeugen" })).toBeVisible();
    await page.waitForTimeout(400);
    await shot(page, "01-start");
    await shot(page, "02-start-ganze-seite", true);

    const nav = page.locator(".bottom-nav");
    await nav.getByRole("button", { name: "Training", exact: true }).click();
    await shot(page, "30-workouts", true);
    await nav.getByRole("button", { name: "Fortschritt", exact: true }).click();
    await shot(page, "31-fortschritt", true);
    await nav.getByRole("button", { name: "Profil", exact: true }).click();
    await shot(page, "32-profil", true);
    await page.getByRole("button", { name: "Auswählen" }).click();
    await page.getByRole("button", { name: /^Nova,/ }).click();
    await page.getByRole("button", { name: /^Mountain Arena,/ }).click();
    await page.waitForTimeout(900);
    await shot(page, "33-avatar-raum");
    await shot(page, "33b-avatar-raum-ganze-seite", true);
  });
});

test.describe("Demo-Ablauf", () => {
  test("Kalibrierung, Countdown, Ansichten, Feedback, Warnung, Pause, Ergebnis", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "15", exact: true }).click();
    await page.getByRole("button", { name: "Demo ohne Kamera ansehen" }).first().click();
    await expect(page.getByText("Kalibrierung")).toBeVisible();
    await page.waitForTimeout(900);
    await shot(page, "03-kalibrierung");

    await expect(page.locator(".countdown")).toBeVisible({ timeout: 10_000 });
    await shot(page, "04-countdown");

    // Erste gezählte Wiederholung mit Rückmeldung und leuchtendem Präzisionsring
    await expect(page.locator(".toast.good")).toBeVisible({ timeout: 20_000 });
    await settle(page);
    await shot(page, "05-wiederholung-gezaehlt");

    for (const [name, file] of [
      ["Bewegungsspur", "06-ansicht-bewegungsspur"],
      [/^Avatar/, "07-ansicht-avatar"],
      ["Skelett", "08-ansicht-skelett"],
      ["Gittermodell", "34-ansicht-gitter"],
      ["Hologramm", "35-ansicht-hologramm"],
      [/^Muskelansicht/, "36-ansicht-muskel"],
      [/^Bewegungszonen/, "37-ansicht-zonen"],
    ] as Array<[string | RegExp, string]>) {
      await view(page, name);
      await page.waitForTimeout(900);
      await shot(page, file);
    }
    await view(page, "Skelett");

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
    await page.getByRole("button", { name: "Demo ohne Kamera ansehen" }).first().click();
    await expect(page.locator(".toast", { hasText: "Ziel erreicht" })).toBeVisible({ timeout: 60_000 });
    await settle(page);
    await shot(page, "13-ziel-erreicht-live");
    await expect(page.getByRole("heading", { name: "Ziel erreicht" })).toBeVisible({ timeout: 10_000 });
    await shot(page, "14-ergebnis-ziel-erreicht", true);
  });

  test("Live-Körperanalyse", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Analyse-Demo/ }).first().click();
    await expect(page.locator(".analysis-movement")).toHaveText("Kniebeuge", { timeout: 15_000 });
    await page.waitForTimeout(1200);
    await shot(page, "38-analyse-kniebeuge");
    await expect(page.locator(".analysis-movement")).toHaveText("Einbeinstand", { timeout: 15_000 });
    await page.waitForTimeout(1200);
    await shot(page, "38b-analyse-einbeinstand");
  });

  test("Querformat (Tablet/TV-nah)", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto("/");
    await page.getByRole("button", { name: "Demo ohne Kamera ansehen" }).first().click();
    await expect(page.locator(".toast.good")).toBeVisible({ timeout: 25_000 });
    await settle(page);
    await shot(page, "15-querformat-training");
    await ctx.close();
  });
});

test.describe("TV-Modus (lokaler Kanal, ohne Netzwerk)", () => {
  test("Koppeln, Bestätigen, Zustimmung, Spiegelung, Ergebnis", async ({ browser }) => {
    const ctx = await browser.newContext({ deviceScaleFactor: 1 });
    const tv = await ctx.newPage();
    await tv.setViewportSize({ width: 1280, height: 720 });
    await tv.goto("/?tv&transport=local");
    await expect(tv.getByText("Bereit – warte auf das Handy …")).toBeVisible();
    await tv.waitForTimeout(400);
    await shot(tv, "39-tv-koppeln");
    const code = (await tv.locator(".tv-code").textContent())!.replace(/\s/g, "");

    const phone = await ctx.newPage();
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.goto("/?transport=local");
    await phone.getByLabel("Code vom Fernseher").fill(code);
    await phone.getByRole("button", { name: "Verbinden" }).click();
    await expect(tv.getByRole("button", { name: "Annehmen" })).toBeVisible();
    await shot(tv, "40-tv-bestaetigen");
    await tv.getByRole("button", { name: "Annehmen" }).click();
    await expect(phone.getByText("Auf dem Fernseher dasselbe Bild zeigen?")).toBeVisible();
    await phone.locator(".tv-consent").scrollIntoViewIfNeeded();
    await phone.screenshot({ path: `${dir}/41-tv-zustimmung-handy.png` });
    await phone.getByRole("button", { name: "Nein, nur Figur ohne Kamerabild" }).click();

    await phone.setViewportSize({ width: 844, height: 390 }); // Handy quer – füllt den Fernseher
    await phone.getByRole("button", { name: "Demo ohne Kamera ansehen" }).first().click();
    await expect(tv.locator(".tv-stage .hud-reps")).toContainText(/^[1-9]/, { timeout: 25_000 });
    await phone.locator(".modes").getByRole("button", { name: /^Avatar/ }).click();
    await tv.waitForTimeout(1500);
    await shot(tv, "42-tv-spiegelung");
    await phone.screenshot({ path: `${dir}/43-tv-handy-sendet.png` });
    await phone.getByRole("button", { name: "Training beenden" }).click();
    await expect(tv.getByRole("heading", { name: /Training beendet|Ziel erreicht/ })).toBeVisible();
    await shot(tv, "44-tv-ergebnis");
    await ctx.close();
  });
});

test.describe("Fehlerzustände", () => {
  test("Kamera verweigert", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "▶ Training starten" }).first().click();
    await expect(page.getByRole("alert")).toBeVisible({ timeout: 20_000 });
    await shot(page, "16-fehler-kamera-verweigert");
  });
});
