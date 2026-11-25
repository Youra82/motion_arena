import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Erzeugt die README-Galerie nach docs/screenshots/ (pnpm screenshots, vorher pnpm build).
export default defineConfig({
  ...base,
  testDir: "tests/screenshots",
  timeout: 150_000,
  outputDir: "tests/screenshots/.results",
});
