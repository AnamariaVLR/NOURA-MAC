/**
 * Ranking better alternatives. Pure — no database, no model, no clock.
 *
 * ── THE ORDERING ───────────────────────────────────────────────────────────
 *
 * Candidates are compared on four keys, in strict priority order. A later key is
 * consulted only when every earlier key ties.
 *
 *   1. MORE PASSED CHECKS (descending)
 *      The primary signal, and the one the reader can see for themselves on the
 *      result page. Counting passes — not a weighted score — keeps the comparison
 *      legible: "this one passes five checks, yours passes two."
 *      Passes, not pass rate: a product that publishes enough data to pass five
 *      checks has demonstrably more going for it than one that publishes two
 *      things and passes both. Pass rate would reward silence.
 *
 *   2. STRONGER CERTIFICATION EVIDENCE (descending)
 *      valid + accredited body (3) > valid, body unnamed (2) >
 *      expired (1) > none found (0) > suspended (-1).
 *      This is the UAE-specific signal the whole product is built around, so it
 *      breaks ties before anything generic does. A suspended certificate ranks
 *      below having none at all: an active regulator warning is worse than silence.
 *
 *   3. FEWER ADDITIVES (ascending)
 *      A finer-grained reading of the same processing signal the additive check
 *      reduces to a yes/no. Two products that both fail that check are not equally
 *      processed, and this is where that difference shows up.
 *      A product whose additives are UNKNOWN sorts last within this key rather
 *      than first: absent data must never win a tie-break.
 *
 *   4. LOWER PRICE PER UNIT (ascending)
 *      Cheapest per 100 g/ml among in-stock listings, so a 1 L carton is compared
 *      with a 250 ml one honestly. Last because Noura is not a price comparison
 *      site; price decides only between options that are equally well evidenced.
 *      A listing whose pack size could not be parsed falls back to pack price.
 *
 *   Final tie-break: product name, so the same data always renders in the same
 *   order and tests can assert on it.
 *
 * ── WHAT NEVER REACHES THE RANKING ─────────────────────────────────────────
 *
 *   - A different category. Enforced by the caller's query; categories are the
 *     fixed enum in lib/schemas.ts.
 *   - Anything with no FRESH, in-stock hand-verified listing. A better product you
 *     cannot buy today is not a recommendation, and a lapsed price is not an offer.
 *   - Anything whose own verdict is not VERIFIED (good choice or acceptable).
 *     Recommending a NOT RECOMMENDED product because it happens to beat a worse
 *     one would make the word "verified" meaningless.
 *   - Anything that does not rank strictly above the scanned product on the keys
 *     above. If that leaves nothing, the caller says so rather than padding.
 */

import type { Check, Listing, Verdict } from "../schemas";

export type Candidate = {
  productId: string;
  slug: string;
  name: string;
  brand: string | null;
  sizeLabel: string | null;
  imageUrl: string | null;
  category: string;
  verdict: Verdict;
  checks: Check[];
  /** Null when no ingredient list was published, i.e. the count is unknown. */
  additiveCount: number | null;
  /** Cheapest fresh, in-stock listing, or null when there is none. */
  bestListing: Listing | null;
  evidenceSource: string;
  lastVerifiedAt: Date;
};

export type CertificationStrength = -1 | 0 | 1 | 2 | 3;

/** See ordering key 2. Higher is stronger. */
export function certificationStrength(checks: Check[]): CertificationStrength {
  const check = checks.find((c) => c.key === "certification");
  if (!check) return 0;

  const value = check.evidence.value.toLowerCase();
  if (value.includes("suspended")) return -1;
  if (check.status === "unknown") return 0;
  if (value.includes("expired")) return 1;
  if (check.status === "pass") return value.includes("accredited body") ? 3 : 2;
  return 0;
}

export function passedCount(checks: Check[]): number {
  return checks.filter((c) => c.status === "pass").length;
}

/**
 * Sorts an additive count for ordering key 3. Unknown sorts last — Infinity, not
 * zero — so a product with no published ingredient list can never win a tie-break
 * against one that published a short list.
 */
export function additiveSortKey(additiveCount: number | null): number {
  return additiveCount === null ? Number.POSITIVE_INFINITY : additiveCount;
}

/** Price per 100 g/ml, falling back to pack price when the size is unparseable. */
export function priceSortKey(listing: Listing | null): number {
  if (!listing) return Number.POSITIVE_INFINITY;
  return listing.unitPriceFils ?? listing.priceFils;
}

/**
 * The comparator. Negative when `a` should be shown before `b`.
 * Exported so the ordering itself can be unit-tested key by key.
 */
export function compareCandidates(a: Candidate, b: Candidate): number {
  // 1. more passed checks
  const passes = passedCount(b.checks) - passedCount(a.checks);
  if (passes !== 0) return passes;

  // 2. stronger certification evidence
  const certification = certificationStrength(b.checks) - certificationStrength(a.checks);
  if (certification !== 0) return certification;

  // 3. fewer additives (unknown sorts last)
  const additives = compareAscending(additiveSortKey(a.additiveCount), additiveSortKey(b.additiveCount));
  if (additives !== 0) return additives;

  // 4. cheaper per unit (no listing sorts last)
  const price = compareAscending(priceSortKey(a.bestListing), priceSortKey(b.bestListing));
  if (price !== 0) return price;

  // stable tie-break
  return a.name.localeCompare(b.name);
}

/**
 * Ascending compare where Infinity means "unknown" and always sorts last.
 * Subtracting two Infinities gives NaN, which a sort silently treats as "equal",
 * so the unknown cases are handled before any arithmetic happens.
 */
function compareAscending(a: number, b: number): number {
  if (a === b) return 0;
  if (!Number.isFinite(a)) return 1;
  if (!Number.isFinite(b)) return -1;
  return a - b;
}

/**
 * Is `candidate` strictly better than `scanned` on the ordering above?
 *
 * Deliberately `< 0` on the same comparator rather than a looser "at least as
 * good": an alternative that merely matches the scanned product is not an
 * alternative, it is a substitute, and the page would be padding.
 */
export function isBetterThan(candidate: Candidate, scanned: Candidate): boolean {
  return compareCandidates(candidate, scanned) < 0;
}

export function rankCandidates(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort(compareCandidates);
}
