/**
 * Stage 6 — "here are the best verified choices for you."
 *
 * Loads same-category candidates, evaluates each one against the same rubric as the
 * scanned product, filters out everything that cannot honestly be recommended, and
 * ranks what remains with the comparator in ./rank.ts (which documents the
 * ordering). No model is involved: recommending a product is exactly the kind of
 * judgement that has to be reproducible.
 */

import { prisma } from "../db";
import { hasIngredientList } from "../health/added-sugar";
import { unitPriceFils } from "../format";
import { evaluateProduct } from "../health/evaluate";
import { isVerified } from "../health/verdict";
import { certificationFor } from "../health/checks";
import { buildEvidenceInput, type CertificationWithBody } from "../pipeline/analyze";
import { ageInDays, isFreshCheck } from "../retail/freshness";
import { ListingSchema, type Check, type Listing, type ProductCategory } from "../schemas";
import { compareCandidates, isBetterThan, passedCount, type Candidate } from "./rank";
import { isComparable } from "./rank";
import {
  selectVerifiedAlternatives,
  type AlternativeCandidate,
  type VerifiedAlternativesResult,
} from "./verified-alternatives";

export type Alternative = Candidate & {
  /** 1, 2 or 3 — the medal rank shown on the page. */
  rank: number;
  /** One line: what this passes that the scanned product does not. */
  why: string;
  /** Keys of the checks behind `why`, so the UI can highlight them. */
  whyKeys: string[];
};

export type AlternativesResult = {
  alternatives: Alternative[];
  /** Shown verbatim when the list is empty. Never padded. */
  emptyMessage: string | null;
};

export const NO_BETTER_OPTION = "No better verified option found.";

/**
 * Turns a listing and its newest check into a Listing. Returns null when the
 * listing has never been checked: there is no price to show, and inventing one is
 * the whole thing this app exists not to do.
 */
function toListing(
  listing: {
    id: string;
    url: string | null;
    retailer: { slug: string; name: string; websiteUrl: string };
    checks: Array<{
      priceFils: number;
      currency: string;
      sizeLabel: string;
      inStock: boolean;
      checkedBy: string;
      checkedAt: Date;
      retailerUrl: string | null;
      source: string;
      photoPath: string | null;
    }>;
  },
  now: Date,
): Listing | null {
  const check = listing.checks[0];
  if (!check) return null;

  const parsed = ListingSchema.safeParse({
    id: listing.id,
    retailer: {
      slug: listing.retailer.slug,
      name: listing.retailer.name,
      websiteUrl: listing.retailer.websiteUrl,
    },
    priceFils: check.priceFils,
    currency: check.currency,
    sizeLabel: check.sizeLabel,
    unitPriceFils: unitPriceFils(check.priceFils, check.sizeLabel),
    inStock: check.inStock,
    url: check.retailerUrl ?? listing.url ?? listing.retailer.websiteUrl,
    source: {
      name: `Checked by ${check.checkedBy}`,
      url: check.retailerUrl ?? listing.url ?? null,
      lastVerifiedAt: check.checkedAt.toISOString(),
    },
    sourceKind: check.source,
    checkedBy: check.checkedBy,
    checkedAt: check.checkedAt.toISOString(),
    ageDays: ageInDays(check.checkedAt, now),
    isFresh: isFreshCheck(check, now),
    hasPhoto: Boolean(check.photoPath),
  });

  // A listing we cannot validate is a price we should not show.
  return parsed.success ? parsed.data : null;
}

/**
 * Builds the "Why" line from the checks this alternative passes that the scanned
 * product fails. That intersection is the whole justification for the swap, so if
 * it is empty we say something weaker and true rather than inventing a reason.
 */
export function buildWhy(
  candidateChecks: Check[],
  scannedChecks: Check[],
): { why: string; whyKeys: string[] } {
  const scannedFailures = new Set(
    scannedChecks.filter((c) => c.status === "fail").map((c) => c.key),
  );
  const wins = candidateChecks.filter((c) => c.status === "pass" && scannedFailures.has(c.key));

  if (wins.length > 0) {
    const claims = wins.slice(0, 3).map((c) => c.claim.toLowerCase());
    const joined =
      claims.length === 1
        ? claims[0]
        : `${claims.slice(0, -1).join(", ")} and ${claims[claims.length - 1]}`;
    return { why: `Passes where this one fails: ${joined}.`, whyKeys: wins.map((c) => c.key) };
  }

  // No direct overlap: it wins on breadth of evidence rather than on a specific
  // failure. Say exactly that.
  return {
    why: `Passes ${passedCount(candidateChecks)} checks against this product's ${passedCount(scannedChecks)}.`,
    whyKeys: [],
  };
}

function additiveCountOf(additives: string[], ingredientsText: string | null): number | null {
  // Mirrors the additives check, through the same predicate: no additives AND no
  // readable ingredient list means unknown, not zero.
  if (additives.length === 0 && !hasIngredientList(ingredientsText)) return null;
  return additives.length;
}

