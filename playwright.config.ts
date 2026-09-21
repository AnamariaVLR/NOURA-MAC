import { defineConfig, devices } from "@playwright/test";

/**
 * Load .env into this process before anything reads it.
 *
 * This matters more than it looks. `npm run start` boots Next, and Next loads
 * .env ITSELF — and its values win over whatever Playwright passes in
 * `webServer.env`. So once .env gained an ADMIN_PASSWORD, the server was using
 * that one while the tests were typing the fallback below, and every admin test
 * timed out on a login form that was quietly refusing them.
 *
 * Loading .env here makes the config, the test workers (which inherit this
 * process's env) and the server all read the same value.
 */
try {
  process.loadEnvFile(".env");
} catch {
  // No .env — the fallback below applies, which is the CI case.
}

const PORT = Number(process.env.PORT ?? 3100);

/**
 * The password the suite signs in with. Whatever .env says, or a fixed fallback
 * so a fresh clone can run the tests with no setup. Written back to process.env
 * so the workers see the same value the server was started with.
 */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD?.trim() || "playwright-admin-password";
process.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
const baseURL = `http://127.0.0.1:${PORT}`;

const UNCONFIGURED_PORT = PORT + 1;
const unconfiguredURL = `http://127.0.0.1:${UNCONFIGURED_PORT}`;

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
  // Two projects, because the incident this suite exists to prevent is a
  // CONFIGURATION, and a configuration cannot be tested from inside a server
  // started with the opposite one.
  projects: [
    {
      name: "fixture",
      testIgnore: /no-identification\.spec\.ts/,
    },
    {
      name: "unconfigured",
      testMatch: /no-identification\.spec\.ts/,
      use: { baseURL: unconfiguredURL },
    },
  ],

  webServer: [
   {
    // Runs against a production build with no ANTHROPIC_API_KEY, i.e. mock mode.
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    // ADMIN_PASSWORD because /admin is now closed without one and the flows cover
    // it; the rest keeps the run offline and model-free.
    env: {
      // NOT `ANTHROPIC_API_KEY: ""`. Next loads .env itself and its value wins
      // over anything passed here, so a developer with a real key in .env was
      // running the whole suite against the live model — slowly, at a cost, and
      // wrongly: the fixture is a synthetic image that a real model correctly
      // reads as unidentifiable, so every scan became a failed scan.
      NOURA_FORCE_MOCK: "1",
      VERIFIED_OFFLINE: "1",
      // The suite performs ~15 scans per run, all from 127.0.0.1. At the
      // production limit of 30/hour, two runs in an hour start returning 429 and
      // every later scan hangs the test for sixty seconds waiting for a
      // navigation that will never happen. The limiter is right; the harness is
      // simply not a shopper.
      SCAN_RATE_LIMIT_PER_HOUR: "100000",
      // Same reason: the suite signs in on almost every run.
      LOGIN_RATE_LIMIT_PER_HOUR: "100000",
      // The admin tests sign in for real, so the suite needs a password to sign
      // in WITH. It is a test value and it is in the repo on purpose: the point
      // of the test is that a wrong password is refused and the right one is not.
      ADMIN_PASSWORD,
    },
   },
   {
    // THE CONFIGURATION THAT CAUSED THE INCIDENT.
    //
    // No NOURA_FORCE_MOCK and no usable key: a server that cannot identify
    // anything. It used to answer every photo with Coca-Cola. The
    // no-identification suite runs here and asserts that it now answers with
    // nothing at all.
    //
    // NOURA_DISABLE_IDENTIFICATION defeats whatever key .env holds, because
    // .env beats webServer.env and a developer with a real key would otherwise
    // never run this test at all.
    command: `npm run start -- --port ${UNCONFIGURED_PORT}`,
    url: unconfiguredURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      NOURA_DISABLE_IDENTIFICATION: "1",
      VERIFIED_OFFLINE: "1",
      SCAN_RATE_LIMIT_PER_HOUR: "100000",
      ADMIN_PASSWORD,
    },
   },
  ],
});
