/**
 * Seeds the database from prisma/seed-data/.
 *
 *   npm run db:seed     (or the /admin/seed button in dev)
 *
 * Idempotent: every write is an upsert keyed on a stable slug or certificate
 * number, so re-seeding refreshes rows without duplicating them and without
 * touching scans or checks anyone has already made.
 *
 * It creates NO PRICES. Listings are work items; a price is a ListingCheck a
 * person records. See DECISIONS.md §36.
 */
import "../lib/load-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { CATALOGUE, RETAILERS } from "./seed-data/catalogue";

const prisma = new PrismaClient();

type FetchedProduct = {
  slug: string;
  barcode: string;
  category: string;
  subcategory?: string | null;
  name: string;
  brand: string | null;
  sizeLabel: string;
  imageUrl: string | null;
  ingredientsText: string | null;
  allergens: string[];
  additives: string[];
  novaGroup: number | null;
  nutrition: Record<string, unknown> | null;
  evidenceSource: string;
  evidenceSourceUrl: string;
  fetchedAt: string;
};

function loadProducts(): FetchedProduct[] {
  const path = resolve(__dirname, "seed-data/products.json");
  return JSON.parse(readFileSync(path, "utf8")) as FetchedProduct[];
}

function retailerHome(retailerSlug: string): string {
  return RETAILERS.find((r) => r.slug === retailerSlug)!.websiteUrl;
}

export type SeedSummary = {
  retailers: number;
  products: number;
  /** Listings created as work items. Zero prices: see the note above. */
  listings: number;
  /** Always 0. Bodies come from `npm run seed:bodies`, not from the seed. */
  bodies: number;
  /** Always 0. Certificates come from `npm run seed:moiat`, not from the seed. */
  certificates: number;
  purgedSyntheticChecks: number;
  /** Demo certification rows removed from a database seeded before the real import. */
  purgedSyntheticCertificates: number;
};

export async function runSeed(client: PrismaClient = prisma): Promise<SeedSummary> {
  const now = new Date();
  const fetched = loadProducts();
  const summary: SeedSummary = {
    retailers: 0,
    products: 0,
    listings: 0,
    bodies: 0,
    certificates: 0,
    purgedSyntheticChecks: 0,
    purgedSyntheticCertificates: 0,
  };

  // ---- Retailers --------------------------------------------------------
  for (const r of RETAILERS) {
    await client.retailer.upsert({
      where: { slug: r.slug },
      update: { name: r.name, websiteUrl: r.websiteUrl, connector: r.connector },
      create: { ...r, country: "AE" },
    });
    summary.retailers += 1;
  }
  const retailerIds = new Map(
    (await client.retailer.findMany()).map((r) => [r.slug, r.id] as const),
  );

  // ---- Products + listings ---------------------------------------------
  for (const entry of CATALOGUE) {
    const data = fetched.find((p) => p.slug === entry.slug);
    if (!data) {
      console.warn(`no fetched evidence for ${entry.slug}; run "npm run seed:fetch"`);
      continue;
    }

    const payload = {
      name: data.name,
      brand: data.brand,
      category: entry.category,
      subcategory: entry.subcategory,
      sizeLabel: entry.sizeLabel,
      imageUrl: data.imageUrl,
      ingredientsText: data.ingredientsText,
      nutritionJson: data.nutrition ? JSON.stringify(data.nutrition) : null,
      allergensJson: JSON.stringify(data.allergens ?? []),
      additivesJson: JSON.stringify(data.additives ?? []),
      novaGroup: data.novaGroup,
      evidenceSource: data.evidenceSource,
      evidenceSourceKind: "OPEN_DATA",
      evidenceSourceUrl: data.evidenceSourceUrl,
      lastVerifiedAt: new Date(data.fetchedAt),
    };

    const product = await client.product.upsert({
      where: { slug: entry.slug },
      update: { ...payload, barcode: data.barcode },
      create: { ...payload, slug: entry.slug, barcode: data.barcode },
    });
    summary.products += 1;

    // A listing is a work item, not a price. Seeding creates the row so it appears
    // on /admin/listings waiting to be checked; it creates NO ListingCheck, because
    // only a person can make one.
    for (const retailerSlug of entry.retailers) {
      const retailerId = retailerIds.get(retailerSlug);
      if (!retailerId) continue;
      await client.productListing.upsert({
        where: {
          productId_retailerId_sizeLabel: {
            productId: product.id,
            retailerId,
            sizeLabel: entry.sizeLabel,
          },
        },
        update: { url: retailerHome(retailerSlug) },
        create: {
          productId: product.id,
          retailerId,
          sizeLabel: entry.sizeLabel,
          url: retailerHome(retailerSlug),
        },
      });
      summary.listings += 1;
    }
  }

  // ---- EIAC accredited bodies ------------------------------------------
  // CERTIFICATION IS NOT SEEDED. It used to be: a set of SAMPLE- certificates
  // and EIAC bodies marked SYNTHETIC, which existed so the UI had something to
  // render and which no code ever treated as evidence.
  //
  // There is a real source now, so the demo layer is gone rather than sitting
  // alongside it. Certificates come from `npm run seed:moiat`, which asks the
  // MOIAT conformity register about each product's barcode, and the bodies that
  // issue them from `npm run seed:bodies`. A database that has had neither run
  // reports every product's certification as UNKNOWN, which is exactly what it
  // is — nobody asked.
  //
  // Anything left over from a seed that predates this is removed.
  const staleCertificates = await client.productCertification.deleteMany({
    where: { source: "SYNTHETIC" },
  });
  const staleBodies = await client.accreditedBody.deleteMany({ where: { source: "SYNTHETIC" } });
  summary.certificates = 0;
  summary.bodies = 0;
  summary.purgedSyntheticCertificates = staleCertificates.count + staleBodies.count;

  // Any demo checks loaded by an earlier run are removed on every seed. Synthetic
  // prices do not linger here.
  const purged = await client.listingCheck.deleteMany({ where: { source: "SYNTHETIC" } });
  summary.purgedSyntheticChecks = purged.count;

  return summary;
}

async function main() {
  const summary = await runSeed();
  console.log("Seeded:", summary);
}

// Only run automatically when executed directly, so /admin/seed can import runSeed.
if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
