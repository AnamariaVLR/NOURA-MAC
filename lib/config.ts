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

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

/**
 * /admin/listings is the data-entry tool for hand-verified prices. There are no
 * accounts in this MVP (out of scope), so it is open in development and closed in
 * production unless explicitly enabled. A real deployment needs authentication in
 * front of it before anyone but the operator can reach it.
 */
export function adminAllowed(): boolean {
  return process.env.NODE_ENV === "development" || process.env.ALLOW_ADMIN === "1";
}

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
