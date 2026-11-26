import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

/**
 * Content-Security-Policy: Die App darf nur mit dem eigenen Server sprechen.
 * Hintergrund: MediaPipe tasks-vision sendet beim Schließen Nutzungsmetriken an Google
 * (odml.pa.googleapis.com). Das widerspricht „nichts verlässt das Gerät“ und wird hier blockiert.
 * Dev-Modus braucht zusätzlich Inline-Skript (React-Refresh) und WebSocket (HMR).
 */
function csp(dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval'${dev ? " 'unsafe-inline'" : ""}`,
    // 0.peerjs.com: nur Verbindungsaufnahme für den TV-Modus (siehe src/tv/transport.ts)
    `connect-src 'self' https://0.peerjs.com wss://0.peerjs.com${dev ? " ws: wss:" : ""}`,
    "img-src 'self' data: blob:",
    "media-src 'self' blob: mediastream:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join("; ");
}

function cspPlugin(): Plugin {
  let dev = false;
  return {
    name: "motion-arena-csp",
    configResolved(c) {
      dev = c.command === "serve";
    },
    transformIndexHtml(html) {
      return html.replace(
        "<head>",
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp(dev)}" />`,
      );
    },
  };
}

/** Großes Zusatzmodell wird nicht vorab geladen, sondern erst bei Nutzung zwischengespeichert. */
const NOT_PRECACHED = [/pose_landmarker_full\.task$/];

/**
 * Service Worker für Installation und Offline-Betrieb. Nach dem Build wird `sw.js` mit der
 * vollständigen Dateiliste (gehashte Bundles + public/) und einer Version aus deren Inhalt erzeugt.
 */
function serviceWorkerPlugin(): Plugin {
  let outDir = "";
  return {
    name: "motion-arena-sw",
    apply: "build",
    configResolved(c) {
      outDir = c.build.outDir.startsWith("/") || /^[A-Za-z]:/.test(c.build.outDir) ? c.build.outDir : join(c.root, c.build.outDir);
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(relative(outDir, p).split(sep).join("/"));
        }
      };
      walk(outDir);
      const precache = files
        .filter((f) => f !== "sw.js" && !NOT_PRECACHED.some((r) => r.test(f)))
        .sort();
      const hash = createHash("sha256");
      for (const f of precache) hash.update(f).update(String(statSync(join(outDir, f)).size));
      const version = hash.digest("hex").slice(0, 12);
      const list = ["./", ...precache.filter((f) => f !== "index.html").map((f) => `./${f}`)];
      writeFileSync(join(outDir, "sw.js"), swSource(version, list));
    },
  };
}

function swSource(version: string, precache: string[]): string {
  return `// Automatisch erzeugt beim Build – nicht von Hand ändern.
const CACHE = "motion-arena-${version}";
const PRECACHE = ${JSON.stringify(precache)};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("motion-arena-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    // Seite: erst Netz (Aktualisierungen), offline aus dem Speicher.
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./", copy));
          return res;
        })
        .catch(() => caches.match("./", { ignoreVary: true })),
    );
    return;
  }
  // Dateien: aus dem Speicher, sonst laden und für später ablegen (z. B. das große Modell).
  // ignoreVary: Module/CSS werden mit "crossorigin" (Origin-Header) angefragt, der Server antwortet
  // mit "Vary: Origin" – ohne ignoreVary würde der gespeicherte Eintrag offline nicht gefunden.
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
`;
}

/** Versionsangabe für die Startseite: Nummer aus package.json + Kurzkennung des Commits. */
function buildInfo(): { version: string; commit: string } {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };
  let commit = process.env.GITHUB_SHA?.slice(0, 7) ?? "";
  if (!commit) {
    try {
      commit = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    } catch {
      commit = "lokal";
    }
  }
  return { version: pkg.version, commit };
}

// "phone"-Modus: HTTPS mit selbstsigniertem Zertifikat, damit die Kamera auf dem
// Smartphone im LAN freigegeben wird (getUserMedia braucht HTTPS außer auf localhost).
// BASE_PATH: Unterpfad beim Hosting, z. B. "/motion_arena/" für GitHub Pages.
const info = buildInfo();
export default defineConfig(({ mode }) => ({
  base: process.env.BASE_PATH ?? "/",
  define: {
    __APP_VERSION__: JSON.stringify(info.version),
    __APP_COMMIT__: JSON.stringify(info.commit),
  },
  plugins: [react(), cspPlugin(), serviceWorkerPlugin(), ...(mode === "phone" ? [basicSsl()] : [])],
  server: { port: 5173 },
}));
