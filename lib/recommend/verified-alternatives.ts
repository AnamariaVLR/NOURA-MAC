/**
 * "I scanned this. Is there a better verified alternative I can actually buy?"
 *
 * ── The pipeline, and why it is a pipeline ──────────────────────────────────
 *
 *   scanned product → exact identity → category → applicable checks
 *   → UAE catalogue → same-subcategory candidates → EVIDENCE filter
 *   → CERTIFICATION filter → COMMERCE filter → comparison → alternatives
 *
 * Each stage narrows, and each stage records WHY it dropped what it dropped.
 * That record is the difference between "No better verified option found." —
 * which tells a shopper nothing — and "three comparable olive oils were checked;
 * none had certification we could verify either." The second is an answer.
 *
 * ── The rule that matters ───────────────────────────────────────────────────
 *
 * THE DETERMINISTIC LAYER DECIDES. THE MODEL EXPLAINS.
 *
 * Nothing in this file calls a model, and nothing a model returns can add,
 * remove or reorder a candidate. The `why` strings here are assembled from the
 * comparison that actually happened; a model may later rewrite them into better
 * English keyed to the same dimensions, exactly as it does for the checklist.
 *
 * ── What "better" means ─────────────────────────────────────────────────────
 *
 * Not a score. A comparison across named evidence dimensions, where a candidate
 * must be **strictly better on at least one and worse on none**. The dimensions
 * are the ones Noura can actually evidence:
 *
 *   failed checks      fewer authoritative lines crossed
 *   certification      VERIFIED > BRAND_LEVEL_ONLY > NOT_FOUND/UNKNOWN > EXPIRED
 *   resolved checks    how much of the checklist could be answered at all
 *
 * A candidate that is merely *different* is not better, and is not shown.
 */

import { CERTIFICATION_RANK, type CertificationState } from "../health/certification";
import { isVerified } from "../health/verdict";
import { failedCount, resolvedCount, type Candidate } from "./rank";
import type { Listing } from "../schemas";

/** Why a candidate did not make it. Shown to the shopper when nothing does. */
export type RejectionReason =
  | "different-subcategory"
  | "not-verified"
  | "no-fresh-price"
  | "out-of-stock"
  | "not-better";

export const REJECTION_COPY: Record<RejectionReason, string> = {
  "different-subcategory": "a different kind of product",
  "not-verified": "we could not verify enough about it ourselves",
  "no-fresh-price": "nobody has checked its price in the last two weeks",
  "out-of-stock": "the last person to check found it out of stock",
  "not-better": "its evidence is no stronger than the product you scanned",
};

export type EvidenceDimensions = {
  /** Authoritative lines crossed. Fewer is better. */
  failedChecks: number;
  /** How much of the checklist could be answered. More is better. */
  resolvedChecks: number;
  certification: CertificationState;
};

/**
 * A candidate in the alternative comparison. Identical to a ranking Candidate —
 * the certification state rides along on that type — and named separately only
 * so the signatures below read as what they are.
 */
export type AlternativeCandidate = Candidate;

export type Considered = {
  name: string;
  slug: string;
  reason: RejectionReason;
};

export type VerifiedAlternative = {
  candidate: AlternativeCandidate;
  rank: number;
  /** The dimensions on which it beats the scanned product. Never empty. */
  betterOn: string[];
  why: string;
};

export type VerifiedAlternativesResult = {
  alternatives: VerifiedAlternative[];
  /** Everything that was looked at and dropped, with the reason. */
  considered: Considered[];
  /** How many same-subcategory products existed before any filter. */
  comparableCount: number;
  /** Set when there are no alternatives: precisely why not. */
  emptyReason: string | null;
};

export function dimensionsOf(candidate: AlternativeCandidate): EvidenceDimensions {
  return {
    failedChecks: failedCount(candidate.checks),
    resolvedChecks: resolvedCount(candidate.checks),
    certification: candidate.certification,
  };
}

/** A listing that a shopper could act on today. */
export function isBuyable(listing: Listing | null): boolean {
  return listing !== null && listing.isFresh && listing.inStock;
}

/**
 * Is `candidate` better than `scanned`, and on what?
 *
 * Strictly better on at least one dimension and worse on none. Returning the
 * list of dimensions rather than a boolean is deliberate: the page has to say
 * WHY, and a reason assembled after the fact is a reason that can drift from
 * the decision. This is the decision.
 */
export function compareEvidence(
  candidate: EvidenceDimensions,
  scanned: EvidenceDimensions,
): { better: boolean; betterOn: string[] } {
  const betterOn: string[] = [];
  let worseOnSomething = false;

  if (candidate.failedChecks < scanned.failedChecks) {
    betterOn.push("crosses fewer of the lines we check");
  } else if (candidate.failedChecks > scanned.failedChecks) {
    worseOnSomething = true;
  }

  const certDelta =
    CERTIFICATION_RANK[candidate.certification] - CERTIFICATION_RANK[scanned.certification];
  if (certDelta > 0) {
    betterOn.push(
      candidate.certification === "VERIFIED"
        ? "has a UAE certificate we verified for the exact product"
        : "has more certification evidence in the UAE register",
    );
  } else if (certDelta < 0) {
    worseOnSomething = true;
  }

  if (candidate.resolvedChecks > scanned.resolvedChecks) {
    betterOn.push("more of its evidence could be checked at all");
  } else if (candidate.resolvedChecks < scanned.resolvedChecks) {
    worseOnSomething = true;
  }

  return { better: betterOn.length > 0 && !worseOnSomething, betterOn };
}

