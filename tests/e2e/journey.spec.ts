/**
 * The complete product, not the functions.
 *
 * Each test drives a real scan to a real result page and asserts what the page
 * TELLS A PERSON — because every bug this project has had that mattered was a
 * true calculation described in words it did not support.
 *
 * Products are chosen for their evidence state, not their names:
 *   Activia low fat stirred yoghurt   UAE conformity VERIFIED
 *   Al Rawabi low fat milk            UAE conformity BRAND_LEVEL_ONLY
 *   Alalali Skipjack tuna             UAE conformity NOT_FOUND
 */

import { expect, test, type Page } from "@playwright/test";
import {
  addChecks,
  clearChecks,
  clearScans,
  disconnect,
  seedPendingScan,
  withoutCertification,
} from "./fixtures";

const PHONE = { width: 390, height: 844 };

test.beforeEach(async ({ page }) => {
  await clearChecks();
  await clearScans();
  await page.setViewportSize(PHONE);
});
test.afterAll(async () => {
  await clearChecks();
  await disconnect();
});

/** Seed a pending scan for one product, confirm it, land on the result. */
async function scanAndConfirm(page: Page, productName: string): Promise<void> {
  const scan = await seedPendingScan(page, [productName]);
  await page.goto(`/result/${scan.id}`);
  await expect(page.getByTestId("confirm-product")).toBeVisible();
  await page.getByTestId("confirm-option").first().click();
  await expect(page.getByTestId("verdict")).toBeVisible({ timeout: 60_000 });
}

async function noHorizontalOverflow(page: Page, where: string): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, `${where} overflows 390px`).toBeLessThanOrEqual(1);
}

/* ── certification states, as a person reads them ───────────────────────── */

test("VERIFIED: the page says which certificate, from which register", async ({ page }) => {
  await scanAndConfirm(page, "low fat stirred yoghurt");

  const claims = page.getByTestId("claim-evidence");
  await expect(claims).not.toHaveCount(0);
  await expect(claims.filter({ hasText: /UAE conformity/i })).toContainText(
    /verified for this exact product/i,
  );
  // A certificate claim without its register is not a claim we may print.
  await expect(claims.filter({ hasText: /UAE conformity/i })).toContainText(/MOIAT/);
  await noHorizontalOverflow(page, "verified result");
});

test("BRAND_LEVEL_ONLY: the brand is in the register and the product is not", async ({ page }) => {
  await scanAndConfirm(page, "Al Rawabi low fat milk");

  const uae = page.getByTestId("claim-evidence").filter({ hasText: /UAE conformity/i });
  await expect(uae).toContainText(/brand appears/i);
  // The distinction the whole evidence model exists to preserve.
  await expect(uae).not.toContainText(/verified for this exact product/i);
});

test("NOT_FOUND: no record in the named source, and never 'not certified'", async ({ page }) => {
  await scanAndConfirm(page, "Skipjack tuna");

  const uae = page.getByTestId("claim-evidence").filter({ hasText: /UAE conformity/i });
  await expect(uae).toContainText(/no record found/i);
  await expect(uae).toContainText(/MOIAT/);

  const body = (await page.locator("body").innerText()).toLowerCase();
  expect(body).not.toMatch(/\b(is|are) (not certified|uncertified)\b/);
});

test("UNKNOWN: a question we could not ask reads differently from one we asked", async ({ page }) => {
  await withoutCertification("alalali-tuna-170g", async () => {
    await scanAndConfirm(page, "Skipjack tuna");
    const check = page.locator('[data-testid="check"][data-check-key="certification"]');
    await expect(check).toHaveAttribute("data-check-status", "unknown");
    await expect(check).toContainText(/could not|not been searched/i);
  });
});

/* ── commerce provenance on the page ────────────────────────────────────── */

test("a hand-checked price says so, with the person and the date", async ({ page }) => {
  await addChecks([
    { productSlug: "activia-low-fat-stirred-yoghurt", retailerSlug: "carrefour-uae", priceAed: 7.5 },
  ]);
  await scanAndConfirm(page, "low fat stirred yoghurt");

  const listing = page.getByTestId("listing").first();
  await expect(listing).toContainText(/AED 7\.50/);
  await expect(listing.getByTestId("freshness-label")).toContainText(
    /Price checked by hand on .+ by/i,
  );
  await expect(listing.getByTestId("availability")).toContainText(/in stock on/i);
  await noHorizontalOverflow(page, "priced result");
});

test("no price is invented when nobody has checked one", async ({ page }) => {
  await scanAndConfirm(page, "Skipjack tuna");

  await expect(page.getByTestId("no-listings")).toContainText(/No price has been checked/i);
  const whereToBuy = await page.getByTestId("where-to-buy").innerText();
  expect(whereToBuy).not.toMatch(/AED \d/);
  // And nothing OFFERS an estimate. The word itself is allowed — the copy says
  // "rather than show an estimate, it shows nothing", which is the promise being
  // kept, not broken. What must never appear is a number dressed as one.
  const lower = whereToBuy.toLowerCase();
  expect(lower).not.toMatch(/(estimated|approx\.?|approximately|around|about)\s*(aed|\d)/);
  expect(lower).toMatch(/rather than show an estimate/);
});

test("a lapsed check is shown as lapsed, never as current", async ({ page }) => {
  await addChecks([
    {
      productSlug: "activia-low-fat-stirred-yoghurt",
      retailerSlug: "carrefour-uae",
      priceAed: 7.5,
      daysAgo: 40,
    },
  ]);
  await scanAndConfirm(page, "low fat stirred yoghurt");

  const listing = page.getByTestId("listing").first();
  await expect(listing.getByTestId("freshness-label")).toContainText(/not verified recently/i);
  await expect(listing.getByTestId("availability")).toContainText(/not confirmed/i);
  // The number is still there — it is the last thing we know — just not current.
  await expect(listing).toContainText(/AED 7\.50/);
});

/* ── the first screen, on a phone ───────────────────────────────────────── */

test("390px: the six questions are answerable without pinching", async ({ page }) => {
  await scanAndConfirm(page, "low fat stirred yoghurt");

  // WHAT IS THIS — identity and how we got there.
  await expect(page.getByTestId("product-name")).not.toBeEmpty();
  await expect(page.getByTestId("match-provenance")).not.toBeEmpty();
  // WHAT DO WE KNOW / WHY — a verdict with the arithmetic beneath it.
  await expect(page.getByTestId("verdict")).toBeVisible();
  await expect(page.getByTestId("check-tally")).toBeVisible();
  // WHAT ARE THE ALTERNATIVES / WHERE CAN I BUY.
  await expect(page.getByTestId("better-options")).toBeVisible();
  await expect(page.getByTestId("where-to-buy")).toBeVisible();

  await noHorizontalOverflow(page, "result page");

  // The verdict must not borrow the evidence layer's vocabulary.
  const verdict = await page.getByTestId("verdict").innerText();
  expect(verdict).not.toMatch(/VERIFIED —/);
});
