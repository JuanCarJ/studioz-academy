import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: ".",
  testMatch: "student.spec.ts",
  outputDir: "../../output/playwright/student-ui",
  workers: 1,
  fullyParallel: false,
  timeout: 30000,
  use: { baseURL: "http://127.0.0.1:4177", channel: "chrome", trace: "retain-on-failure", screenshot: "only-on-failure" },
  reporter: "list",
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium", viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: "node node_modules/vite/bin/vite.js --config tests/browser/vite.config.ts",
    cwd: "../..",
    url: "http://127.0.0.1:4177",
    reuseExistingServer: false,
    timeout: 30000,
  },
})
