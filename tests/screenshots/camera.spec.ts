import { expect, test } from "@playwright/test";

/** Kamera-Ansichten mit der Chrome-Testkamera (bewegtes Testbild, keine Person). */
const dir = "docs/screenshots";

test.use({
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  permissions: ["camera"],
  // Service Worker aus: sonst kommt das Modell aus dem Offline-Speicher und die Ladeanzeige ist nie zu sehen
  serviceWorkers: "block",
});

test("Laden und Kamera-Ansichten", async ({ page }) => {
  // Modell-Download künstlich verzögern, um die Ladeanzeige zu zeigen.
  await page.route("**/models/*.task", async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue().catch(() => {});
  });
  await page.goto("/");
  await page.getByRole("button", { name: "▶ Training starten" }).click();
  await expect(page.getByText("Körpererkennung wird geladen")).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: `${dir}/17-laden-koerpererkennung.png` });

  await expect(page.getByText("Keine Person")).toBeVisible({ timeout: 45_000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${dir}/18-kamera-hybrid-keine-person.png` });

  await page.getByRole("button", { name: "Echtbild" }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${dir}/19-kamera-echtbild.png` });

  await page.getByRole("button", { name: "Silhouette" }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${dir}/20-kamera-silhouette.png` });
});
