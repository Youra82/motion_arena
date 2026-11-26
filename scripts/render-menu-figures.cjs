// Standbilder der 15 Figuren für das Hauptmenü rendern (gleiche Arena-Szene wie im Training).
// Voraussetzung: Vite-Entwicklungsserver läuft (pnpm --filter @motion-arena/mobile-web exec vite --port 4195).
// Aufruf: node scripts/render-menu-figures.cjs [http://127.0.0.1:4195] [ids,kommagetrennt]
// Danach: python scripts/matte-menu-figures.py  (Freistellung aus Schwarz/Weiß-Paar → public/menu/figures/*.webp)
const { chromium } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const raw = path.join(root, "assets-src", "menu-figures-raw");
const url = process.argv[2] ?? "http://127.0.0.1:4195/";
const avatars = fs.readFileSync(path.join(root, "apps/mobile-web/src/render/avatars.ts"), "utf8");
const all = [...avatars.matchAll(/\{ id: "([a-z]+)", nr: \d+/g)].map((m) => m[1]);
const ids = process.argv[3] ? process.argv[3].split(",") : all;

(async () => {
  fs.mkdirSync(raw, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-swiftshader"] });
  const page = await browser.newPage();
  page.on("console", (m) => m.type() === "error" && console.log("[Seite]", m.text()));
  await page.goto(url);
  await page.waitForTimeout(1500);
  for (const id of ids) {
    const shots = await page.evaluate(async (who) => (await import("/src/dev/poster.ts")).poster(who, 62, 600, 900), id);
    for (const [bg, data] of Object.entries(shots)) {
      fs.writeFileSync(path.join(raw, `${id}-${bg}.png`), Buffer.from(data.split(",")[1], "base64"));
    }
    console.log("ok", id);
  }
  await browser.close();
})().catch((e) => {
  console.error("FEHLER:", e.message);
  process.exit(1);
});
