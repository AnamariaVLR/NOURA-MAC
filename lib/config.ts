/** Central place for every environment-derived setting. Nothing else reads process.env. */

export const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5";

/** Empty or unset key => mock mode. The whole app stays demoable without a key. */
export function apiKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key ? key : null;
}

export type RunMode = "live" | "mock";

/**
 * Force example mode even when a key is present.
 *
 * Two real uses. A demo deployment can run the whole product without spending
 * anything on identification. And the end-to-end suite MUST be deterministic and
 * free: it drives a synthetic fixture image that a real model correctly reads as
 * unidentifiable, so a live run turns every scan into a failed scan.
 *
 * It exists as a separate flag rather than "unset the key in the test
 * environment" because that does not work. `next start` boots Next, Next loads
 * .env itself, and its values beat anything the harness passed in — the same
 * trap that broke the admin tests when .env gained a password (DECISIONS §79's
 * sibling). A flag the app reads first is the only thing .env cannot override.
 */
export function forceMock(): boolean {
  return process.env.NOURA_FORCE_MOCK === "1";
}

/**
 * Whether a fixture identification may be served at all.
 *
 * ── Why this gate exists ────────────────────────────────────────────────────
 *
 * Mock mode returns a real catalogue product — Coca-Cola — with real evidence,
 * a real verdict and real sources. Photographed a pot of yoghurt? The page says
 * Coca-Cola, NOT RECOMMENDED, 10.6 g of sugar per 100 ml, confirmed 20 September.
 * Every one of those statements is true about Coca-Cola and none of them is
 * about the thing in your hand.
 *
 * That happened: a scan of an Al Rawabi Greek yoghurt page returned a complete,
 * confident Coca-Cola assessment because the server had no ANTHROPIC_API_KEY.
 * The mode was signalled by a small chip among other chips, which is not
 * proportionate to presenting a fabricated identification as a real one.
 *
 * So a fixture is now something you ASK for, never something you fall into:
 *
 *   NOURA_FORCE_MOCK=1   explicit — tests and demos
 *   development, no key  allowed, and the page says so unmissably
 *   production, no key   REFUSED. The scan fails honestly instead.
 *
 * A failed scan is a worse demo and a better product.
 */
export function fixtureAllowed(): boolean {
  // Explicit, and nothing else. Not "production is stricter than development":
  // a developer holding a yoghurt and reading Coca-Cola learns the wrong thing
  // about their own app, and the fixture that reached a user reached them
  // through exactly this door being merely ajar.
  return forceMock();
}

/**
 * Hard-off switch for identification, so the unconfigured case is testable.
 *
 * .env beats anything a test harness passes in — the trap that has now bitten
 * this project three times — so "just unset the key" cannot produce a server
 * that genuinely cannot identify. A flag the app reads first can.
 */
export function identificationDisabled(): boolean {
  return process.env.NOURA_DISABLE_IDENTIFICATION === "1";
}

export function runMode(): RunMode {
  if (forceMock()) return "mock";
  if (identificationDisabled()) return "mock";
  return apiKey() ? "live" : "mock";
}

/** When true, skip every outbound network call and use seeded evidence only. */
export function isOffline(): boolean {
  return process.env.VERIFIED_OFFLINE === "1";
}

/**
 * Which catalogue product mock mode pretends to see. Defaults to a poor-scoring
 * drink, because the interesting demo is a bad verdict with good alternatives.
 */
export const MOCK_PRODUCT_SLUG = process.env.MOCK_PRODUCT_SLUG?.trim() || "coca-cola-330ml";

export const UPLOAD_DIR = process.env.UPLOAD_DIR?.trim() || ".data/uploads";

/** Hard cap on uploads, enforced in the route handler before anything else. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Longest edge an image is reduced to before it is stored or sent to the model.
 *
 * Nothing reads a label better at 4000px than at 1600px, and the difference is
 * seconds of upload on supermarket 4G. The client resizes before uploading and
 * lib/storage.ts enforces it again, because a client-side limit is a suggestion.
 */
