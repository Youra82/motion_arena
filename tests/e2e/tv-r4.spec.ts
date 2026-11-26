import { expect, test, type Page } from "@playwright/test";

let qrLink = "";
async function openTv(tv: Page) {
  await tv.setViewportSize({ width: 1280, height: 720 });
  await tv.goto("/?tv&transport=local");
  await expect(tv.getByText("Bereit – warte auf das Handy …")).toBeVisible();
  // Angepasst (Runde 4, H2): Der QR-Code enthält zusätzlich einen Schlüssel; nur damit koppelt ein Handy ohne
  // Bestätigung am Fernseher. Der nackte Code (Eingabe von Hand) braucht ein "Annehmen" am TV.
  qrLink = (await tv.getByAltText("QR-Code zum Koppeln").getAttribute("data-pair-url"))!;
  return (await tv.locator(".tv-code").innerText()).replace(/\s/g, "");
}

async function join(phone: Page, _code: string) {
  await phone.goto(qrLink);
  await expect(phone.getByText("Mit dem Fernseher verbunden")).toBeVisible();
}

test("Lokale Kopplung überträgt Live-Werte, Analyse, Demo-Kennzeichnung und Hochformat", async ({ context, page: phone }) => {
  const tv = await context.newPage();
  const code = await openTv(tv);
  await join(phone, code);
  await phone.bringToFront();
  await phone.getByRole("button", { name: "Nein, nur Figur ohne Kamerabild" }).click();
  await phone.getByRole("button", { name: "Demo ohne Kamera ansehen" }).click();
  await expect(tv.locator(".tv-stage .chip-demo")).toHaveText("DEMO");
  await expect(tv.getByText(/Kamerabild am Handy nicht freigegeben/)).toBeVisible();
  await expect(tv.locator(".tv-stage canvas.tv-video")).toBeVisible();
  await expect(tv.locator(".tv-stage video")).toBeHidden();
  await expect(tv.locator(".hud-reps")).toHaveText(/^1\s*\//, { timeout: 20000 });
  await expect(tv.locator(".hud-points")).toHaveText((await phone.locator(".hud-points").innerText()));
  const stage = (await tv.locator(".tv-stage").boundingBox())!;
  const viewport = phone.viewportSize()!;
  expect(stage.width / stage.height).toBeCloseTo(viewport.width / viewport.height, 2);

  await phone.getByRole("button", { name: "Training beenden" }).click();
  const [reps, target] = (await phone.locator(".stat-value").nth(0).innerText()).split("/").map(Number);
  await expect(tv.locator(".tv-result .tv-result-grid b").nth(0)).toHaveText(new RegExp(`^${reps}\\s*/\\s*${target}$`));
  await expect(tv.locator(".tv-result .tv-result-grid b").nth(1)).toHaveText(await phone.locator(".stat-value").nth(1).innerText());
  await phone.getByRole("button", { name: "Zur Startseite" }).click();
  await phone.getByRole("button", { name: "Analyse-Demo ohne Kamera" }).click();
  await expect.poll(async () => {
    const [handy, fernseher] = await Promise.all([phone, tv].map(async (page) => {
      const movement = await page.locator(".analysis-movement").textContent({ timeout: 1000 });
      const intensity = await page.locator(".analysis-intensity").textContent({ timeout: 1000 });
      return [movement, intensity];
    }));
    return handy[0] !== "…" && handy.every((v, i) => v === fernseher[i]);
  }, { timeout: 10000 }).toBe(true);
  await expect(tv.getByRole("img", { name: /Körperschema mit geschätzter Beanspruchung/ })).toBeVisible();
});

test("Ein getrenntes Handy kann sich am wartenden TV erneut koppeln", async ({ context, page: phone }) => {
  const tv = await context.newPage();
  const code = await openTv(tv);
  await join(phone, code);
  await expect(tv.getByText("Handy verbunden")).toBeVisible();
  await phone.getByRole("button", { name: "Trennen" }).click();
  await expect(tv.getByText("Bereit – warte auf das Handy …")).toBeVisible();
  await join(phone, code);
  await expect(tv.getByText("Handy verbunden")).toBeVisible();
});

test("Ein zweites Handy stört die bestehende lokale Kopplung nicht", async ({ context, page: phone }) => {
  // CODEX-BEFUND: Das zweite Handy bekommt ebenfalls eine Bestätigung und sein Trennen setzt den TV zurück.
  const tv = await context.newPage();
  const code = await openTv(tv);
  await join(phone, code);
  const second = await context.newPage();
  await second.goto(`/?pair=${code}&transport=local`);
  await expect(second).not.toHaveURL(/pair=/);
  await expect(second.getByRole("heading", { level: 1 })).toBeVisible();
  const disconnect = second.getByRole("button", { name: "Trennen" });
  if (await disconnect.isVisible()) await disconnect.click();
  else await second.close();
  await expect(tv.getByText("Handy verbunden")).toBeVisible({ timeout: 2000 });
});

test("Das Demo-Ergebnis bleibt am Fernseher als Demo gekennzeichnet", async ({ context, page: phone }) => {
  // CODEX-BEFUND: Der TV verwirft im Ergebnis die mitgesendete Demo-Kennzeichnung.
  const tv = await context.newPage();
  await join(phone, await openTv(tv));
  await phone.getByRole("button", { name: "Nein, nur Figur ohne Kamerabild" }).click();
  await phone.getByRole("button", { name: "Demo ohne Kamera ansehen" }).click();
  await expect(tv.locator(".tv-stage .chip-demo")).toHaveText("DEMO");
  await phone.getByRole("button", { name: "Training beenden" }).click();
  await expect(phone.getByText(/Ergebnis .* DEMO/)).toBeVisible();
  await expect(tv.locator(".tv-result").getByText(/DEMO/)).toBeVisible({ timeout: 2000 });
});
