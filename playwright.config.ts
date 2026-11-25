import { defineConfig } from "@playwright/test";

// Nutzt den installierten Chrome (kein Browser-Download nötig).
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  outputDir: "tests/e2e/.results",
  use: {
    baseURL: "http://localhost:4173",
    channel: "chrome",
    headless: true,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  },
  webServer: {
    command: "pnpm --filter @motion-arena/mobile-web exec vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
