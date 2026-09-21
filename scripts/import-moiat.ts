/**
 * Replaces the SYNTHETIC certificate rows with the real MOIAT register.
 *
 *   npm run seed:moiat
 *
 * There is no bulk download to feed this — moiat.gov.ae's conformity page is a
 * search interface, not a dataset. So this asks the register about each product
 * in the catalogue, one barcode at a time, and records BOTH what came back and
 * the fact that it was asked.
 *
 * ── The three things it writes, and why the third matters most ──────────────
 *
 *   1. Exact-product certificates — the register's model number IS the barcode.
 *   2. Brand-level certificates — the brand matched, this product did not. Kept
 *      so the page can say "the brand is in the register and this product is
 *      not", and never counted as verification.
 *   3. One EvidenceLookup row PER CLAIM, always, even when nothing was found.
 *
 * (3) is what separates "we asked and the register has nothing" from "we never
 * asked". Without it both render as unknown, and one of them is a fact worth
 * telling a shopper.
 *
 * Nothing here invents a product. A certificate that matches no catalogue
 * barcode is counted and dropped.
 */
import "../lib/load-env";
import { capStateForSource } from "@/lib/evidence/registry";
import { prisma } from "../lib/db";
import {
  MOIAT_SOURCE_NAME,
  MOIAT_SOURCE_URL,
  certificatesForBarcode,
  certificatesForBrand,
  namesExactProduct,
  readStatus,
  type MoiatCertificate,
} from "../lib/evidence/moiat";

/** Be a good citizen of someone else's public endpoint. */
const DELAY_MS = 700;

type Tally = {
  products: number;
  queried: number;
  failed: number;
  exact: number;
  brand: number;
  notFound: number;
};

async function importForProduct(
  product: { id: string; slug: string; barcode: string | null; brand: string | null },
  tally: Tally,
  now: Date,
): Promise<string> {
  if (!product.barcode) {
    // No barcode, no exact question to ask. UNKNOWN is the honest state and we
    // record no lookup, because none was possible.
    return "no barcode";
  }

  const exact = await certificatesForBarcode(product.barcode);
  if (exact === null) {
    tally.failed += 1;
    // A failed query is UNKNOWN. Record the failure so the state is auditable
    // but does not read as NOT FOUND.
    // A failed query is UNKNOWN for every claim this source could have answered.
    for (const claim of ["UAE_CONFORMITY", "HALAL", "ORGANIC"]) {
      await recordLookup({
        productId: product.id,
        barcode: product.barcode,
        claim,
        state: "UNKNOWN",
        exactMatches: 0,
        brandMatches: 0,
        succeeded: false,
        now,
      });
    }
    return "QUERY FAILED";
  }
  tally.queried += 1;

  const exactHits = exact.filter((c) => namesExactProduct(c, product.barcode!));

  // Only ask about the brand when the product itself is not in the register:
  // a brand answer is weaker evidence and there is no reason to spend a request
  // on it when a better one already exists.
  let brandHits: MoiatCertificate[] = [];
  if (exactHits.length === 0 && product.brand) {
    await new Promise((r) => setTimeout(r, DELAY_MS));
    const brandRows = await certificatesForBrand(product.brand);
    if (brandRows) {
      brandHits = brandRows.filter((c) => !namesExactProduct(c, product.barcode!));
    }
  }

  await prisma.productCertification.deleteMany({
    where: { productId: product.id, source: "REGULATOR_IMPORT" },
  });

  const write = async (certificate: MoiatCertificate, matchBasis: "BARCODE" | "BRAND") => {
    await prisma.productCertification.create({
      data: {
        productId: product.id,
        certificateNumber: certificate.certificateNumber,
        certificateType: certificate.certificateType,
        status: readStatus(certificate.rawStatus),
        rawStatus: certificate.rawStatus,
        issuedAt: certificate.issuedAt ?? now,
        expiresAt: certificate.expiresAt,
        matchBasis,
        registerBrand: certificate.brand,
        registerModelNumber: certificate.modelNumber,
        registerProductType: certificate.productType,
        registerCompany: certificate.company,
        registerCountry: certificate.country,
        source: "REGULATOR_IMPORT",
        sourceName: MOIAT_SOURCE_NAME,
        sourceUrl: MOIAT_SOURCE_URL,
        lastVerifiedAt: now,
      },
    });
  };

  for (const certificate of exactHits) await write(certificate, "BARCODE");
  // A handful is enough to say "the brand is in the register"; the rest is noise.
  for (const certificate of brandHits.slice(0, 5)) await write(certificate, "BRAND");

  // One row per claim. A claim with no matching record is NOT_FOUND *in MOIAT* —
  // a fact about the register, never about the product.
  for (const claim of ["UAE_CONFORMITY", "HALAL", "ORGANIC"] as const) {
    const exactForClaim = exactHits.filter((c) => claimOf(c) === claim);
    const brandForClaim = brandHits.filter((c) => claimOf(c) === claim);
    const liveExact = exactForClaim.filter(
      (c) => readStatus(c.rawStatus) === "valid" && (!c.expiresAt || c.expiresAt.getTime() > now.getTime()),
    );

    const state =
      liveExact.length > 0 ? "VERIFIED"
      : exactForClaim.length > 0 ? "EXPIRED"
      : brandForClaim.length > 0 ? "BRAND_LEVEL_ONLY"
      : "NOT_FOUND";

    const best = liveExact[0] ?? exactForClaim[0] ?? brandForClaim[0] ?? null;

    await recordLookup({
      productId: product.id,
      barcode: product.barcode,
      claim,
      state,
      exactMatches: exactForClaim.length,
      brandMatches: brandForClaim.length,
      succeeded: true,
      referenceNumber: best?.certificateNumber ?? null,
      validUntil: best?.expiresAt ?? null,
      raw: best ?? undefined,
      now,
    });
  }

  tally.exact += exactHits.length;
  tally.brand += Math.min(brandHits.length, 5);
  if (exactHits.length === 0 && brandHits.length === 0) tally.notFound += 1;

  if (exactHits.length > 0) return `${exactHits.length} exact`;
  if (brandHits.length > 0) return `brand only (${brandHits.length})`;
  return "not found";
}

