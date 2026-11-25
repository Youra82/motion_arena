// Zeigt die Handy-Adresse als QR-Code: in der Konsole und als lokale HTML-Seite.
// Aufruf: node connect-page.mjs <ausgabe.html> <url> [weitere-url ...]
import { writeFileSync } from "node:fs";
import QRCode from "qrcode";

const [out, ...urls] = process.argv.slice(2);
if (!out || urls.length === 0) {
  console.error("Aufruf: node connect-page.mjs <ausgabe.html> <url> [weitere-url ...]");
  process.exit(1);
}

const main = urls[0];
// Lokaler Link für den PC: erste Heimnetz-Adresse, Host durch localhost ersetzt.
const firstLocal = urls.find((u) => !new URL(u).hostname.endsWith("github.io"));
const pcUrl = firstLocal ? firstLocal.replace(/\/\/[^:/]+/, "//localhost") : null;
console.log(await QRCode.toString(main, { type: "terminal", small: true, margin: 1 }));

/** Erklärung je Adresse: öffentlich (installierbar) oder Heimnetz über diesen PC. */
function hint(u, i) {
  const host = new URL(u).hostname;
  if (host.endsWith("github.io")) return "Empfohlen – App installieren, läuft danach auch ohne PC und offline";
  const lan = "Im Heimnetz über diesen PC (Zertifikatswarnung bestätigen; keine echte Installation)";
  return i === 0 ? `Empfohlen – ${lan}` : lan;
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const cards = await Promise.all(
  urls.map(async (u, i) => {
    const svg = await QRCode.toString(u, { type: "svg", margin: 1, color: { dark: "#101A1D", light: "#F4F2EC" } });
    return `<section class="card${i === 0 ? " main" : ""}">
      <div class="qr">${svg}</div>
      <div class="url">${esc(u)}</div>
      <div class="hint">${hint(u, i)}</div>
    </section>`;
  }),
);

const html = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>Motion Arena – mit dem Handy verbinden</title>
<style>
  body{margin:0;min-height:100vh;background:radial-gradient(120% 70% at 70% 0%,#1F3A40,#101A1D);color:#F4F2EC;
       font-family:Inter,"Segoe UI",system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;padding:40px 20px;box-sizing:border-box}
  h1{margin:0 0 6px;font-size:34px}
  p{color:#A9B8BB;margin:4px 0;max-width:640px;text-align:center;line-height:1.5}
  .cards{display:flex;flex-wrap:wrap;gap:24px;justify-content:center;margin:28px 0}
  .card{background:#1C2B30;border-radius:24px;padding:24px;text-align:center;width:300px}
  .card.main{box-shadow:inset 0 0 0 2px #FF704B}
  .qr svg{width:100%;height:auto;border-radius:12px}
  .url{font-size:18px;font-weight:700;margin-top:14px;word-break:break-all}
  .hint{font-size:13px;color:#A9B8BB;margin-top:6px}
  ol{color:#F4F2EC;line-height:1.8;max-width:640px}
  a{color:#47D4D0}
</style></head><body>
<h1>Motion Arena</h1>
<p>Mit der Handykamera den markierten QR-Code scannen.</p>
<div class="cards">${cards.join("")}</div>
<ol>
  <li>Auf der Seite oben „Als App installieren“: Android <b>„Jetzt installieren“</b>,
      iPhone in Safari <b>Teilen → „Zum Home-Bildschirm“</b>.</li>
  <li>Die App vom Startbildschirm öffnen, „Training starten“ tippen und den Kamerazugriff erlauben.</li>
  <li>Nur bei den Heimnetz-Adressen erscheint eine Zertifikatswarnung (selbstsigniert, nur in deinem Netz):
      Android „Erweitert → Weiter zu …“, iPhone „Details einblenden → diese Website besuchen“.
      Das Handy muss dafür im selben WLAN sein wie dieser PC.</li>
</ol>
${pcUrl ? `<p>Am PC selbst: <a href="${esc(pcUrl)}">${esc(pcUrl)}</a> · Der Heimnetz-Server läuft, solange das schwarze Fenster „Motion Arena“ geöffnet ist.</p>` : ""}
</body></html>`;
writeFileSync(out, html, "utf8");
