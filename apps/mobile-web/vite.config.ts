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
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "img-src 'self' data: blob:",
    "media-src 'self' blob: mediastream:",
    "worker-src 'self' blob:",
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

// "phone"-Modus: HTTPS mit selbstsigniertem Zertifikat, damit die Kamera auf dem
// Smartphone im LAN freigegeben wird (getUserMedia braucht HTTPS außer auf localhost).
export default defineConfig(({ mode }) => ({
  plugins: [react(), cspPlugin(), ...(mode === "phone" ? [basicSsl()] : [])],
  server: { port: 5173 },
}));