/**
 * Record what MOIAT said, per CLAIM.
 *
 * One query answers more than one question. The register carries UAE conformity
 * (ECAS/EQM), halal (HNM and EQM halal marks) and organic (ECAS "Organic
 * (Processed Food)") records, and those are three separate facts about a
 * product. Writing one row per claim is what lets the page say "no UAE
 * conformity record found in MOIAT" while saying nothing at all about organic,
 * rather than implying a single verdict covering everything.
 *
 * The state is capped by the source's granularity in lib/evidence/registry.ts,
 * so an importer cannot promote a brand match to VERIFIED by mistake.
 */
async function recordLookup(args: {
  productId: string;
  barcode: string;
  claim: string;
  state: string;
  exactMatches: number;
  brandMatches: number;
  succeeded: boolean;
  referenceNumber?: string | null;
  validUntil?: Date | null;
  raw?: unknown;
  now: Date;
}): Promise<void> {
  const state = capStateForSource(args.state, "MOIAT");
  const data = {
    state,
    queriedValue: args.barcode,
    exactMatches: args.exactMatches,
    brandMatches: args.brandMatches,
    succeeded: args.succeeded,
    referenceNumber: args.referenceNumber ?? null,
    validUntil: args.validUntil ?? null,
    sourceName: MOIAT_SOURCE_NAME,
    sourceUrl: MOIAT_SOURCE_URL,
    retrievedAt: args.now,
    rawProvenance: args.raw ? JSON.stringify(args.raw).slice(0, 4000) : null,
  };
  await prisma.evidenceLookup.upsert({
    where: {
      productId_sourceKey_claim: {
        productId: args.productId,
        sourceKey: "MOIAT",
        claim: args.claim,
      },
    },
    create: { productId: args.productId, sourceKey: "MOIAT", claim: args.claim, ...data },
    update: data,
  });
}

/** Which claim a register row speaks to, read from its own words. */
function claimOf(certificate: { certificateType: string; productType: string | null }): string {
  const type = `${certificate.certificateType} ${certificate.productType ?? ""}`.toLowerCase();
  if (type.includes("halal") || certificate.certificateType === "HNM") return "HALAL";
  if (type.includes("organic")) return "ORGANIC";
  return "UAE_CONFORMITY";
}

async function main(): Promise<void> {
  const products = await prisma.product.findMany({
    select: { id: true, slug: true, barcode: true, brand: true },
    orderBy: { slug: "asc" },
  });

  const now = new Date();
  const tally: Tally = { products: products.length, queried: 0, failed: 0, exact: 0, brand: 0, notFound: 0 };

  console.log(`Asking the MOIAT register about ${products.length} products.\n`);

  for (const product of products) {
    const outcome = await importForProduct(product, tally, now);
    console.log(`  ${outcome.padEnd(18)} ${product.slug}`);
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  // Every SYNTHETIC row for a product we now have a real answer about is gone.
  // A product we could not ask about keeps nothing: demo scaffolding was never
  // evidence and there is no reason to keep it once the real source is wired.
  const purged = await prisma.productCertification.deleteMany({ where: { source: "SYNTHETIC" } });

  console.log(`
  products            ${tally.products}
  asked               ${tally.queried}
  query failed        ${tally.failed}
  exact certificates  ${tally.exact}
  brand certificates  ${tally.brand}
  asked, nothing      ${tally.notFound}
  synthetic purged    ${purged.count}`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
