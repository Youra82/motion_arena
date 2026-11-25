import { expect, test } from "@playwright/test";

/** Installationskarte, wie sie nach dem QR-Scan (?install=1) auf dem Handy erscheint. */
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

test.describe("Android", () => {
  test.use({ userAgent: ANDROID, hasTouch: true, isMobile: true });
  test("Installationskarte mit Knopf", async ({ page }) => {
    await page.goto("/?install=1");
    // Chrome meldet "installierbar" (auf echter HTTPS-Seite automatisch; hier nachgestellt)
    await page.evaluate(() => {
      const e = new Event("beforeinstallprompt") as Event & Record<string, unknown>;
      e.prompt = async () => {};
      e.userChoice = new Promise(() => {});
      window.dispatchEvent(e);
    });
    await expect(page.getByRole("button", { name: "📲 Jetzt installieren" })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "docs/screenshots/22-installieren-android.png" });
  });
});

test.describe("iPhone", () => {
  test.use({ userAgent: IPHONE, hasTouch: true, isMobile: true });
  test("Installationsanleitung", async ({ page }) => {
    await page.goto("/?install=1");
    await expect(page.getByText("Zum Home-Bildschirm")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: "docs/screenshots/23-installieren-iphone.png" });
  });
});
