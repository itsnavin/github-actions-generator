const { defineConfig, devices } = require("@playwright/test");
module.exports = defineConfig({
  testDir: "./tests/browser",
  fullyParallel: true,
  reporter: "list",
  use: { baseURL: process.env.TEST_BASE_URL || "http://127.0.0.1:4173", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" } }
  ],
  webServer: process.env.TEST_BASE_URL ? undefined : {
    command: "node tests/server.cjs", url: "http://127.0.0.1:4173", reuseExistingServer: false
  }
});
