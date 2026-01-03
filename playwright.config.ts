import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL: "http://localhost:8083",
    headless: true,
  },
  timeout: 120_000, // 2 minutes for research tests
});
