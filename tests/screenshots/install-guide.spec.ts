import { expect, test } from "@playwright/test";

/**
 * Echte Aufnahmen für die Installationsanleitung (README). Nur Web-Seiten – Systemdialoge von
 * Android/iOS/Windows lassen sich so nicht aufnehmen und werden bewusst nicht nachgebaut.
 */
const dir = "docs/install";

test("GitHub: Code → Download ZIP", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 640 }, deviceScaleFactor: 1, locale: "de-DE" });
  await page.goto("https://github.com/Youra82/motion_arena");
  const code = page.getByRole("button", { name: /^Code/ }).first();
  await code.click();
  const zip = page.getByRole("menuitem", { name: /Download ZIP/ }).or(page.getByRole("link", { name: /Download ZIP/ }));
  await expect(zip.first()).toBeVisible();
  // Markierung der beiden Klickziele (Rahmen in Korallorange) – die Seite selbst bleibt unverändert.
  for (const el of [code, zip.first()]) {
    await el.evaluate((n) => {
      (n as HTMLElement).style.outline = "3px solid #FF704B";
      (n as HTMLElement).style.outlineOffset = "2px";
      (n as HTMLElement).style.borderRadius = "6px";
    });
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${dir}/01-github-download-zip.png` });
  await page.close();
});
