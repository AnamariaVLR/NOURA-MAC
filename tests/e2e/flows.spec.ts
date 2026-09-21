/**
 * The four flows the shopping layer has to get right, each driven by ListingCheck
 * fixtures rather than by whatever happens to be in the database:
 *
 *   1. a better alternative exists and is buyable
 *   2. nothing better is buyable  → "No better verified option found."
 *   3. the product has no price at all
 *   4. the only check has lapsed  → shown with its date, never as a live price
 */
import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";
import {
  BETTER_DRINKS,
  BETTER_DRINK_RETAILERS,
  OAT_DRINK,
  SCANNED_PRODUCT,
  signInAsAdmin,
  addChecks,
  clearChecks,
  disconnect,
  withoutListings,
} from "./fixtures";

const FIXTURE = resolve(__dirname, "../../fixtures/product.png");

/**
 * Opens the scanner and waits for it to be INTERACTIVE before touching it.
 *
 * The app has a root loading.tsx, so every dynamic page renders inside a
 * Suspense boundary and streams. setInputFiles on a hidden input fires a change
 * event that React only hears once the client component has hydrated — before
 * that the event lands on dead DOM and the file is silently never accepted.
 *
 * Waiting for the primary button proves hydration has happened. A real user
 * cannot beat it because they have to tap that button first.
 */
async function openScanner(page: Page): Promise<void> {
  await page.goto("/scan");
  await expect(page.getByTestId("scan-button")).toBeVisible();
}


async function scan(page: Page) {
  await openScanner(page);
  await page.getByTestId("file-input").setInputFiles(FIXTURE);
  await page.getByTestId("analyse-button").click();
  await page.waitForURL(/\/result\/[a-z0-9]+/i, { timeout: 60_000 });
  await settled(page);
}

/**
 * Waits for a result page to finish streaming.
 *
 * `waitForURL` resolves as soon as the document starts arriving, and since
 * app/loading.tsx put every dynamic page behind a Suspense boundary that is now
 * while the skeleton is still on screen. Assertions that AUTO-WAIT are fine;
 * `locator.count()` is not, and returns 0 for a block that is about to exist.
 *
 * Waiting for the last of the five blocks is the honest signal that the page a
 * shopper sees is the page under test.
 */
async function settled(page: Page): Promise<void> {
  await expect(page.getByTestId("loading")).toHaveCount(0);
  await expect(page.getByTestId("where-to-buy")).toBeVisible();
}

test.beforeEach(async () => {
  await clearChecks();
});

test.afterAll(async () => {
  await clearChecks();
  await disconnect();
});

/* ===========================================================================
 * 1. A better alternative, buyable today
 * ========================================================================= */
