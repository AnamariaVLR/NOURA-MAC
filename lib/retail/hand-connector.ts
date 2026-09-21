/**
 * The only connector that ships: human checks.
 *
 * It reads the newest ListingCheck for each listing and turns it into a Listing.
 * There is no live retailer feed behind it and no synthetic price generator.
 */
import { prisma } from "../db";
import { unitPriceFils } from "../format";
import { ListingSchema, type Listing } from "../schemas";
import { ageInDays, isFreshCheck } from "./freshness";
import type { ConnectorQuery, RetailerConnector } from "./connector";

export const handConnector: RetailerConnector = {
  id: "hand",
  label: "Hand-verified checks",

  async search(query: ConnectorQuery): Promise<Listing[]> {
    try {
      const listings = await prisma.productListing.findMany({
        where: { productId: query.productId },
        include: {
          retailer: true,
          // Newest check only: a listing's price is its most recent observation.
          checks: { orderBy: { checkedAt: "desc" }, take: 1 },
        },
      });

      const now = new Date();
      const out: Listing[] = [];

      for (const listing of listings) {
        const check = listing.checks[0];
        // A listing with no check is a work item, not a price. It belongs on
        // /admin/listings, not on a result page.
        if (!check) continue;

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
          unitPriceFils:
            check.priceFils === null ? null : unitPriceFils(check.priceFils, check.sizeLabel),
          inStock: check.inStock,
          url: check.retailerUrl ?? listing.url ?? listing.retailer.websiteUrl,
          source: {
            // Attribution follows the source kind: a retailer page is cited as
            // the retailer, not as a person who never looked at it.
            name: check.checkedBy
              ? `Checked by ${check.checkedBy}`
              : `Shown by ${listing.retailer.name}`,
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

        // A row we cannot validate is a price we must not show.
        if (parsed.success) out.push(parsed.data);
      }

      return out;
    } catch (error) {
      console.error("[hand-connector] search failed:", error);
      return [];
    }
  },
};
