import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://localhost:8082",
    headless: true,
  },
  timeout: 60_000,
});
