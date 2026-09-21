/**
 * Ranking better alternatives — RUBRIC.md §8. Pure: no database, no model, no clock.
 *
 * ── THE ORDERING ───────────────────────────────────────────────────────────
 *
 * Candidates are compared on a strict priority order. A later key is consulted
 * only when every earlier key ties.
 *
 *   R1. FEWER FAILED CHECKS (ascending)  — POLICY
 *       A product that crosses fewer authoritative lines is better on the only
 *       basis Noura can evidence.
 *
 *       THIS IS A CHANGE OF THE PRIMARY KEY, and the reason is a real defect.
 *       The shipped code ranked on PASSED checks, which rewards a product for
 *       having more checkable dimensions rather than for being better: the audit
 *       found a GOOD CHOICE bottled water at AED 1.75 ranked below an ACCEPTABLE
 *       oat drink at AED 24.00, because the oat drink published more. Counting
 *       failures removes that bias — a product cannot look worse merely because
 *       more is published about it.
 *
 *   R2. HIGHER PASS RATIO (descending)  — POLICY
 *       Among products with equal failures, the one that passes a higher share of
 *       what could be checked. Second, not first: a ratio alone would reward
 *       silence, which is what R3 then corrects for.
 *
 *   R3. STRONGER EVIDENCE (descending)  — POLICY
 *       Resolved-check count first, then certification strength:
 *       valid + accredited body (3) > valid, body unnamed (2) > expired (1) >
 *       none found (0) > suspended (-1). A suspended certificate ranks below
 *       having none at all: an active regulator warning is worse than silence.
 *       This is where knowing more about a product pays — AFTER the health
 *       question is settled, never before it.
 *
 *   R-category. THE CATEGORY'S OWN "BETTER" ATTRIBUTES, in the order its §4
 *       section lists them. This is what makes "better" mean something specific:
 *       better bread is higher fibre first, better yogurt is no added sugar then
 *       protein, better olive oil is the polyphenol claim. Eggs declare an EMPTY
 *       list, because C4.4.4 says "better" within eggs is UNKNOWN and Noura will
 *       not manufacture a ranking.
 *
 *   R4. LOWER PRICE PER UNIT (ascending)  — POLICY
 *       Cheapest per 100 g/ml among in-stock listings, so a 1 L carton is compared
 *       with a 250 ml one honestly. Last, because Noura is not a price comparison
 *       site: price decides only between options that are equally well evidenced.
 *
 *   R5. PRODUCT NAME (alphabetical)  — POLICY
 *       A stable tie-break, so the same data always renders in the same order.
 *
 * ── WHAT NEVER REACHES THE RANKING ─────────────────────────────────────────
 *
 *   - A different SUBCATEGORY (R6, C4.0.1). Not merely a different category: an
 *     oat drink and a bottled water are already separated by category under the
 *     eleven-category model, and laban is separated from spoonable yogurt by
 *     subcategory. Noura never claims water is better than yoghurt.
 *   - Anything with no FRESH, in-stock hand-verified listing. A better product you
 *     cannot buy today is not a recommendation, and a lapsed price is not an offer.
 *   - Anything whose own verdict is not VERIFIED. Recommending a NOT RECOMMENDED
 *     product because it happens to beat a worse one would make "verified"
 *     meaningless.
 *   - Anything that does not rank STRICTLY above the scanned product. An equal
 *     product is a substitute, not an alternative, and the page would be padding.
 */

import { ruleFor } from "../health/categories";
import type { BetterAttribute } from "../health/categories/types";
import { FIBRE } from "../health/rubric";
import { fibrePer100Kcal, proteinEnergyShare } from "../health/energy";
import type { Check, Listing, NutritionFacts, ProductCategory, Verdict } from "../schemas";

export type Candidate = {
  /**
   * The five-state UAE certification reading for this product. Carried on the
   * candidate because the alternative comparison is partly about it, and
   * recomputing it per comparison would be both slow and a chance to disagree.
   */
  certification: import("../health/certification").CertificationState;
  /**
   * The newest listing check even when it is too old to quote, so the page can
   * distinguish "nobody has ever checked" from "the last check has lapsed".
   * Those are different things to tell a shopper, and collapsing them into a
   * single blank was hiding work that has actually been done.
   */
  staleListing: import("../schemas").Listing | null;
  productId: string;
  slug: string;
  name: string;
  brand: string | null;
  sizeLabel: string | null;
  imageUrl: string | null;
  category: ProductCategory;
  /** RUBRIC.md §4 C4.0.1. Null resolves to the category's default. */
  subcategory: string | null;
  verdict: Verdict;
  checks: Check[];
  /** Needed by the category "better" attributes. Null when no panel exists. */
  nutrition: NutritionFacts | null;
  /** Null when no ingredient list was published, i.e. the count is unknown. */
  additiveCount: number | null;
  /** Cheapest fresh, in-stock listing, or null when there is none. */
  bestListing: Listing | null;
  evidenceSource: string;
  lastVerifiedAt: Date;
};

export type CertificationStrength = -1 | 0 | 1 | 2 | 3;

/** See R3. Higher is stronger. */
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

/** R1's key. */
export function failedCount(checks: Check[]): number {
  return checks.filter((c) => c.status === "fail").length;
}

/** R3's first half: how much of the checklist could actually be resolved. */
export function resolvedCount(checks: Check[]): number {
  return checks.filter((c) => c.status !== "unknown").length;
}

