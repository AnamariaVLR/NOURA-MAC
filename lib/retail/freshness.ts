/**
 * How old a price is allowed to be before we stop calling it a price.
 *
 * ── Why a window at all ─────────────────────────────────────────────────────
 *
 * No UAE grocery retailer publishes a product API, and we do not scrape. Every
 * price in this app exists because a person stood in front of a shelf or opened a
 * retailer page and wrote down what they saw. That is good evidence on the day it
 * was taken and steadily worse afterwards: promotions end, packs change size,
 * things go out of stock.
 *
 * So a check has an expiry. Inside the window we say "Verified by hand on {date}".
 * Outside it we still show the number — it is the last thing we actually know — but
 * we say plainly that it is not recent, and it can never be treated as a live
 * price, never rank an alternative, and never satisfy "in stock".
 *
 * 14 days is a judgement call: long enough that a weekly shopper's checks stay
 * useful, short enough that a fortnightly promotion cycle cannot make us wrong for
 * a month. See DECISIONS.md §35.
 */

import { isVerifiableSource, type DataSource } from "../schemas";

export const FRESHNESS_DAYS = 14;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whole days between a check and now. Floored, so a check made 13.9 days ago is 13
 * days old and still fresh — we never age a check up to push it over the line.
 * A check dated in the future is 0 days old rather than negative.
 */
export function ageInDays(checkedAt: Date, now: Date = new Date()): number {
  const ms = now.getTime() - checkedAt.getTime();
  if (!Number.isFinite(ms)) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.floor(ms / MS_PER_DAY));
}

/**
 * Is this check something we may present as a verified price?
 *
 * Two conditions, both required:
 *   1. It was made by a person — a SYNTHETIC row is scaffolding, not evidence.
 *   2. It is inside the freshness window.
 */
export function isFreshCheck(
  check: { source: string; checkedAt: Date },
  now: Date = new Date(),
): boolean {
  if (!isVerifiableSource(check.source)) return false;
  if (check.source !== ("HAND_VERIFIED" satisfies DataSource)) {
    // A future live connector will qualify here too; nothing ships that does yet.
    if (check.source !== ("RETAILER_API" satisfies DataSource)) return false;
  }
  return ageInDays(check.checkedAt, now) < FRESHNESS_DAYS;
}

export type Staleness = "fresh" | "stale" | "never-checked" | "not-evidence";

/** How the admin table and the result page describe a listing's newest check. */
export function stalenessOf(
  check: { source: string; checkedAt: Date } | null | undefined,
  now: Date = new Date(),
): Staleness {
  if (!check) return "never-checked";
  if (!isVerifiableSource(check.source)) return "not-evidence";
  if (isFreshCheck(check, now)) return "fresh";
  return "stale";
}

/**
 * The sentence shown beside a price. Never says "live", never implies a number is
 * current when it is not.
 */
export function freshnessLabel(
  staleness: Staleness,
  formattedDate: string,
  checkedBy?: string,
): string {
  switch (staleness) {
    case "fresh":
      return checkedBy
        ? `Verified by hand on ${formattedDate} by ${checkedBy}`
        : `Verified by hand on ${formattedDate}`;
    case "stale":
      return `Price not verified recently — last checked ${formattedDate}`;
    case "not-evidence":
      return "Example data, not a real price";
    default:
      return "No price check yet";
  }
}

/** Days until a fresh check expires; 0 once it has. */
export function daysUntilStale(checkedAt: Date, now: Date = new Date()): number {
  return Math.max(0, FRESHNESS_DAYS - ageInDays(checkedAt, now));
}
