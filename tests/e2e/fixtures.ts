/**
 * ListingCheck fixtures for the end-to-end flows.
 *
 * Each flow needs the database in a specific state — a fresh check, a lapsed one,
 * none at all — so the specs set that state directly rather than driving the admin
 * form for every case. The form has its own test.
 *
 * Everything written here is deleted again between flows, so the flows cannot
 * interfere with each other and the repository never accumulates prices nobody
 * checked.
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

/** Matches playwright.config.ts. Used when a fixture needs an origin before navigating. */
const BASE_URL = `http://127.0.0.1:${process.env.PORT ?? 3100}`;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

let client: PrismaClient | null = null;
export function prisma(): PrismaClient {
  if (!client) client = new PrismaClient();
  return client;
}

export async function disconnect(): Promise<void> {
  await client?.$disconnect();
  client = null;
}

/** Every check, gone. Run before each flow so state is never inherited. */
export async function clearChecks(): Promise<void> {
  await prisma().listingCheck.deleteMany({});
}

export type CheckSpec = {
  productSlug: string;
  retailerSlug?: string;
  priceAed: number;
  /** How old to make it. 0 is today; 30 is well past the 14-day window. */
  daysAgo?: number;
  inStock?: boolean;
  checkedBy?: string;
  /** Anything but HAND_VERIFIED is scaffolding and must never display as a price. */
  source?: string;
};

/**
 * Records a check against the first matching listing. Throws when the listing does
 * not exist: a silent no-op here would produce a test that passes for the wrong
 * reason.
 */
export async function addCheck(spec: CheckSpec): Promise<string> {
  const listing = await prisma().productListing.findFirst({
    where: {
      product: { slug: spec.productSlug },
      ...(spec.retailerSlug ? { retailer: { slug: spec.retailerSlug } } : {}),
    },
    include: { product: true, retailer: true },
  });

  if (!listing) {
    throw new Error(
      `No listing for ${spec.productSlug}${spec.retailerSlug ? ` at ${spec.retailerSlug}` : ""}. ` +
        "Has the database been seeded?",
    );
  }

  const check = await prisma().listingCheck.create({
    data: {
      listingId: listing.id,
      priceFils: Math.round(spec.priceAed * 100),
      currency: "AED",
      sizeLabel: listing.sizeLabel,
      inStock: spec.inStock ?? true,
      checkedBy: spec.checkedBy ?? "E2E Checker",
      checkedAt: new Date(Date.now() - (spec.daysAgo ?? 0) * MS_PER_DAY),
      retailerUrl: listing.url,
      source: spec.source ?? "HAND_VERIFIED",
    },
  });

  return check.id;
}

export async function addChecks(specs: CheckSpec[]): Promise<void> {
  for (const spec of specs) await addCheck(spec);
}

/**
 * Runs `body` with a product's listings removed, then puts every one of them back.
 *
 * Snapshot-and-restore rather than delete-and-recreate-one: deleting five listings
 * and restoring a single retailer leaves the next flow looking for a listing that
 * no longer exists.
 */
/**
 * Runs `body` with the product's certification evidence removed, then restores it.
 *
 * Needed because the real MOIAT import gave the fixture product a verified
 * certificate, so every line of its checklist now resolves — which is a good
 * thing, and leaves the "unknown is visible" tests with no unknown to look at.
 * Removing the evidence is closer to the truth being tested than scanning a
 * different product would be: the question is what the page does when Noura
 * could not establish something.
 */
export async function withoutCertification(
  productSlug: string,
  body: () => Promise<void>,
): Promise<void> {
  const certs = await prisma().productCertification.findMany({
    where: { product: { slug: productSlug } },
  });
  const lookups = await prisma().evidenceLookup.findMany({
    where: { product: { slug: productSlug } },
  });

  await prisma().productCertification.deleteMany({ where: { product: { slug: productSlug } } });
  await prisma().evidenceLookup.deleteMany({ where: { product: { slug: productSlug } } });
  try {
    await body();
  } finally {
    for (const { id: _id, ...cert } of certs) {
      await prisma().productCertification.create({ data: cert });
    }
    for (const { id: _id, ...rest } of lookups) {
      await prisma().evidenceLookup.create({ data: rest });
    }
  }
}

export async function withoutListings(productSlug: string, body: () => Promise<void>): Promise<void> {
  const saved = await prisma().productListing.findMany({ where: { product: { slug: productSlug } } });

  await prisma().productListing.deleteMany({ where: { product: { slug: productSlug } } });
  try {
    await body();
  } finally {
    for (const listing of saved) {
      await prisma().productListing.upsert({
        where: {
          productId_retailerId_sizeLabel: {
            productId: listing.productId,
            retailerId: listing.retailerId,
            sizeLabel: listing.sizeLabel,
          },
        },
        update: {},
        create: {
          productId: listing.productId,
          retailerId: listing.retailerId,
          sizeLabel: listing.sizeLabel,
          url: listing.url,
        },
      });
    }
  }
}