/** R2's key. Zero resolved checks gives 0, which sorts last, never first. */
export function passRatio(checks: Check[]): number {
  const resolved = resolvedCount(checks);
  return resolved === 0 ? 0 : passedCount(checks) / resolved;
}

/**
 * Sorts an additive count. Unknown sorts last — Infinity, not zero — so a product
 * with no published ingredient list can never win a tie-break against one that
 * published a short list.
 */
export function additiveSortKey(additiveCount: number | null): number {
  return additiveCount === null ? Number.POSITIVE_INFINITY : additiveCount;
}

/** Price per 100 g/ml, falling back to pack price when the size is unparseable. */
export function priceSortKey(listing: Listing | null): number {
  if (!listing) return Number.POSITIVE_INFINITY;
  // A listing with availability but no price sorts last rather than first: it is
  // not cheaper, it is simply unpriced, and a null must never read as zero.
  return listing.unitPriceFils ?? listing.priceFils ?? Number.POSITIVE_INFINITY;
}

/**
 * One category "better" attribute, as a sortable number where LOWER is better.
 * Unknown is Infinity, so absent data never wins a tie-break (the rule that makes
 * the whole comparison safe).
 */
function attributeKey(attribute: BetterAttribute, c: Candidate): number {
  const n = c.nutrition;
  const check = (key: string) => c.checks.find((x) => x.key === key);

  switch (attribute) {
    case "noAddedSugar": {
      const status = check("addedSugars")?.status;
      // pass (no added sugar) 0 < fail 1 < unknown 2.
      return status === "pass" ? 0 : status === "fail" ? 1 : 2;
    }
    case "lowerTotalSugars":
      return n?.sugarsG ?? Number.POSITIVE_INFINITY;
    case "lowerSaturatedFat":
      return n?.saturatedFatG ?? Number.POSITIVE_INFINITY;
    case "lowerSalt":
      return n?.saltG ?? Number.POSITIVE_INFINITY;
    case "higherProtein": {
      // U4.3's own measure, not an absolute mass: a share of energy.
      const share = proteinEnergyShare(n);
      return share === null ? Number.POSITIVE_INFINITY : -share;
    }
    case "higherFibre": {
      // U4.1 allows either basis, so use whichever the panel supports.
      const perKcal = fibrePer100Kcal(n);
      const grams = n?.fibreG ?? null;
      if (grams === null && perKcal === null) return Number.POSITIVE_INFINITY;
      const normalised = Math.max(
        grams === null ? 0 : grams / FIBRE.highPer100g,
        perKcal === null ? 0 : perKcal / FIBRE.highPer100Kcal,
      );
      return -normalised;
    }
    case "fewerAdditives":
      return additiveSortKey(c.additiveCount);
    case "polyphenolClaim":
    case "extraVirginGrade":
      // C4.1.5 and C4.1.6 are notes, not data Noura holds for a real product:
      // the polyphenol figure is not in any database it reads and grade is not a
      // column. Ranking on them would be ranking on nothing, so they tie until
      // there is a field behind them. RUBRIC §4.1's "honest limitation".
      return 0;
  }
}

/**
 * The comparator. Negative when `a` should be shown before `b`.
 * Exported so the ordering itself can be unit-tested key by key.
 */
export function compareCandidates(a: Candidate, b: Candidate): number {
  // R1 — fewer failed checks.
  const fails = failedCount(a.checks) - failedCount(b.checks);
  if (fails !== 0) return fails;

  // R2 — higher pass ratio.
  const ratio = passRatio(b.checks) - passRatio(a.checks);
  if (Math.abs(ratio) > 1e-9) return ratio;

  // R3 — stronger evidence: how much was resolvable, then certification.
  const resolved = resolvedCount(b.checks) - resolvedCount(a.checks);
  if (resolved !== 0) return resolved;
  const certification = certificationStrength(b.checks) - certificationStrength(a.checks);
  if (certification !== 0) return certification;

  // R-category — the attributes this category's §4 section names as "better",
  // in its order. Eggs declare none, and fall straight through to price.
  for (const attribute of ruleFor(a.category).better) {
    const byAttribute = compareAscending(attributeKey(attribute, a), attributeKey(attribute, b));
    if (byAttribute !== 0) return byAttribute;
  }

  // R4 — cheaper per unit (no listing sorts last).
  const price = compareAscending(priceSortKey(a.bestListing), priceSortKey(b.bestListing));
  if (price !== 0) return price;

  // R5 — stable tie-break.
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
 * R6 — is `candidate` comparable with `scanned` at all?
 *
 * Same category AND same subcategory. The subcategory half is what keeps laban
 * out of the alternatives for a pot of yoghurt: they are the same category by
 * S5's own boundaries, and they are not the same purchase.
 */
export function isComparable(candidate: Candidate, scanned: Candidate): boolean {
  if (candidate.category !== scanned.category) return false;
  const rule = ruleFor(scanned.category);
  const key = (c: Candidate) => c.subcategory ?? rule.defaultSubcategory;
  return key(candidate) === key(scanned);
}

/**
 * Is `candidate` strictly better than `scanned` on the ordering above?
 *
 * Deliberately `< 0` on the same comparator rather than a looser "at least as
 * good": an alternative that merely matches the scanned product is not an
 * alternative, it is a substitute.
 */
export function isBetterThan(candidate: Candidate, scanned: Candidate): boolean {
  if (!isComparable(candidate, scanned)) return false;
  return compareCandidates(candidate, scanned) < 0;
}

export function rankCandidates(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort(compareCandidates);
}
