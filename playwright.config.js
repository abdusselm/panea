import fs from "node:fs";
import { defineConfig } from "@playwright/test";
import { PORT, BASE_URL, STATE_DIR } from "./e2e/paths.js";

fs.rmSync(STATE_DIR, { recursive: true, force: true });
fs.mkdirSync(STATE_DIR, { recursive: true });

export default defineConfig({
  testDir: "e2e",
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    channel: "chrome",
    headless: true,
    viewport: { width: 1400, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node server.js",
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 20_000,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      PANEA_PORT: String(PORT),
      PANEA_STATE_DIR: STATE_DIR,
      PANEA_NO_THEME: "1",
      PANEA_NO_META_POLL: "1",
      SHELL: "/bin/sh",
    },
  },
});