/** Turns a product row plus its relations into a ranked-candidate shape. */
function toCandidate(
  product: {
    id: string;
    slug: string;
    name: string;
    brand: string | null;
    sizeLabel: string | null;
    imageUrl: string | null;
    category: string;
    subcategory: string | null;
    nutritionJson: string | null;
    additivesJson: string | null;
    ingredientsText: string | null;
    evidenceSource: string;
    lastVerifiedAt: Date;
    certifications: CertificationWithBody[];
    evidenceLookups?: import("@prisma/client").EvidenceLookup[];
    listings: Parameters<typeof toListing>[0][];
  },
  now: Date,
): Candidate {
  const input = buildEvidenceInput(
    product as never,
    product.certifications,
    product.evidenceLookups ?? [],
  );
  const evaluation = evaluateProduct(input);

  // Buyable means: somebody checked it recently, and it was in stock when they did.
  // A lapsed check is not a price and an out-of-stock shelf is not an option.
  const buyable = product.listings
    .map((listing) => toListing(listing, now))
    .filter((l): l is Listing => l !== null && l.isFresh && l.inStock)
    .sort((a, b) => (a.unitPriceFils ?? a.priceFils) - (b.unitPriceFils ?? b.priceFils));

  // The newest check of any kind, fresh or not. Used only to say WHY there is no
  // price, never as a price.
  const anyChecked = product.listings
    .map((listing) => toListing(listing, now))
    .filter((l): l is Listing => l !== null)
    .sort((a, b) => a.ageDays - b.ageDays);

  const certification = certificationFor(input).state;

  return {
    certification,
    staleListing: buyable.length === 0 ? (anyChecked[0] ?? null) : null,
    productId: product.id,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    sizeLabel: product.sizeLabel,
    imageUrl: product.imageUrl,
    category: input.category,
    subcategory: product.subcategory,
    verdict: evaluation.verdict.verdict,
    checks: evaluation.checks,
    // The category "better" attributes of §8 read the panel directly — protein as
    // a share of energy (U4.3), fibre on either of S12's two bases (U4.1) — so
    // the candidate has to carry it.
    nutrition: input.nutrition,
    additiveCount: additiveCountOf(input.additives, product.ingredientsText),
    bestListing: buyable[0] ?? null,
    evidenceSource: product.evidenceSource,
    lastVerifiedAt: product.lastVerifiedAt,
  };
}

export async function findAlternatives(args: {
  category: ProductCategory;
  scannedProductId: string;
  scannedChecks: Check[];
  limit?: number;
  /** Injectable for tests; defaults to the wall clock. */
  now?: Date;
}): Promise<AlternativesResult> {
  const { category, scannedProductId, scannedChecks, limit = 3, now = new Date() } = args;

  const include = {
    certifications: { include: { body: true } },
    evidenceLookups: true,
    listings: { include: { retailer: true, checks: { orderBy: { checkedAt: "desc" as const }, take: 1 } } },
  };

  // R6 — same category, and then same SUBCATEGORY, which isBetterThan enforces
  // below. The query narrows on category because that is the indexed column; the
  // subcategory half is applied in isComparable so there is one place to read the
  // rule rather than two.
  const rows = await prisma.product.findMany({
    where: { category, id: { not: scannedProductId } },
    include,
  });

  const scanned = await prisma.product.findUnique({ where: { id: scannedProductId }, include });

  const scannedCandidate: Candidate | null = scanned
    ? { ...toCandidate(scanned as never, now), checks: scannedChecks }
    : null;

  const eligible = rows
    .map((row) => toCandidate(row as never, now))
    // 1. must be buyable today: a fresh hand-verified check that said in stock
    .filter((c) => c.bestListing !== null)
    // 2. must be something we can actually stand behind
    .filter((c) => isVerified(c.verdict))
    // 3. must beat the scanned product on the documented ordering
    .filter((c) => (scannedCandidate ? isBetterThan(c, scannedCandidate) : true));

  const ranked = [...eligible].sort(compareCandidates).slice(0, limit);

  const alternatives: Alternative[] = ranked.map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
    ...buildWhy(candidate.checks, scannedChecks),
  }));

  return {
    alternatives,
    emptyMessage: alternatives.length === 0 ? NO_BETTER_OPTION : null,
  };
}

/* ===========================================================================
 * findVerifiedAlternatives — the service the product promise rests on.
 *
 * "I scanned this. If there is a better verified alternative I can actually buy
 * in the UAE, show it to me."
 *
 * This is the database half; the decision itself is in ./verified-alternatives,
 * which is pure and therefore testable without a database. Nothing here calls a
 * model. The deterministic layer decides; the model may later rewrite the `why`
 * into better English, keyed to the same dimensions.
 * ========================================================================= */

export async function findVerifiedAlternatives(args: {
  productId: string;
  /** The scanned product's own checklist, as persisted against the scan. */
  scannedChecks?: Check[];
  limit?: number;
  now?: Date;
}): Promise<VerifiedAlternativesResult & { scanned: AlternativeCandidate | null }> {
  const { productId, scannedChecks, limit = 3, now = new Date() } = args;

  const include = {
    certifications: { include: { body: true } },
    evidenceLookups: true,
    listings: {
      include: { retailer: true, checks: { orderBy: { checkedAt: "desc" as const }, take: 1 } },
    },
  };

  const scannedRow = await prisma.product.findUnique({ where: { id: productId }, include });
  if (!scannedRow) {
    return {
      alternatives: [],
      considered: [],
      comparableCount: 0,
      emptyReason: "We no longer hold that product, so there was nothing to compare against.",
      scanned: null,
    };
  }

  // Narrow on the indexed column; the subcategory half of "same kind of
  // product" is applied by isComparable, so the rule lives in one place.
  const rows = await prisma.product.findMany({
    where: { category: scannedRow.category, id: { not: productId } },
    include,
  });

  const scanned: AlternativeCandidate = {
    ...toCandidate(scannedRow as never, now),
    // The scan's own persisted checklist wins over a recomputation: it is what
    // the shopper is actually looking at on the page.
    ...(scannedChecks ? { checks: scannedChecks } : {}),
  };

  const pool = rows.map((row) => toCandidate(row as never, now));

  const result = selectVerifiedAlternatives(scanned, pool, {
    limit,
    sameSubcategory: isComparable,
  });

  return { ...result, scanned };
}
