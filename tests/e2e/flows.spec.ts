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
  OAT_DRINK,
  SCANNED_PRODUCT,
  addChecks,
  clearChecks,
  disconnect,
  withoutListings,
} from "./fixtures";

const FIXTURE = resolve(__dirname, "../../fixtures/product.png");

async function scan(page: Page) {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles(FIXTURE);
  await page.getByTestId("analyse-button").click();
  await page.waitForURL(/\/result\/[a-z0-9]+/i, { timeout: 60_000 });
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
    { productSlug: BETTER_DRINKS[0], retailerSlug: "carrefour-uae", priceAed: 1.75 },
    { productSlug: BETTER_DRINKS[1], retailerSlug: "spinneys", priceAed: 24.0 },
  ]);

  await scan(page);

  const alternatives = page.getByTestId("alternatives").locator("> li");
  const count = await alternatives.count();
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(3);

  const first = alternatives.first();
  await expect(first.getByTestId("medal")).toHaveAttribute("aria-label", "Rank 1");
  await expect(first).toContainText(/AED \d+\.\d{2}/);
  // The swap has to be explained, not asserted.
  await expect(first.getByTestId("why")).not.toBeEmpty();
  // And the price has to name a person and a date.
  await expect(first).toContainText(/Verified by hand on .+ by E2E Checker/);

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
test("no better option: says so plainly rather than padding the list", async ({ page }) => {
  // The scanned product has a price; the better drinks were checked a month ago,
  // so none of them can be recommended.
  await addChecks([
    { productSlug: SCANNED_PRODUCT, retailerSlug: "carrefour-uae", priceAed: 2.75 },
    { productSlug: BETTER_DRINKS[0], retailerSlug: "carrefour-uae", priceAed: 1.75, daysAgo: 30 },
    { productSlug: BETTER_DRINKS[1], retailerSlug: "spinneys", priceAed: 24.0, daysAgo: 45 },
  ]);

  await scan(page);

  await expect(page.getByTestId("no-alternatives")).toContainText("No better verified option found.");
  await expect(page.getByTestId("alternatives")).toHaveCount(0);

  // The scanned product's own price is still shown: this is about alternatives.
  await expect(page.getByTestId("listings")).toContainText(/AED 2\.75/);
});

test("no better option: an out-of-stock alternative is not an option", async ({ page }) => {
  await addChecks([
    { productSlug: SCANNED_PRODUCT, retailerSlug: "carrefour-uae", priceAed: 2.75 },
    // Fresh checks, but the checker found empty shelves.
    { productSlug: BETTER_DRINKS[0], retailerSlug: "carrefour-uae", priceAed: 1.75, inStock: false },
    { productSlug: BETTER_DRINKS[1], retailerSlug: "spinneys", priceAed: 24.0, inStock: false },
  ]);

  await scan(page);
  await expect(page.getByTestId("no-alternatives")).toContainText("No better verified option found.");
});

test("no better option: a synthetic price can never make an alternative buyable", async ({ page }) => {
  await addChecks([
    { productSlug: SCANNED_PRODUCT, retailerSlug: "carrefour-uae", priceAed: 2.75 },
    // Recorded today, in stock, cheap — and scaffolding, so it counts for nothing.
    { productSlug: BETTER_DRINKS[0], retailerSlug: "carrefour-uae", priceAed: 1.75, source: "SYNTHETIC" },
  ]);

  await scan(page);
  await expect(page.getByTestId("no-alternatives")).toContainText("No better verified option found.");
});

/* ===========================================================================
 * 3. No price checked at all
 * ========================================================================= */
test("missing evidence: no price is invented when nobody has checked one", async ({ page }) => {
  // Only the alternatives have prices; the scanned product has none.
  await addChecks([{ productSlug: BETTER_DRINKS[0], retailerSlug: "carrefour-uae", priceAed: 1.75 }]);

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
    { productSlug: BETTER_DRINKS[0], retailerSlug: "carrefour-uae", priceAed: 1.75 },
  ]);

  await scan(page);

  const alternatives = page.getByTestId("alternatives");
  await expect(alternatives).toBeVisible();
  // The oat drink is in a different category and must not appear at any rank.
  await expect(alternatives).not.toContainText(/Oat Drink/i);
  await expect(alternatives).not.toContainText(/AED 24\.00/);
  // The water does, and it is first.
  const first = alternatives.locator("> li").first();
  await expect(first).toContainText(/AED 1\.75/);
});
