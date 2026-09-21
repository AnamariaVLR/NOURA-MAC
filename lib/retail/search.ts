/**
 * Stage 5 — "where can I actually buy this in the UAE, and for how much?"
 *
 * Fans out across every registered connector, merges, and orders the way a shopper
 * in an aisle wants: verified-recently first, then in stock, then cheapest per
 * 100 g/ml.
 */
import { assertSameIdentity, type IdentifiedProduct } from "../pipeline/identity";
import { ListingQuerySchema, type Listing, type ListingQuery } from "../schemas";
import { connectors, registerConnector, type ConnectorQuery } from "./connector";
import { handConnector } from "./hand-connector";

registerConnector(handConnector);

/**
 * Exported for unit tests and reused by the page. Pure: give it listings, get an
 * order. No database, no clock.
 */
export function rankListings(listings: Listing[]): Listing[] {
  return [...listings].sort((a, b) => {
    // 1. A price somebody actually verified recently beats a lapsed one, however
    //    cheap. A stale number is the last thing we knew, not an offer.
    if (a.isFresh !== b.isFresh) return a.isFresh ? -1 : 1;

    // 2. Something you can buy today beats something cheaper that is out of stock.
    if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;

    // 3. Unit price, so a 1 L carton is comparable with a 250 ml one. Listings whose
    //    size we could not parse fall back to pack price rather than being hidden.
    const aUnit = a.unitPriceFils;
    const bUnit = b.unitPriceFils;
    if (aUnit !== null && bUnit !== null && aUnit !== bUnit) return aUnit - bUnit;

    // 4. Pack price. An unpriced listing sorts after every priced one.
    const aPrice = a.priceFils ?? Number.POSITIVE_INFINITY;
    const bPrice = b.priceFils ?? Number.POSITIVE_INFINITY;
    if (aPrice !== bPrice) {
      if (!Number.isFinite(aPrice)) return 1;
      if (!Number.isFinite(bPrice)) return -1;
      return aPrice - bPrice;
    }

    // 5. Stable tie-break so the same data always renders in the same order.
    return a.retailer.name.localeCompare(b.retailer.name);
  });
}

export function filterListings(listings: Listing[], query: ListingQuery): Listing[] {
  const ranked = rankListings(listings);
  const filtered = query.inStockOnly ? ranked.filter((l) => l.inStock) : ranked;
  return filtered.slice(0, query.limit);
}

export async function searchUaeListings(input: {
  productId: string;
  barcode?: string | null;
  name: string;
  brand?: string | null;
  inStockOnly?: boolean;
  limit?: number;
  /** The scan's identity fingerprint, and the product it belongs to. */
  identity?: { fingerprint: string | null; product: IdentifiedProduct } | null;
}): Promise<Listing[]> {
  // Commerce is the last stage and the one a shopper acts on. A price for a
  // different product than the page is about would send someone to a shelf for
  // the wrong thing, so the identity is re-checked here too.
  if (input.identity?.fingerprint) {
    assertSameIdentity("commerce", input.identity.fingerprint, input.identity.product);
  }

  const query = ListingQuerySchema.parse({
    productId: input.productId,
    inStockOnly: input.inStockOnly ?? false,
    limit: input.limit ?? 10,
  });

  const connectorQuery: ConnectorQuery = {
    productId: input.productId,
    barcode: input.barcode ?? null,
    name: input.name,
    brand: input.brand ?? null,
  };

  // Promise.allSettled, not Promise.all: one broken retailer must not take the
  // page down with it.
  const settled = await Promise.allSettled(connectors().map((c) => c.search(connectorQuery)));

  const listings: Listing[] = [];
  for (const [index, result] of settled.entries()) {
    if (result.status === "fulfilled") listings.push(...result.value);
    else console.error(`[retail] ${connectors()[index]?.label} failed:`, result.reason);
  }

  return filterListings(listings, query);
}

/**
 * Cheapest price we can stand behind: in stock, and verified inside the freshness
 * window. Returns null rather than falling back to a lapsed check — "cheapest" is a
 * claim about today.
 */
export function bestPrice(listings: Listing[]): Listing | null {
  const buyable = rankListings(listings).filter((l) => l.inStock && l.isFresh);
  return buyable[0] ?? null;
}

/** Listings we may present as verified prices. */
export function freshListings(listings: Listing[]): Listing[] {
  return rankListings(listings).filter((l) => l.isFresh);
}
