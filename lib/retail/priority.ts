/**
 * Which products would repay a price check?
 *
 * Noura's sentence ends "…that you can actually buy in the UAE", and that clause
 * is the one it cannot currently finish: no listing has a verified price, so
 * every alternative reads "price not verified yet".
 *
 * Checking all 1,013 listings is a week of shopping. Checking the right ones is
 * an afternoon, because the distribution is extremely uneven — a product that is
 * recommended to sixty others is worth sixty times one that is recommended to
 * nobody. This module computes that weight so the field list can be ordered by
 * it rather than by staleness, which is what the ordinary queue uses.
 *
 * No prices are produced here, and none can be: a person records a ListingCheck,
 * and that is the only way a price enters Noura (DECISIONS §36).
 */

import { prisma } from "../db";
import { findVerifiedAlternatives } from "../recommend/alternatives";

export type PriorityRow = {
  productId: string;
  slug: string;
  name: string;
  brand: string | null;
  category: string;
  barcode: string | null;
  /** How many OTHER products currently recommend this one. */
  recommendedTo: number;
};

export async function pricePriority(limit = 40): Promise<{
  rows: PriorityRow[];
  productsWithAlternatives: number;
  totalProducts: number;
  /** Recommendation slots that would gain a quotable price from these rows. */
  slotsCovered: number;
}> {
  const products = await prisma.product.findMany({
    select: { id: true, slug: true, name: true, brand: true, category: true, barcode: true },
  });

  const counts = new Map<string, number>();
  let productsWithAlternatives = 0;

  for (const product of products) {
    const result = await findVerifiedAlternatives({ productId: product.id, limit: 3 });
    if (result.alternatives.length > 0) productsWithAlternatives += 1;
    for (const alternative of result.alternatives) {
      const id = alternative.candidate.productId;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  const byId = new Map(products.map((p) => [p.id, p]));
  const rows: PriorityRow[] = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, recommendedTo]) => ({ ...byId.get(id)!, productId: id, recommendedTo }));

  return {
    rows,
    productsWithAlternatives,
    totalProducts: products.length,
    slotsCovered: rows.reduce((sum, r) => sum + r.recommendedTo, 0),
  };
}