/**
 * The mock scan always identifies the same product, set by MOCK_PRODUCT_SLUG.
 * Playwright's web server runs without it, so the default applies.
 */
export const SCANNED_PRODUCT = "coca-cola-330ml";

/**
 * Products that beat the scanned cola on the checklist AND are in its category.
 *
 * Both halves matter. Under RUBRIC.md §4's eleven categories an oat drink is
 * `milk/plant_milk`, not `drink`, so it can no longer be offered as an
 * alternative to a cola at all — which is the structural half of the audit fix
 * (§8 R6). OAT_DRINK below is kept precisely so a test can assert that.
 */
export const BETTER_DRINKS = ["al-ain-water-500ml", "lipton-ice-tea-peach-500ml"] as const;

/**
 * A retailer each of the above is actually tracked at, in the same order.
 *
 * `addChecks` records a check against an EXISTING ProductListing, so naming a
 * retailer the catalogue does not track a product at fails loudly rather than
 * silently recording nothing — which is the right behaviour, and the reason this
 * pairing is a constant rather than three hard-coded strings in the specs.
 */
export const BETTER_DRINK_RETAILERS = ["carrefour-uae", "noon"] as const;

/**
 * The AED 24.00 oat drink from the audit defect. It is in a different category
 * from the cola, so however cheap, fresh and in stock its listing is, it must
 * never appear in the cola's alternatives.
 */
export const OAT_DRINK = "oatly-organic-oat-drink-1l";

/**
 * The password the Playwright web server is started with. In the repo on purpose:
 * the point of the admin tests is that the wrong password is refused and the
 * right one is not, which needs a right one that both sides agree on.
 */
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "playwright-admin-password";

/**
 * Signs a page into /admin.
 *
 * Every admin route now sits behind middleware, so a test that used to open
 * /admin/listings directly lands on the login form instead. This does what the
 * operator does — types the password once — rather than forging the cookie,
 * because the cookie's format is an implementation detail and the sign-in is the
 * thing worth exercising.
 */
export async function signInAsAdmin(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/admin/login");
  await page.getByTestId("admin-password").fill(ADMIN_PASSWORD);
  await page.getByTestId("admin-login-submit").click();
  await page.waitForURL(/\/admin\/(?!login)/, { timeout: 20_000 });
}

/* ===========================================================================
 * Scans awaiting confirmation.
 *
 * Driving the real pipeline to produce one needs a model call and a photo the
 * model reads ambiguously, which is neither cheap nor deterministic. The
 * DECISION is unit-tested exhaustively in tests/unit/match.test.ts; what the
 * end-to-end test is for is the shopper tapping an option on a 390px screen, so
 * the state it starts from is written directly.
 * ========================================================================= */

export async function productIdByName(name: string): Promise<string> {
  const product = await prisma().product.findFirst({ where: { name: { contains: name } } });
  if (!product) throw new Error(`No seeded product matching ${JSON.stringify(name)}.`);
  return product.id;
}

/**
 * Creates a scan in `needs_confirmation`, owned by this browser.
 *
 * The scan has to belong to the browser's cookie or /result/[id] answers 404,
 * and the app only mints that cookie when a scan is POSTed — visiting a page
 * does not. So the browser identity is established here instead.
 *
 * This forges a cookie, which the admin fixture deliberately does not do. The
 * difference is what the cookie IS: `noura_user` is an anonymous UUID naming a
 * browser, with no authority attached, and creating one is exactly what the app
 * would do on the first scan. `noura_admin` is a credential, so that one is
 * obtained by typing the password like an operator would.
 */
export async function seedPendingScan(
  page: import("@playwright/test").Page,
  productNames: string[],
): Promise<{ id: string }> {
  const userKey = randomUUID();
  const { origin } = new URL(page.url() === "about:blank" ? BASE_URL : page.url());
  await page.context().addCookies([
    { name: "noura_user", value: userKey, url: origin, httpOnly: true, sameSite: "Lax" },
  ]);

  const candidates = [];
  for (const name of productNames) {
    const product = await prisma().product.findFirst({ where: { name: { contains: name } } });
    if (!product) throw new Error(`No seeded product matching ${JSON.stringify(name)}.`);
    candidates.push({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      brand: product.brand,
      sizeLabel: product.sizeLabel,
      imageUrl: product.imageUrl,
      variant: ["full", "fat"],
    });
  }

  const scan = await prisma().scan.create({
    data: {
      userKey,
      status: "needs_confirmation",
      mode: "mock",
      identificationJson: JSON.stringify({
        name: "Milk",
        brand: "Almarai",
        barcode: null,
        category: "milk",
        subcategory: null,
        sizeLabel: "1 L",
        confidence: 0.75,
        visibleText: "Almarai",
        method: "none",
      }),
      candidatesJson: JSON.stringify(candidates),
    },
  });

  return { id: scan.id };
}

/** Scans and their analyses, gone. */
export async function clearScans(): Promise<void> {
  await prisma().healthAnalysis.deleteMany({});
  await prisma().scan.deleteMany({});
  await prisma().missingProduct.deleteMany({});
}