export const MAX_IMAGE_EDGE_PX = 1600;

/**
 * Ceiling for an image stored inside a database row, when no blob store is
 * configured. 300 KB is small enough that a Postgres row stays comfortable and
 * large enough that a shelf photo is still legible as an audit record.
 */
export const MAX_INLINE_IMAGE_BYTES = 300 * 1024;

/** Vercel Blob token. Unset means images are stored in the database instead. */
export function blobToken(): string | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  return token ? token : null;
}

/**
 * The password for /admin, and the rule that a missing one CLOSES the door rather
 * than opening it.
 *
 * The previous rule — open in development, closed unless ALLOW_ADMIN=1 — is the
 * wrong shape for a deployed pilot: it makes "did anyone set the flag?" the thing
 * standing between the public and the price-entry tool. Now the question is "is
 * there a password?", and no password means /admin is unreachable for everyone.
 */
export function adminPassword(): string | null {
  const password = process.env.ADMIN_PASSWORD?.trim();
  return password && password.length >= 8 ? password : null;
}

/**
 * Identifications allowed per hour, per client.
 *
 * Configurable because the default is a production protection and a test
 * harness legitimately needs to exceed it: the end-to-end suite performs about
 * fifteen scans per run, all from 127.0.0.1, so two runs in an hour would hit
 * the limit and every subsequent scan would 429. That is the limiter working —
 * and it made the suite hang for sixty seconds a test, which reads as an
 * application fault and is not one.
 *
 * 30 is far above a shopper's real rate — a supermarket trip might produce
 * fifteen — and far below what a script would want.
 */
export function scanLimitPerHour(): number {
  const raw = Number(process.env.SCAN_RATE_LIMIT_PER_HOUR);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 30;
}

/**
 * Failed-and-successful sign-in attempts allowed per hour per address.
 *
 * Configurable for the same reason the scan limit is: a suite that signs in on
 * every run exhausts ten attempts in a few minutes, and the next run fails on a
 * login form that is quietly refusing it. That looked like a broken form twice
 * before it was recognised as the limiter doing its job. Ten is right for a
 * real deployment; the test runner raises it.
 */
export function loginAttemptsPerHour(): number {
  const raw = Number(process.env.LOGIN_RATE_LIMIT_PER_HOUR);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 10;
}

/**
 * The wider ceiling applied per ADDRESS rather than per browser.
 *
 * An IP is a building, not a person. The per-browser limit is what protects a
 * shopper from a runaway loop; this one protects Noura from a single address
 * hammering it, and is set high enough that a household or a pilot group of a
 * dozen testers never reaches it.
 */
export function scanLimitPerAddressPerHour(): number {
  const raw = Number(process.env.SCAN_ADDRESS_LIMIT_PER_HOUR);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return Math.max(scanLimitPerHour() * 10, 200);
}

/** Salt for the rate-limit key hash, so the table never holds an IP address. */
export function rateLimitSalt(): string {
  return process.env.RATE_LIMIT_SALT?.trim() || process.env.ADMIN_PASSWORD?.trim() || "noura-dev";
}

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

/** /admin/seed is a dev tool. Refuse to run it anywhere it was not explicitly allowed. */
export function seedEndpointAllowed(): boolean {
  return process.env.NODE_ENV === "development" || process.env.ALLOW_SEED_ENDPOINT === "1";
}

/** Shown verbatim on every screen that shows a verdict. Never edited per product. */
export const DISCLAIMER =
  "Informational only, not medical advice. Noura summarises published product " +
  "data; it does not know your health, allergies or medication. Ask a qualified " +
  "health professional before making dietary or treatment decisions.";

export const OPEN_FOOD_FACTS_BASE = "https://world.openfoodfacts.org";
