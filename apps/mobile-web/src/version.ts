/** Anzeigetext der Version, z. B. "v0.2.0 · c81c8a1". In Tests ohne Vite-Build: "dev". */
export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
export const APP_COMMIT = typeof __APP_COMMIT__ === "string" ? __APP_COMMIT__ : "";
export const VERSION_LABEL = APP_COMMIT ? `v${APP_VERSION} · ${APP_COMMIT}` : `v${APP_VERSION}`;
