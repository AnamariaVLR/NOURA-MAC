/**
 * The operational view: what do we know about each product, and what is missing?
 *
 * This is the working surface for closing evidence gaps. It answers, per
 * product, the only questions that decide whether Noura can say anything useful:
 * which sources were asked, what each returned, whether the match was exact or
 * brand-level, and whether anyone has verified a price or seen it on a shelf.
 *
 * Deliberately no aggregate score. "72% covered" would invite treating coverage
 * as progress rather than as a description of what is still unknown.
 */

import { prisma } from "../db";
import { ageInDays, isFreshCheck } from "../retail/freshness";
import { CLAIM_LABEL, planFor, type EvidenceClaim } from "./registry";

export type ClaimCell = {
  claim: EvidenceClaim;
  label: string;
  /** Null when no source has been asked this question at all. */
  state: string | null;
  sourceName: string | null;
  referenceNumber: string | null;
  retrievedAt: Date | null;
};

export type CoverageRow = {
  productId: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string;
  barcode: string | null;
  claims: ClaimCell[];
  /** Buckets A-F from the coverage summary. */
  hasVerified: boolean;
  hasBrandLevel: boolean;
  hasNotFound: boolean;
  hasUnknown: boolean;
  priceMissing: boolean;
  availabilityMissing: boolean;
  availabilityStale: boolean;
  listingCount: number;
  lastCheckedAt: Date | null;
};

export type CoverageSummary = {
  products: number;
  /** A-F, exactly as the operational buckets are named. */
  verified: number;
  brandLevelOnly: number;
  notFoundInSource: number;
  unknown: number;
  priceMissing: number;
  availabilityMissing: number;
};

export async function evidenceCoverage(now: Date = new Date()): Promise<{
  rows: CoverageRow[];
  summary: CoverageSummary;
}> {
  const products = await prisma.product.findMany({
    include: {
      evidenceLookups: true,
      listings: { include: { checks: { orderBy: { checkedAt: "desc" }, take: 1 } } },
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  const rows: CoverageRow[] = products.map((product) => {
    const plan = planFor(product.category as never);
    const wanted = plan?.claims ?? [];

    const claims: ClaimCell[] = wanted.map((claim) => {
      const row = product.evidenceLookups.find((l) => l.claim === claim);
      return {
        claim,
        label: CLAIM_LABEL[claim],
        state: row?.state ?? null,
        sourceName: row?.sourceName ?? null,
        referenceNumber: row?.referenceNumber ?? null,
        retrievedAt: row?.retrievedAt ?? null,
      };
    });

    const states = claims.map((c) => c.state);
    const checks = product.listings.flatMap((l) => l.checks);
    const newest = checks
      .map((c) => c.checkedAt)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const fresh = checks.filter((c) => isFreshCheck(c as never, now));

    return {
      productId: product.id,
      slug: product.slug,
      name: product.name,
      brand: product.brand,
      category: product.category,
      barcode: product.barcode,
      claims,
      hasVerified: states.includes("VERIFIED"),
      hasBrandLevel: states.includes("BRAND_LEVEL_ONLY"),
      hasNotFound: states.includes("NOT_FOUND"),
      // A claim nobody has asked about is as unknown as a failed query.
      hasUnknown: states.includes("UNKNOWN") || states.includes(null),
      priceMissing: checks.length === 0,
      availabilityMissing: checks.length === 0,
      availabilityStale: checks.length > 0 && fresh.length === 0,
      listingCount: product.listings.length,
      lastCheckedAt: newest,
    };
  });

  return {
    rows,
    summary: {
      products: rows.length,
      verified: rows.filter((r) => r.hasVerified).length,
      brandLevelOnly: rows.filter((r) => !r.hasVerified && r.hasBrandLevel).length,
      notFoundInSource: rows.filter((r) => !r.hasVerified && !r.hasBrandLevel && r.hasNotFound).length,
      unknown: rows.filter((r) => r.hasUnknown).length,
      priceMissing: rows.filter((r) => r.priceMissing).length,
      availabilityMissing: rows.filter((r) => r.availabilityMissing).length,
    },
  };
}
