import { expect, test } from "@playwright/test";

const shots = "tests/e2e/.results/screens";

test.use({
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  permissions: ["camera"],
});

test("Kamera: Modell lokal, 'Keine Person' ohne Wertung, Silhouette, Beenden – keine Anfrage verlässt das Gerät", async ({
  page,
}) => {
  const errors: string[] = [];
  const external: string[] = [];
  const cspBlocked: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!["localhost", "127.0.0.1"].includes(u.hostname) && !["data:", "blob:"].includes(u.protocol)) external.push(r.url());
  });
  page.on("console", (m) => {
    if (/Content Security Policy/i.test(m.text())) cspBlocked.push(m.text());
  });

  await page.goto("/");
  await page.getByRole("button", { name: "▶ Training starten" }).click();
  await expect(page.getByText("Keine Person")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText(/Stell dich vor die Kamera/)).toBeVisible();
  await page.waitForTimeout(1500);
  const fps = Number((await page.getByText(/fps$/).textContent())!.split(" ")[0]);
  await page.screenshot({ path: `${shots}/07-kamera-keine-person.png` });
  console.log(`Testkamera: ${fps} fps (headless, nicht repräsentativ für Handys)`);
  expect(fps).toBeGreaterThan(0);

  // Silhouette: Maske per setOptions zu- und wieder abschalten, Erkennung läuft weiter.
  await page.getByRole("button", { name: "Silhouette" }).click();
  await page.getByRole("button", { name: "Hybrid" }).click();
  await page.getByRole("button", { name: "Silhouette" }).click();
  await page.waitForTimeout(1500);
  await expect(page.getByText("Keine Person")).toBeVisible();
  await page.screenshot({ path: `${shots}/08-kamera-silhouette.png` });

  // Beenden schließt MediaPipe – dabei versucht das SDK Telemetrie zu senden.
  await page.getByRole("button", { name: "Training beenden" }).click();
  await expect(page.getByRole("heading", { name: /Training beendet/ })).toBeVisible();
  await page.waitForTimeout(1500);

  for (const m of cspBlocked) console.log(`Von CSP blockiert: ${m.slice(0, 200)}`);
  // Blockiert werden darf nur die MediaPipe-Telemetrie – nichts, was die App selbst braucht.
  for (const m of cspBlocked) expect(m).toMatch(/odml\.pa\.googleapis\.com/);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});

test("Laden abbrechen führt zurück zum Start", async ({ page }) => {
  await page.route("**/models/*.task", async (route) => {
    await new Promise((r) => setTimeout(r, 4000));
    await route.continue().catch(() => {});
  });
  await page.goto("/");
  await page.getByRole("button", { name: "▶ Training starten" }).click();
  await expect(page.getByText("Körpererkennung wird geladen")).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.getByRole("heading", { name: "Kniebeugen" })).toBeVisible();
});
