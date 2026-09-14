import { adminTestPassword } from "./tests/support/admin-fixture";
import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:3100",
    launchOptions: { channel: "chrome" },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
    },
  ],
  webServer: [
    {
      command: "node tests/support/admin-rpc-server.mjs",
      url: "http://127.0.0.1:3101/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run start -- --port 3100",
      env: {
        ADMIN_DASHBOARD_PASSWORD: adminTestPassword,
        SUPABASE_URL: "http://127.0.0.1:3101",
        SUPABASE_SECRET_KEY: "ayalvi-e2e-server-only-canary",
      },
      url: "http://localhost:3100",
      reuseExistingServer: false,
    },
  ],
  reporter: "list",
});
