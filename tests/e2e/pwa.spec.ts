import { expect, test } from "@playwright/test";

const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

test("Service Worker speichert die App – Start und Demo funktionieren danach offline", async ({ page, context }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // Vorab-Speicher enthält App, WASM und das schnelle Modell.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const keys = await caches.keys();
          const c = await caches.open(keys.find((k) => k.startsWith("motion-arena-"))!);
          return (await c.keys()).map((r) => new URL(r.url).pathname);
        }),
      { timeout: 30_000 },
    )
    .toEqual(
      expect.arrayContaining([
        "/",
        "/manifest.webmanifest",
        "/models/pose_landmarker_lite.task",
        "/mediapipe/wasm/vision_wasm_internal.wasm",
      ]),
    );

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kniebeugen" })).toBeVisible();
  await page.getByRole("button", { name: "Demo ohne Kamera ansehen" }).click();
  await expect(page.getByText("DEMO", { exact: true })).toBeVisible();
  await expect(page.getByText("Kalibrierung")).toBeVisible();
  await context.setOffline(false);
});

test.describe("Android über QR-Code", () => {
  test.use({ userAgent: ANDROID, hasTouch: true, isMobile: true });

  test("Installationskarte hervorgehoben; Knopf öffnet den Installationsdialog des Browsers", async ({ page }) => {
    await page.goto("/?install=1");
    const card = page.getByRole("region", { name: "App installieren" });
    await expect(card).toBeVisible();
    await expect(card).toHaveClass(/highlight/);
    // Ohne Installationsereignis: Anleitung über das Browsermenü
    await expect(card.getByText("Zum Startbildschirm hinzufügen", { exact: false })).toBeVisible();

    // Browser meldet "installierbar" → eigener Knopf löst den echten Dialog aus
    await page.evaluate(() => {
      const e = new Event("beforeinstallprompt") as Event & Record<string, unknown>;
      (window as unknown as { __prompted: boolean }).__prompted = false;
      e.prompt = async () => {
        (window as unknown as { __prompted: boolean }).__prompted = true;
      };
      e.userChoice = Promise.resolve({ outcome: "accepted" });
      window.dispatchEvent(e);
    });
    await page.getByRole("button", { name: "📲 Jetzt installieren" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __prompted: boolean }).__prompted)).toBe(true);
    await expect(page.getByText("Motion Arena ist als App installiert")).toBeVisible();
    await page.screenshot({ path: "tests/e2e/.results/screens/09-install-android.png" });
  });
});

test.describe("iPhone über QR-Code", () => {
  test.use({ userAgent: IPHONE, hasTouch: true, isMobile: true });

  test("zeigt die Schritte über Teilen → Zum Home-Bildschirm", async ({ page }) => {
    await page.goto("/?install=1");
    const card = page.getByRole("region", { name: "App installieren" });
    await expect(card.getByText("Zum Home-Bildschirm")).toBeVisible();
    await expect(card.getByLabel("Teilen-Symbol")).toBeVisible();
    await page.screenshot({ path: "tests/e2e/.results/screens/10-install-iphone.png" });
  });
});

test("Am Desktop ohne Installationsangebot keine Karte", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Kniebeugen" })).toBeVisible();
  await expect(page.getByRole("region", { name: "App installieren" })).toHaveCount(0);
});