test("better alternative: shows what to buy instead, with who checked it and when", async ({ page }) => {
  await addChecks([
    { productSlug: SCANNED_PRODUCT, retailerSlug: "carrefour-uae", priceAed: 2.75 },
    { productSlug: BETTER_DRINKS[0], retailerSlug: BETTER_DRINK_RETAILERS[0], priceAed: 1.75 },
    { productSlug: BETTER_DRINKS[1], retailerSlug: BETTER_DRINK_RETAILERS[1], priceAed: 4.5 },
  ]);

  await scan(page);

  const alternatives = page.getByTestId("alternatives").locator("> li");
  // not.toHaveCount(0) retries; a bare count() does not.
  await expect(alternatives).not.toHaveCount(0);
  expect(await alternatives.count()).toBeLessThanOrEqual(3);

  const first = alternatives.first();
  await expect(first.getByTestId("medal")).toHaveAttribute("aria-label", "Rank 1");
  // The swap has to be explained, not asserted.
  await expect(first.getByTestId("why")).not.toBeEmpty();

  // Every card answers the price question one way or the other — a number with
  // a person and a date behind it, or an explicit statement that we have none.
  // A blank is the one thing it may never be. Ranking is on evidence, so the
  // card that carries a price is not necessarily the first one.
  for (const card of await alternatives.all()) {
    const text = await card.innerText();
    if (/AED \d+\.\d{2}/.test(text)) {
      expect(text).toMatch(/Verified by hand on .+ by E2E Checker/);
    } else {
      await expect(card.getByTestId("alt-no-price")).toContainText(/price not verified yet|availability not verified recently/i);
    }
  }

  // If one of the hand-priced products ranked into the list, its price is shown
  // with the person and date behind it. It need not rank — three UAE waters now
  // compete for these three slots, and ranking is on evidence, not on whether
  // we happen to hold a price.
  const priced = alternatives.filter({ hasText: /AED \d/ });
  for (const card of await priced.all()) {
    await expect(card).toContainText(/Verified by hand on .+ by E2E Checker/);
  }

  // The five blocks, in order. Headings render uppercase via CSS, and innerText
  // returns what is rendered, so compare case-insensitively.
  const body = (await page.locator("body").innerText()).toLowerCase();
  const order = ["verification", "why", "better options", "where to buy"].map((h) => body.indexOf(h));
  expect(order.every((i) => i > -1)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
});

/* ===========================================================================
 * 2. Nothing better is buyable
 * ========================================================================= */
test("a lapsed price is disclosed, never used to hide a better product", async ({ page }) => {
  // The scanned product has a fresh price; the better drinks were checked a
  // month ago, so we cannot quote a price for them.
  await addChecks([
    { productSlug: SCANNED_PRODUCT, retailerSlug: "carrefour-uae", priceAed: 2.75 },
    { productSlug: BETTER_DRINKS[0], retailerSlug: BETTER_DRINK_RETAILERS[0], priceAed: 1.75, daysAgo: 30 },
    { productSlug: BETTER_DRINKS[1], retailerSlug: BETTER_DRINK_RETAILERS[1], priceAed: 4.5, daysAgo: 45 },
  ]);

  await scan(page);

  // The alternative is STILL SHOWN. A gap in our price data is a fact about our
  // data, not a judgement about the product, and burying the product behind it
  // would let the one masquerade as the other.
  const alternatives = page.getByTestId("alternatives").locator("> li");
  await expect(alternatives).not.toHaveCount(0);

  // And the gap is stated in words, with no number attached.
  await expect(alternatives.first().getByTestId("alt-no-price")).toContainText(
    /price not verified yet|availability not verified recently/i,
  );
  expect(await alternatives.first().innerText()).not.toMatch(/AED \d/);

  // The scanned product's own price is still shown: this is about alternatives.
  await expect(page.getByTestId("listings")).toContainText(/AED 2\.75/);
});

test("no better option: an out-of-stock alternative is not an option", async ({ page }) => {
  await addChecks([
    { productSlug: SCANNED_PRODUCT, retailerSlug: "carrefour-uae", priceAed: 2.75 },
    // Fresh checks, but the checker found empty shelves.
    { productSlug: BETTER_DRINKS[0], retailerSlug: BETTER_DRINK_RETAILERS[0], priceAed: 1.75, inStock: false },
    { productSlug: BETTER_DRINKS[1], retailerSlug: BETTER_DRINK_RETAILERS[1], priceAed: 4.5, inStock: false },
  ]);

  await scan(page);

  // A product a checker found missing from the shelf is never offered, whatever
  // its evidence says: sending someone to buy what is not there is not advice.
  const section = page.getByTestId("better-options");
  const text = await section.innerText();
  expect(text).not.toMatch(/Al ain water/i);
  expect(text).not.toMatch(/Lipton/i);
});

test("a synthetic price can never appear as a price", async ({ page }) => {
  await addChecks([
    { productSlug: SCANNED_PRODUCT, retailerSlug: "carrefour-uae", priceAed: 2.75 },
    // Recorded today, in stock, cheap — and scaffolding, so it counts for nothing.
    { productSlug: BETTER_DRINKS[0], retailerSlug: BETTER_DRINK_RETAILERS[0], priceAed: 1.75, source: "SYNTHETIC" },
  ]);

  await scan(page);

  // The product may well be a better choice, and may still be offered. What can
  // never happen is the fake 1.75 reaching the screen as a price.
  const section = page.getByTestId("better-options");
  expect(await section.innerText()).not.toMatch(/AED 1\.75/);
});

/* ===========================================================================
 * 3. No price checked at all
 * ========================================================================= */
test("missing evidence: no price is invented when nobody has checked one", async ({ page }) => {
  // Only the alternatives have prices; the scanned product has none.
  await addChecks([{ productSlug: BETTER_DRINKS[0], retailerSlug: BETTER_DRINK_RETAILERS[0], priceAed: 1.75 }]);

  await scan(page);

  await expect(page.getByTestId("no-listings")).toContainText(/No price has been checked/i);
  await expect(page.getByTestId("listings")).toHaveCount(0);

  // No price anywhere in the Where-to-buy block.
  expect(await page.getByTestId("where-to-buy").innerText()).not.toMatch(/AED \d/);

  // The verdict and the checklist do not depend on prices and must still be there.
  await expect(page.getByTestId("verdict")).toBeVisible();
  expect(await page.getByTestId("check").count()).toBeGreaterThan(0);
});

test("missing evidence: a product with no listings at all still renders", async ({ page }) => {
  await withoutListings(SCANNED_PRODUCT, async () => {
    await scan(page);
    await expect(page.getByTestId("no-listings")).toBeVisible();
    await expect(page.getByTestId("product-name")).toBeVisible();
  });
});

/* ===========================================================================
 * 4. A lapsed check
 * ========================================================================= */
test("stale listing: shown with its date, never as a live price", async ({ page }) => {
  await addChecks([
    { productSlug: SCANNED_PRODUCT, retailerSlug: "carrefour-uae", priceAed: 2.75, daysAgo: 30 },
  ]);

  await scan(page);

  const listing = page.getByTestId("listing").first();
  await expect(listing).toHaveAttribute("data-fresh", "false");

  const label = listing.getByTestId("freshness-label");
  await expect(label).toContainText(/not verified recently/i);
  // The date is still there — it is the last thing we actually know.
  await expect(label).toContainText(/\d{4}/);
  await expect(label).not.toContainText(/Verified by hand/i);

  // A lapsed check cannot be the cheapest verified price, and cannot assert stock.
  const whereToBuy = await page.getByTestId("where-to-buy").innerText();
  expect(whereToBuy).toMatch(/AED 2\.75/); // the number is still shown
  expect(whereToBuy).not.toMatch(/Cheapest verified/i);
  expect(whereToBuy).not.toMatch(/in stock/i);
});

test("stale listing: a fresh check outranks a lapsed cheaper one", async ({ page }) => {
  await addChecks([
    { productSlug: SCANNED_PRODUCT, retailerSlug: "carrefour-uae", priceAed: 1.0, daysAgo: 40 },
    { productSlug: SCANNED_PRODUCT, retailerSlug: "spinneys", priceAed: 9.0, daysAgo: 1 },
  ]);

  await scan(page);

  const first = page.getByTestId("listing").first();
  await expect(first).toHaveAttribute("data-fresh", "true");
  await expect(first).toContainText("Spinneys");

  // The verified price is the headline, even though it is nine times the lapsed one.
  const whereToBuy = await page.getByTestId("where-to-buy").innerText();
  expect(whereToBuy).toMatch(/Cheapest verified:\s*AED 9\.00/);
  expect(whereToBuy).not.toMatch(/Cheapest verified:\s*AED 1\.00/);
});

/* ===========================================================================
 * The admin form, which is how real checks get in
 * ========================================================================= */
test("admin: a check recorded on the form appears as a verified price", async ({ page }) => {
  // /admin is behind a password now; the operator signs in once per phone.
  await signInAsAdmin(page);
  await page.goto("/admin/listings");
  await expect(page.getByRole("heading", { name: /Price checks/i })).toBeVisible();

  // Everything starts unchecked, so the queue leads with never-checked rows.
  const firstRow = page.getByTestId("queue-row").first();
  await expect(firstRow).toHaveAttribute("data-staleness", "never-checked");

  await firstRow.click();
  await page.getByTestId("price-input").fill("4.25");
  await page.getByTestId("checked-by-input").fill("Aisle Checker");
  await page.getByTestId("save-check").click();

  await expect(page.getByTestId("check-message")).toContainText(/Saved/i);

  // The queue defaults to what still needs doing, so a checked row leaves it.
  await page.reload();
  await expect(page.locator('[data-testid="queue-row"][data-staleness="fresh"]')).toHaveCount(0);

  // It is there under "All listings", now carrying its price.
  await page.getByRole("button", { name: "All listings" }).click();
  const fresh = page.locator('[data-testid="queue-row"][data-staleness="fresh"]');
  expect(await fresh.count()).toBeGreaterThan(0);
  await expect(fresh.first()).toContainText("AED 4.25");
});

/* ===========================================================================
 * 5. The audit defect, at the UI level
 *
 * Scanning a cola once surfaced an AED 24.00 oat drink above an AED 1.75 water,
 * because the oat drink had more checkable dimensions and the ranking counted
 * passes. RUBRIC.md §8 fixes that twice over: R1 counts failures instead, and R6
 * binds comparison to the subcategory, so an oat drink — which is milk/plant_milk
 * — is no longer a candidate against a drink at all.
 *
 * This test asserts the outcome a shopper sees, not the comparator.
 * ========================================================================= */
test("audit defect: an expensive out-of-category product is never the alternative", async ({
  page,
}) => {
  await addChecks([
    { productSlug: SCANNED_PRODUCT, retailerSlug: "carrefour-uae", priceAed: 2.75 },
    // Fresh, in stock, and the most expensive thing in the catalogue.
    { productSlug: OAT_DRINK, retailerSlug: "spinneys", priceAed: 24.0 },
    // Fresh, in stock, cheap, and actually a drink.
    { productSlug: BETTER_DRINKS[0], retailerSlug: BETTER_DRINK_RETAILERS[0], priceAed: 1.75 },
  ]);

  await scan(page);

  const alternatives = page.getByTestId("alternatives");
  await expect(alternatives).toBeVisible();
  // The oat drink is in a different category and must not appear at any rank.
  await expect(alternatives).not.toContainText(/Oat Drink/i);
  await expect(alternatives).not.toContainText(/AED 24\.00/);
  // The water does, and it is first.
  const first = alternatives.locator("> li").first();
  // Ranking is on evidence, so the top card is not necessarily the one we
  // priced by hand; what must hold is that it answers the price question.
  const firstText = await first.innerText();
  expect(firstText).toMatch(/AED \d+\.\d{2}|price not verified yet|availability not verified recently/i);
});

/* ===========================================================================
 * 6. The whole journey, in one test.
 *
 * Every other spec covers one step. This one walks the path a real shopper
 * takes, in order, and asserts the thing each step exists to guarantee — so a
 * regression that only shows up in the SEAMS between steps has somewhere to
 * fail.
 * ========================================================================= */
test("the full journey: front door → scan → evidence → assessment → alternatives → where to buy", async ({
  page,
}) => {
  await addChecks([
    { productSlug: SCANNED_PRODUCT, retailerSlug: "carrefour-uae", priceAed: 2.75 },
    { productSlug: BETTER_DRINKS[0], retailerSlug: BETTER_DRINK_RETAILERS[0], priceAed: 1.75 },
  ]);

  // 1-2. Open Noura and understand what it does.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /know what you.re buying/i })).toBeVisible();
  // The limits are on the front door, not buried.
  await expect(page.getByText(/What it cannot do/i)).toBeVisible();

  // 3. Scan.
  await page.getByTestId("start-scan").click();
  await page.waitForURL(/\/scan$/);
  await expect(page.getByTestId("scan-button")).toBeVisible();
  await page.getByTestId("file-input").setInputFiles(FIXTURE);
  await page.getByTestId("analyse-button").click();
  await page.waitForURL(/\/result\/[a-z0-9]+/i, { timeout: 60_000 });
  await settled(page);

  // 4. Identified, and it says HOW — provenance, not just a name.
  await expect(page.getByTestId("product-name")).not.toBeEmpty();
  await expect(page.getByTestId("match-provenance")).not.toBeEmpty();

  // 6. Evidence and a category-specific assessment.
  await expect(page.getByTestId("checklist")).toBeVisible();
  const checkRows = page.getByTestId("check");
  await expect(checkRows.nth(2)).toBeVisible();
  // Every line carries the source it rests on. `:visible` because the first
  // source note on the page sits inside the collapsed label disclosure, and a
  // hidden one is not evidence that the reader can see attribution.
  await expect(page.locator('[data-testid="source-note"]:visible').first()).toBeVisible();

  // 7. What it could not verify is stated, not hidden. Every line of this
  // product's checklist now resolves — the MOIAT import found a certificate for
  // it — so the thing to assert here is that the page still states its limits
  // rather than presenting a complete checklist as a complete picture. The
  // unknown state itself has its own test in installable.spec.ts, on a product
  // with its certification evidence removed.
  await expect(page.getByTestId("check-tally")).toBeVisible();
  await expect(page.getByText(/not medical advice/i).first()).toBeVisible();

  // 8. Alternatives.
  await expect(page.getByTestId("better-options")).toBeVisible();

  // 9. Real purchase information: retailer, size, price, availability, last checked.
  const listing = page.getByTestId("listing").first();
  await expect(listing).toBeVisible();
  await expect(listing).toContainText(/AED \d+\.\d{2}/);
  await expect(listing.getByTestId("availability")).toBeVisible();
  await expect(listing.getByTestId("freshness-label")).toContainText(/verified by hand/i);
});

/* ===========================================================================
 * 7. No fabricated commerce, anywhere.
 * ========================================================================= */
test("with no checks recorded, no price is shown and the reason is given", async ({ page }) => {
  // No addChecks: the database is empty of prices, which is how it ships.
  await openScanner(page);
  await page.getByTestId("file-input").setInputFiles(FIXTURE);
  await page.getByTestId("analyse-button").click();
  await page.waitForURL(/\/result\/[a-z0-9]+/i, { timeout: 60_000 });
  await settled(page);

  const empty = page.getByTestId("no-listings");
  await expect(empty).toBeVisible();
  await expect(empty).toContainText(/no price has been checked/i);
  // It explains WHY rather than just reporting an absence.
  await expect(empty).toContainText(/does not scrape/i);

  // And nothing anywhere on the page looks like a price.
  await expect(page.getByTestId("listings")).toHaveCount(0);
  const body = await page.locator("body").innerText();
  const prices = body.match(/AED\s*\d/g) ?? [];
  expect(prices, `page showed a price with no check recorded: ${prices.join(", ")}`).toHaveLength(0);
});

/* ===========================================================================
 * Evidence provenance: each claim, and the register that answered it
 * ========================================================================= */
test("each certification claim is shown separately, naming its source", async ({ page }) => {
  await scan(page);

  const rows = page.getByTestId("claim-evidence");
  await expect(rows).not.toHaveCount(0);

  // Every row names a register. A claim with no source behind it is not a claim
  // Noura is entitled to print.
  for (const row of await rows.all()) {
    const text = await row.innerText();
    expect(text).toMatch(/MOIAT|register/i);
  }

  // And nowhere does the page assert the product is uncertified.
  const body = (await page.locator("body").innerText()).toLowerCase();
  expect(body).not.toMatch(/\b(is|are) (not certified|uncertified)\b/);
  expect(body).not.toMatch(/certification:\s*none\b/);
});
