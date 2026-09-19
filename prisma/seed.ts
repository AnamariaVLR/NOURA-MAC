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
import { ACCREDITED_BODIES, CERTIFICATES, EIAC_SOURCE, MOIAT_SOURCE } from "./seed-data/regulator";

const prisma = new PrismaClient();

type FetchedProduct = {
  slug: string;
  barcode: string;
  category: string;
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
  bodies: number;
  certificates: number;
  purgedSyntheticChecks: number;
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
  for (const body of ACCREDITED_BODIES) {
    await client.accreditedBody.upsert({
      where: { slug: body.slug },
      update: {
        name: body.name,
        scope: body.scope,
        accreditationNo: body.accreditationNo,
        source: "SYNTHETIC",
        sourceName: EIAC_SOURCE.name,
        sourceUrl: EIAC_SOURCE.url,
        lastVerifiedAt: now,
      },
      create: {
        ...body,
        source: "SYNTHETIC",
        sourceName: EIAC_SOURCE.name,
        sourceUrl: EIAC_SOURCE.url,
        lastVerifiedAt: now,
      },
    });
    summary.bodies += 1;
  }
  const bodyIds = new Map(
    (await client.accreditedBody.findMany()).map((b) => [b.slug, b.id] as const),
  );
  const productIds = new Map(
    (await client.product.findMany({ select: { id: true, slug: true } })).map(
      (p) => [p.slug, p.id] as const,
    ),
  );

  // ---- MOIAT product conformity ----------------------------------------
  for (const cert of CERTIFICATES) {
    const productId = productIds.get(cert.productSlug);
    if (!productId) continue;
    const payload = {
      productId,
      certificateType: cert.certificateType,
      status: cert.status,
      issuedAt: new Date(cert.issuedAt),
      expiresAt: cert.expiresAt ? new Date(cert.expiresAt) : null,
      bodyId: cert.bodySlug ? (bodyIds.get(cert.bodySlug) ?? null) : null,
      // Shipped SAMPLE- rows are demo scaffolding. The enum, not the prefix, is what
      // stops them being rendered as verification.
      source: "SYNTHETIC",
      sourceName: MOIAT_SOURCE.name,
      sourceUrl: MOIAT_SOURCE.url,
      lastVerifiedAt: now,
    };
    await client.productCertification.upsert({
      where: { certificateNumber: cert.certificateNumber },
      update: payload,
      create: { ...payload, certificateNumber: cert.certificateNumber },
    });
    summary.certificates += 1;
  }

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
