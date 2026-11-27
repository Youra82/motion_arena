import { expect, test } from "@playwright/test";
import { openTvPanel } from "./stage-colors";

/**
 * TV-Modus mit lokalem Kanal (BroadcastChannel, ohne Netzwerk): zwei Seiten im selben Browser.
 * Prüft, dass der Fernseher dieselbe Anzeige wie das Handy zeigt.
 */
test("TV zeigt dasselbe wie das Handy: koppeln, Zustimmung, Training, Ergebnis", async ({ context }) => {
  const tv = await context.newPage();
  await tv.setViewportSize({ width: 1280, height: 720 });
  await tv.goto("/?tv&transport=local");
  await expect(tv.getByRole("heading", { name: "Mit dem Handy koppeln" })).toBeVisible();
  await expect(tv.getByAltText("QR-Code zum Koppeln")).toBeVisible();
  const code = (await tv.locator(".tv-code").textContent())!.replace(/\s/g, "");
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  const qrLink = (await tv.getByAltText("QR-Code zum Koppeln").getAttribute("data-pair-url"))!;
  expect(qrLink).toMatch(new RegExp(`pair=${code}&k=[A-Z2-9]{24}`));
  await tv.screenshot({ path: "tests/e2e/.results/screens/13-tv-koppeln.png" });

  // Handy scannt den QR-Code (Code + Schlüssel) → sofort gekoppelt
  const phone = await context.newPage();
  await phone.goto(qrLink);
  await expect(phone.getByText("Mit dem Fernseher verbunden")).toBeVisible({ timeout: 10_000 });
  await expect(phone).not.toHaveURL(/pair=|k=/); // Code und Schlüssel werden aus der Adresse entfernt
  await expect(tv.getByText("Handy verbunden")).toBeVisible();

  // Einmalige Zustimmung zum Kamerabild
  await phone.getByRole("button", { name: "Ja, Bild 1:1 spiegeln" }).click();
  await expect(phone.getByText(/Bild freigegeben – wird gesendet, sobald ein Training läuft/)).toBeVisible();

  // Training (Demo) am Handy → TV zeigt dieselbe Live-Anzeige
  await phone.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("button", { name: "Übungen" }).click();
  await phone.getByRole("button", { name: "Demo ohne Kamera ansehen" }).first().click();
  const phoneReps = phone.locator(".hud-reps");
  const tvReps = tv.locator(".tv-stage .hud-reps");
  await expect(phoneReps).toContainText(/^1/, { timeout: 20_000 });
  await expect(tvReps).toContainText(/^1/, { timeout: 5_000 });
  await expect(tv.locator(".tv-stage .hud-points")).toHaveText((await phone.locator(".hud-points").textContent())!, { timeout: 3_000 });
  await expect(tv.locator(".tv-stage .arena-feedback")).toBeVisible();
  await expect(tv.locator(".tv-stage .chip-demo")).toBeVisible();
  await tv.screenshot({ path: "tests/e2e/.results/screens/14-tv-spiegelung.png" });

  // Seitenverhältnis wie am Handy
  const stage = (await tv.locator(".tv-stage").boundingBox())!;
  const vp = phone.viewportSize()!;
  expect(Math.abs(stage.width / stage.height - vp.width / vp.height)).toBeLessThan(0.02);

  // Ende am Handy → Ergebnis auf dem TV
  await phone.getByRole("button", { name: "Training beenden" }).click();
  await expect(tv.getByRole("heading", { name: /Training beendet|Ziel erreicht/ })).toBeVisible({ timeout: 5_000 });

  // Trennen am Handy → TV wartet wieder auf ein Handy
  await phone.getByRole("button", { name: "Zur Startseite" }).click();
  await phone.getByRole("button", { name: "Trennen" }).click();
  await expect(tv.getByRole("heading", { name: "Mit dem Handy koppeln" })).toBeVisible({ timeout: 5_000 });
});

test("Code von Hand: erst nach Annehmen am Fernseher verbunden; Ablehnen und zweites Handy werden abgewiesen", async ({ context }) => {
  const tv = await context.newPage();
  await tv.setViewportSize({ width: 1280, height: 720 });
  await tv.goto("/?tv&transport=local");
  const code = (await tv.locator(".tv-code").textContent())!.replace(/\s/g, "");

  // 1. Code eingetippt → TV fragt nach, Handy wartet
  const phone = await context.newPage();
  await phone.goto("/?transport=local");
  await openTvPanel(phone);
  await phone.getByLabel("Code vom Fernseher").fill(code.toLowerCase());
  await phone.getByRole("button", { name: "Verbinden" }).click();
  await expect(phone.getByText(/am Fernseher auf „Annehmen“ drücken/)).toBeVisible();
  await expect(tv.getByRole("alertdialog", { name: "Ein Handy möchte sich verbinden" })).toBeVisible();
  await expect(tv.getByRole("button", { name: "Annehmen" })).toBeFocused(); // per Fernbedienung direkt bestätigbar

  // 2. Ablehnen → Handy erfährt es
  await tv.getByRole("button", { name: "Ablehnen" }).click();
  await expect(phone.getByText("Am Fernseher abgelehnt.")).toBeVisible();

  // 3. Erneut versuchen und annehmen → verbunden
  await phone.getByRole("button", { name: "Trennen" }).click();
  await openTvPanel(phone);
  await phone.getByLabel("Code vom Fernseher").fill(code);
  await phone.getByRole("button", { name: "Verbinden" }).click();
  await tv.getByRole("button", { name: "Annehmen" }).click();
  await expect(phone.getByText("Mit dem Fernseher verbunden")).toBeVisible();
  await expect(tv.getByText("Handy verbunden")).toBeVisible();

  // 4. Zweites Handy mit demselben Code wird abgewiesen, die Sitzung bleibt bestehen
  const second = await context.newPage();
  await second.goto(`/?pair=${code}&transport=local`);
  await expect(second.getByText("Der Fernseher ist schon mit einem anderen Handy verbunden.")).toBeVisible();
  await expect(tv.getByText("Handy verbunden")).toBeVisible();
  await expect(phone.getByText("Mit dem Fernseher verbunden")).toBeVisible();
});

test("ungültiger Code wird abgelehnt", async ({ page }) => {
  await page.goto("/?transport=local");
  await openTvPanel(page);
  await page.getByLabel("Code vom Fernseher").fill("AB1");
  await page.getByRole("button", { name: "Verbinden" }).click();
  await expect(page.getByText("Ungültiger Code")).toBeVisible();
});
