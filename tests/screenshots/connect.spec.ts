import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "@playwright/test";

/** Verbindungsseite des Windows-Starters – mit Beispieladressen statt echter Netzwerkadressen. */
test("Verbindungsseite mit QR-Code", async ({ browser }) => {
  const html = join(mkdtempSync(join(tmpdir(), "ma-connect-")), "verbinden.html");
  execFileSync(process.execPath, [
    "scripts/windows/connect-page.mjs",
    html,
    "https://youra82.github.io/motion_arena/?install=1",
    "https://192.168.1.23:4443/",
    "https://100.64.12.34:4443/",
  ]);
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(html).href);
  await page.screenshot({ path: "docs/screenshots/21-verbinden-qr-code.png", fullPage: true });
  await page.close();
});
