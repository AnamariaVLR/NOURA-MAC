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
  | "out-of-stock"
  | "not-better";

export const REJECTION_COPY: Record<RejectionReason, string> = {
  "different-subcategory": "a different kind of product",
  "not-verified": "we could not verify enough about it ourselves",
  "out-of-stock": "the last person to check the shelf found it out of stock",
  "not-better": "its evidence is no stronger than the product you scanned",
};

/**
 * What we can tell a shopper about buying this, which is a separate question
 * from whether it is a better product.
 *
 * A missing price is DISCLOSED, never used to hide an alternative. A better
 * product we cannot price is still a better product, and "we have not verified
 * a price for this yet" is an honest thing to print; quietly dropping it would
 * let a data gap masquerade as a judgement about the product.
 */
export type CommerceStatus = "PRICED" | "AVAILABILITY_STALE" | "PRICE_UNVERIFIED";

export const COMMERCE_COPY: Record<CommerceStatus, string> = {
  PRICED: "Price verified by hand",
  // Someone HAS checked; the check is simply too old to quote. Saying "no price"
  // would throw away real work and misdescribe what we know.
  AVAILABILITY_STALE: "Availability not verified recently",
  PRICE_UNVERIFIED: "Price not verified yet",
};

/**
 * One structured reason why an alternative beats the scan, on one dimension.
 *
 * The page and the model both read THIS, never a sentence someone wrote by
 * hand. A reason assembled after the decision can drift from the decision; a
 * reason that IS the decision cannot. The `sentence` is a readable default the
 * LLM may rewrite — it may not add, drop or reorder a reason.
 */
export type EvidenceDifference = {
  dimension: "failed_checks" | "resolved_evidence" | "certification";
  scanned: string;
  alternative: string;
  evidence: string;
  source: string;
  sentence: string;
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
  /** The same decision, structured. What the LLM is given to explain. */
  differences: EvidenceDifference[];
  why: string;
  /** Whether we can quote a price, stated either way. Never a silent omission. */
  commerce: CommerceStatus;
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

/** "a", "a and b", "a, b and c" — a list a person would actually say. */
function sentenceList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export function dimensionsOf(candidate: AlternativeCandidate): EvidenceDimensions {
  return {
    failedChecks: failedCount(candidate.checks),
    resolvedChecks: resolvedCount(candidate.checks),
    certification: candidate.certification,
  };
}

/**
 * A listing a shopper could act on today.
 *
 * `inStock === null` means nobody recorded availability, which is not a reason
 * to withhold a known price — only a recorded FALSE is.
 */
export function isBuyable(listing: Listing | null): boolean {
  return listing !== null && listing.isFresh && listing.priceFils !== null && listing.inStock !== false;
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
): { better: boolean; differences: EvidenceDifference[]; betterOn: string[] } {
  const differences: EvidenceDifference[] = [];
  let worseOnSomething = false;

  if (candidate.failedChecks < scanned.failedChecks) {
    differences.push({
      dimension: "failed_checks",
      scanned: `${scanned.failedChecks} lines crossed`,
      alternative: `${candidate.failedChecks} lines crossed`,
      evidence: "Category checklist, applied to both products on the same per-100 basis",
      source: "RUBRIC.md §3-§4",
      sentence: "crosses fewer of the lines we check",
    });
  } else if (candidate.failedChecks > scanned.failedChecks) {
    worseOnSomething = true;
  }

  const certDelta =
    CERTIFICATION_RANK[candidate.certification] - CERTIFICATION_RANK[scanned.certification];
  if (certDelta > 0) {
    differences.push({
      dimension: "certification",
      scanned: scanned.certification,
      alternative: candidate.certification,
      evidence:
        candidate.certification === "VERIFIED"
          ? "A live certificate in the UAE conformity register matched on this exact barcode"
          : "The register holds a record for the brand, not for this exact product",
      source: "MOIAT Conformity Register",
      sentence:
        candidate.certification === "VERIFIED"
          ? "has a UAE certificate we verified for the exact product"
          : "has more certification evidence in the UAE register",
    });
  } else if (certDelta < 0) {
    worseOnSomething = true;
  }

  if (candidate.resolvedChecks > scanned.resolvedChecks) {
    differences.push({
      dimension: "resolved_evidence",
      scanned: `${scanned.resolvedChecks} checks resolved`,
      alternative: `${candidate.resolvedChecks} checks resolved`,
      evidence: "How many applicable checks could be answered at all, rather than left UNKNOWN",
      source: "Open Food Facts evidence held for each product",
      sentence: "has more of its evidence available to check",
    });
  } else if (candidate.resolvedChecks < scanned.resolvedChecks) {
    worseOnSomething = true;
  }

  return {
    better: differences.length > 0 && !worseOnSomething,
    differences,
    betterOn: differences.map((d) => d.sentence),
  };
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

  // A verified price is itself evidence; an alternative we can price beats an
  // otherwise identical one we cannot.
  const priced = Number(b.bestListing !== null) - Number(a.bestListing !== null);
  if (priced !== 0) return priced;

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
    scannedCertification === "NOT_FOUND" && considered.every((c) => c.reason === "not-better");

  const tail = noCertAnywhere
    ? " Nothing in this category carries a UAE certificate we could verify. The register does " +
      "cover food, but listing is driven by manufacturers applying for certificates, and in " +
      "this category none of them has."
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

    // 3. COMMERCE. A verified out-of-stock is a reason not to send someone to a
    //    shelf. A MISSING price is not: it is a gap in our data, and the honest
    //    response is to print the gap, not to bury the alternative behind it.
    if (candidate.bestListing !== null && !candidate.bestListing.inStock) {
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
    const { betterOn, differences } = compareEvidence(dimensionsOf(candidate), dimensionsOf(scanned));
    return {
      candidate,
      rank: index + 1,
      betterOn,
      differences,
      why: `Suggested because it ${sentenceList(betterOn)}.`,
      commerce:
        candidate.bestListing !== null
          ? "PRICED"
          : candidate.staleListing !== null
            ? "AVAILABILITY_STALE"
            : "PRICE_UNVERIFIED",
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
