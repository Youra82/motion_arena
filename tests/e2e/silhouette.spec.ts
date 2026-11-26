import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, expect, test } from "@playwright/test";

/**
 * Silhouette mit einer Testkamera, die eine echte Person zeigt.
 * Regression: Auf der GPU lieferte getAsFloat32Array() eine leere Maske (glReadPixels-Fehler) → alles schwarz.
 * Das Personenbild (MediaPipe-Testdaten) wird zur Laufzeit geladen und nicht im Repo gespeichert.
 */
const IMAGE = "https://storage.googleapis.com/mediapipe-assets/pose.jpg";
const y4m = join(tmpdir(), "motion-arena-person.y4m");

test.beforeAll(async () => {
  const res = await fetch(IMAGE).catch(() => null);
  test.skip(!res || !res.ok, "Personen-Testbild nicht erreichbar (offline?)");
  const b64 = Buffer.from(await res!.arrayBuffer()).toString("base64");
  // JPEG im Browser dekodieren und in Y4M (YUV 4:2:0) für Chromes Testkamera umwandeln.
  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage();
  const { w, h, rgba } = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const w = 960, h = 640;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);
    return { w, h, rgba: Array.from(ctx.getImageData(0, 0, w, h).data) };
  }, `data:image/jpeg;base64,${b64}`);
  await browser.close();
  const Y = Buffer.alloc(w * h), U = Buffer.alloc((w / 2) * (h / 2)), V = Buffer.alloc((w / 2) * (h / 2));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, r = rgba[i]!, g = rgba[i + 1]!, bl = rgba[i + 2]!;
      Y[y * w + x] = Math.round(0.299 * r + 0.587 * g + 0.114 * bl);
      if (y % 2 === 0 && x % 2 === 0) {
        const k = (y / 2) * (w / 2) + x / 2;
        U[k] = Math.round(128 - 0.168736 * r - 0.331264 * g + 0.5 * bl);
        V[k] = Math.round(128 + 0.5 * r - 0.418688 * g - 0.081312 * bl);
      }
    }
  const frame = Buffer.concat([Buffer.from("FRAME\n"), Y, U, V]);
  writeFileSync(y4m, Buffer.concat([Buffer.from(`YUV4MPEG2 W${w} H${h} F30:1 Ip A1:1 C420jpeg\n`), ...Array(10).fill(frame)]));
});

test("Silhouette zeigt die Person (GPU-Maske), ohne WebGL-Lesefehler", async ({ baseURL }) => {
  const browser = await chromium.launch({
    channel: "chrome",
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${y4m}`],
  });
  const ctx = await browser.newContext({ permissions: ["camera"], viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const glErrors: string[] = [];
  page.on("console", (m) => { if (/glReadPixels|GL_INVALID/.test(m.text())) glErrors.push(m.text()); });

  await page.goto(baseURL!);
  await page.getByRole("button", { name: "▶ Training starten" }).click();
  await expect(page.getByText("Erkennung gut")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Silhouette" }).click();

  const tealPixels = () =>
    page.evaluate(() => {
      const c = document.querySelector("canvas")!;
      const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 1]! > 150 && d[i + 2]! > 150 && d[i]! < 140) n++;
      return n;
    });
  await expect.poll(tealPixels, { timeout: 10_000 }).toBeGreaterThan(2000);
  await page.screenshot({ path: "tests/e2e/.results/screens/11-silhouette-person.png" });
  expect(glErrors).toEqual([]);
  await browser.close();
});

test("Körperanalyse mit Personenbild (Krieger-II-Haltung): Ausfallschritt, vorderes rechtes Bein hoch", async ({ baseURL }) => {
  const browser = await chromium.launch({
    channel: "chrome",
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${y4m}`],
  });
  const ctx = await browser.newContext({ permissions: ["camera"], viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(baseURL!);
  await page.getByRole("button", { name: "Analyse starten" }).first().click();
  await expect(page.getByText("Erkennung gut")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".analysis-movement")).toHaveText("Ausfallschritt", { timeout: 10_000 });
  const zone = (name: string) => page.locator(".body-diagram path title", { hasText: name });
  await expect(zone("Oberschenkel rechts")).toHaveText(/hoch/);
  await expect(zone("Wade links")).toHaveText(/gering/);
  await page.screenshot({ path: "tests/e2e/.results/screens/12-analyse-person.png" });
  await browser.close();
});
