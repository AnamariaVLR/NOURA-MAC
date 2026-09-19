/**
 * The data behind /admin/listings: what needs checking, and how badly.
 *
 * The page is a work queue, so the ordering is the point. Never checked comes
 * first, then the most overdue. A person with ten minutes should be able to work
 * top-down and spend it where it matters.
 */

import { prisma } from "../db";
import { formatAed } from "../format";
import { ageInDays, daysUntilStale, stalenessOf, type Staleness } from "./freshness";

export type ListingRow = {
  listingId: string;
  productId: string;
  productName: string;
  productBrand: string | null;
  productSlug: string;
  category: string;
  retailerName: string;
  retailerSlug: string;
  retailerUrl: string | null;
  sizeLabel: string;

  staleness: Staleness;
  /** Null when never checked. */
  lastCheckedAt: Date | null;
  lastCheckedBy: string | null;
  ageDays: number | null;
  daysLeft: number | null;
  priceFils: number | null;
  priceLabel: string | null;
  inStock: boolean | null;
  hasPhoto: boolean;
  checkCount: number;
};

/** Sort weight by state: never checked is the most urgent thing on the page. */
const STALENESS_ORDER: Record<Staleness, number> = {
  "never-checked": 0,
  "not-evidence": 1,
  stale: 2,
  fresh: 3,
};

export type ListingQueue = {
  rows: ListingRow[];
  counts: Record<Staleness, number>;
  total: number;
};

export async function listingQueue(now: Date = new Date()): Promise<ListingQueue> {
  const listings = await prisma.productListing.findMany({
    include: {
      product: true,
      retailer: true,
      checks: { orderBy: { checkedAt: "desc" }, take: 1 },
      _count: { select: { checks: true } },
    },
  });

  const rows: ListingRow[] = listings.map((listing) => {
    const check = listing.checks[0] ?? null;
    const staleness = stalenessOf(check, now);

    return {
      listingId: listing.id,
      productId: listing.product.id,
      productName: listing.product.name,
      productBrand: listing.product.brand,
      productSlug: listing.product.slug,
      category: listing.product.category,
      retailerName: listing.retailer.name,
      retailerSlug: listing.retailer.slug,
      retailerUrl: check?.retailerUrl ?? listing.url,
      sizeLabel: listing.sizeLabel,

      staleness,
      lastCheckedAt: check?.checkedAt ?? null,
      lastCheckedBy: check?.checkedBy ?? null,
      ageDays: check ? ageInDays(check.checkedAt, now) : null,
      daysLeft: check && staleness === "fresh" ? daysUntilStale(check.checkedAt, now) : null,
      priceFils: check?.priceFils ?? null,
      priceLabel: check ? formatAed(check.priceFils) : null,
      inStock: check?.inStock ?? null,
      hasPhoto: Boolean(check?.photoPath),
      checkCount: listing._count.checks,
    };
  });

  rows.sort((a, b) => {
    // 1. Staleness: never checked is the most urgent thing on the page.
    const state = STALENESS_ORDER[a.staleness] - STALENESS_ORDER[b.staleness];
    if (state !== 0) return state;

    // 2. Oldest first: the most overdue check is the most useful one to redo.
    if (a.ageDays !== null && b.ageDays !== null && a.ageDays !== b.ageDays) {
      return b.ageDays - a.ageDays;
    }

    // 3. Retailer, then product. A checker is standing in ONE shop and wants every
    //    row for that shop together; sorting by product first scatters a single
    //    trip across the whole list.
    return (
      a.retailerName.localeCompare(b.retailerName) || a.productName.localeCompare(b.productName)
    );
  });

  const counts: Record<Staleness, number> = {
    fresh: 0,
    stale: 0,
    "never-checked": 0,
    "not-evidence": 0,
  };
  for (const row of rows) counts[row.staleness] += 1;

  return { rows, counts, total: rows.length };
}

/**
 * Records one check. Kept here rather than in the route handler so the CSV importer
 * and the form go through exactly the same path — including the source, which is
 * not a caller's choice.
 */
export async function recordCheck(input: {
  listingId: string;
  priceFils: number;
  sizeLabel: string;
  inStock: boolean;
  checkedBy: string;
  checkedAt: Date;
  retailerUrl: string | null;
  note: string | null;
  photoPath?: string | null;
  photoMime?: string | null;
}): Promise<{ id: string }> {
  const check = await prisma.listingCheck.create({
    data: {
      listingId: input.listingId,
      priceFils: input.priceFils,
      currency: "AED",
      sizeLabel: input.sizeLabel,
      inStock: input.inStock,
      checkedBy: input.checkedBy,
      checkedAt: input.checkedAt,
      retailerUrl: input.retailerUrl,
      note: input.note,
      photoPath: input.photoPath ?? null,
      photoMime: input.photoMime ?? null,
      // Not a parameter. Anything recorded through this function is a human check;
      // nothing in the app can mint a HAND_VERIFIED row any other way.
      source: "HAND_VERIFIED",
    },
  });
  return { id: check.id };
}

/**
 * Parses the price as typed on a phone: "12.50", "12,50", "AED 12.50", "12".
 * Returns null rather than guessing at anything else.
 */
export function parsePriceAed(raw: string): number | null {
  const cleaned = raw.trim().replace(/^aed\s*/i, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}
