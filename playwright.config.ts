import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3100);
const baseURL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
    // 390px is the calibration width for the whole UI (iPhone 14 / 15).
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
  },
  webServer: {
    // Runs against a production build with no ANTHROPIC_API_KEY, i.e. mock mode.
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    // ADMIN_PASSWORD because /admin is now closed without one and the flows cover
    // it; the rest keeps the run offline and model-free.
    env: {
      ANTHROPIC_API_KEY: "",
      VERIFIED_OFFLINE: "1",
      // The admin tests sign in for real, so the suite needs a password to sign
      // in WITH. It is a test value and it is in the repo on purpose: the point
      // of the test is that a wrong password is refused and the right one is not.
      ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? "playwright-admin-password",
    },
  },
});
