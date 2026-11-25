import { spawn, type ChildProcess } from "node:child_process";
import { expect, test } from "@playwright/test";

/**
 * Zertifikatswarnung beim Heimnetz-Weg (selbstsigniertes Zertifikat): echte Chrome-Warnseite,
 * deutsch, im Handyformat. Startet dafür kurz den HTTPS-Server (preview:phone) auf Port 4443.
 */
const dir = "docs/install";
let server: ChildProcess | null = null;

test.use({
  locale: "de-DE",
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  ignoreHTTPSErrors: false,
  launchOptions: { args: ["--lang=de-DE"] },
});

test.beforeAll(async () => {
  server = spawn("pnpm", ["--filter", "@motion-arena/mobile-web", "exec", "vite", "preview", "--host", "--mode", "phone", "--port", "4443", "--strictPort"], {
    shell: true,
    stdio: "ignore",
  });
  for (let i = 0; i < 60; i++) {
    try {
      const { execSync } = await import("node:child_process");
      execSync("curl -sk -o NUL https://localhost:4443/", { stdio: "ignore" });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("HTTPS-Server startet nicht");
});

test.afterAll(() => {
  if (server?.pid) spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { shell: true, stdio: "ignore" });
});

test("Zertifikatswarnung: Warnung und 'Erweitert'", async ({ page }) => {
  await page.goto("https://localhost:4443/").catch(() => {});
  const details = page.locator("#details-button");
  await expect(details).toBeVisible({ timeout: 15_000 });
  await details.evaluate((n) => {
    (n as HTMLElement).style.outline = "3px solid #FF704B";
    (n as HTMLElement).style.outlineOffset = "3px";
  });
  await page.screenshot({ path: `${dir}/05-zertifikat-warnung.png` });
  await details.evaluate((n) => ((n as HTMLElement).style.outline = "none"));
  await details.click();
  const proceed = page.locator("#proceed-link");
  await expect(proceed).toBeVisible();
  await proceed.scrollIntoViewIfNeeded();
  await proceed.evaluate((n) => {
    (n as HTMLElement).style.outline = "3px solid #FF704B";
    (n as HTMLElement).style.outlineOffset = "3px";
  });
  await page.screenshot({ path: `${dir}/06-zertifikat-erweitert.png` });
});
