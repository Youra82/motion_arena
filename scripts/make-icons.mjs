// Erzeugt die App-Icons (PNG) aus dem eigenen Logo – einmalig, Ergebnis liegt im Repo.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const out = "apps/mobile-web/public/icons";
mkdirSync(out, { recursive: true });
// Vollflächiger Hintergrund (maskierbar), Logo innerhalb der sicheren 60-%-Zone.
const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs><radialGradient id="g" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#1F3A40"/><stop offset="1" stop-color="#101A1D"/></radialGradient></defs>
  <rect width="100" height="100" fill="url(#g)"/>
  <g transform="translate(30.5 25) scale(1.25)">
    <rect x="4" y="10" width="9" height="24" rx="4.5" fill="#FF704B" transform="skewX(-14)"/>
    <rect x="17" y="6" width="9" height="28" rx="4.5" fill="#FF704B" opacity="0.75" transform="skewX(-14)"/>
    <rect x="30" y="14" width="9" height="20" rx="4.5" fill="#47D4D0" transform="skewX(-14)"/>
  </g></svg>`;

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0">${svg(size)}</body></html>`);
  await page.screenshot({ path: `${out}/${name}`, omitBackground: false });
  console.log(`${name} ${size}px`);
}
await browser.close();