/**
 * Order the survivors. Certification first among equals on health, because that
 * is the dimension this service exists to surface; then fewer failures, then
 * more resolved evidence, then price, then name.
 */
export function compareAlternatives(a: AlternativeCandidate, b: AlternativeCandidate): number {
  const fails = failedCount(a.checks) - failedCount(b.checks);
  if (fails !== 0) return fails;

  const cert = CERTIFICATION_RANK[b.certification] - CERTIFICATION_RANK[a.certification];
  if (cert !== 0) return cert;

  const resolved = resolvedCount(b.checks) - resolvedCount(a.checks);
  if (resolved !== 0) return resolved;

  const priceA = a.bestListing?.unitPriceFils ?? a.bestListing?.priceFils ?? Number.POSITIVE_INFINITY;
  const priceB = b.bestListing?.unitPriceFils ?? b.bestListing?.priceFils ?? Number.POSITIVE_INFINITY;
  if (priceA !== priceB) {
    if (!Number.isFinite(priceA)) return 1;
    if (!Number.isFinite(priceB)) return -1;
    return priceA - priceB;
  }

  return a.name.localeCompare(b.name);
}

/** The sentence shown when nothing qualified. Names what was actually done. */
export function explainEmpty(
  comparableCount: number,
  considered: Considered[],
  scannedCertification: CertificationState,
): string {
  if (comparableCount === 0) {
    return (
      "There is nothing else of this kind in Noura's catalogue yet, so there was nothing to " +
      "compare against. This is a gap in our data, not a statement that no better product exists."
    );
  }

  const counts = new Map<RejectionReason, number>();
  for (const c of considered) counts.set(c.reason, (counts.get(c.reason) ?? 0) + 1);

  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => `${n} because ${REJECTION_COPY[reason]}`);

  const noCertAnywhere =
    scannedCertification === "NOT_FOUND" &&
    considered.every((c) => c.reason === "not-better" || c.reason === "no-fresh-price");

  const tail = noCertAnywhere
    ? " Nothing in this category carries a UAE certificate we can verify — the register covers " +
      "technical regulations such as bottled water, electrical goods and detergents, and most " +
      "packaged food is outside its scope."
    : "";

  return (
    `${comparableCount} comparable product${comparableCount === 1 ? "" : "s"} ` +
    `${comparableCount === 1 ? "was" : "were"} checked and none qualified: ${parts.join(", ")}.${tail}`
  );
}

/**
 * The service. Pure given its inputs — the caller does the database work, which
 * keeps this testable without one and keeps the decision in one readable place.
 */
export function selectVerifiedAlternatives(
  scanned: AlternativeCandidate,
  pool: AlternativeCandidate[],
  options: { limit?: number; sameSubcategory: (a: Candidate, b: Candidate) => boolean } ,
): VerifiedAlternativesResult {
  const limit = options.limit ?? 3;
  const considered: Considered[] = [];

  // 1. SAME KIND OF PRODUCT. Olive oil is compared with olive oil. A shopper
  //    holding a bottle of oil is not helped by a recommendation to buy milk.
  const comparable = pool.filter((c) => {
    if (c.productId === scanned.productId) return false;
    if (!options.sameSubcategory(c, scanned)) return false;
    return true;
  });

  const surviving: AlternativeCandidate[] = [];
  for (const candidate of comparable) {
    const note = (reason: RejectionReason) =>
      considered.push({ name: candidate.name, slug: candidate.slug, reason });

    // 2. EVIDENCE. We will not recommend what we could not verify ourselves.
    if (!isVerified(candidate.verdict)) {
      note("not-verified");
      continue;
    }

    // 3. COMMERCE. A better product you cannot buy today is not a recommendation,
    //    and a lapsed price is not an offer.
    if (candidate.bestListing === null) {
      note("no-fresh-price");
      continue;
    }
    if (!candidate.bestListing.inStock) {
      note("out-of-stock");
      continue;
    }

    // 4. BETTER, on named dimensions, strictly.
    const comparison = compareEvidence(dimensionsOf(candidate), dimensionsOf(scanned));
    if (!comparison.better) {
      note("not-better");
      continue;
    }

    surviving.push(candidate);
  }

  const ranked = [...surviving].sort(compareAlternatives).slice(0, limit);

  const alternatives: VerifiedAlternative[] = ranked.map((candidate, index) => {
    const { betterOn } = compareEvidence(dimensionsOf(candidate), dimensionsOf(scanned));
    return {
      candidate,
      rank: index + 1,
      betterOn,
      why: `Suggested because it ${betterOn.join(", and ")}.`,
    };
  });

  return {
    alternatives,
    considered,
    comparableCount: comparable.length,
    emptyReason:
      alternatives.length === 0
        ? explainEmpty(comparable.length, considered, scanned.certification)
        : null,
  };
}
