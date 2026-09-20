/** Central place for every environment-derived setting. Nothing else reads process.env. */

export const MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5";

/** Empty or unset key => mock mode. The whole app stays demoable without a key. */
export function apiKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key ? key : null;
}

export type RunMode = "live" | "mock";

export function runMode(): RunMode {
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
