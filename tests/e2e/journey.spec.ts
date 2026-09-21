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

import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import {
  addChecks,
  clearChecks,
  clearScans,
  disconnect,
  seedPendingScan,
  signInAsAdmin,
  withoutCertification,
} from "./fixtures";

const FIXTURE = resolve(__dirname, "../../fixtures/product.png");
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

/* ── the operational surface (§13) ──────────────────────────────────────── */

test("admin coverage shows, per product, which source was asked what", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/admin/coverage");

  await expect(page.getByTestId("coverage-page")).toBeVisible();

  // The six buckets an operator works from.
  const buckets = page.getByTestId("coverage-buckets");
  for (const label of [
    /verified for the exact product/i,
    /brand-level only/i,
    /not found in the source/i,
    /unknown or never asked/i,
    /no verified price/i,
    /no verified availability/i,
  ]) {
    await expect(buckets).toContainText(label);
  }

  // Per-product rows naming the register and the date.
  const rows = page.getByTestId("coverage-row");
  await expect(rows).not.toHaveCount(0);
  await expect(rows.first()).toContainText(/MOIAT|no source asked yet/);

  // The rule restated where an operator will read it.
  await expect(page.getByTestId("coverage-page")).toContainText(
    /not a statement that the product is uncertified/i,
  );
});

test("a checker can record availability without inventing a price", async ({ page }) => {
  // The capability §4 asked for: price and availability are independent
  // observations, and a form that demands both forces the checker to invent
  // whichever half they did not see.
  await signInAsAdmin(page);
  await page.goto("/admin/listings");

  const firstRow = page.getByTestId("queue-row").first();
  await firstRow.click();

  // Stock defaults to "didn't look", so nothing is recorded by accident.
  await expect(page.getByTestId("in-stock-unknown")).toHaveAttribute("aria-pressed", "true");

  await page.getByTestId("in-stock-yes").click();
  await page.getByTestId("checked-by-input").fill("Aisle Checker");
  await page.getByTestId("save-check").click();

  await expect(page.getByTestId("check-message")).toContainText(/Saved/i);
});

test("recording neither fact is refused, rather than stored as a blank check", async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto("/admin/listings");
  await page.getByTestId("queue-row").first().click();

  await page.getByTestId("checked-by-input").fill("Aisle Checker");
  await page.getByTestId("save-check").click();

  await expect(page.getByTestId("check-message")).toContainText(
    /record a price, or whether it was in stock/i,
  );
});

/* ── the fixture warning, as a person would meet it ─────────────────────── */

test("a fixture scan says so before it says anything else", async ({ page }) => {
  // The whole suite runs with NOURA_FORCE_MOCK=1, so every scan here is a
  // fixture — which makes this the right place to assert the warning exists and
  // comes first.
  await page.goto("/scan");
  await page.getByTestId("file-input").setInputFiles(FIXTURE);
  await page.getByTestId("analyse-button").click();
  await page.waitForURL(/\/result\/[a-z0-9]+/i, { timeout: 60_000 });

  const warning = page.getByTestId("fixture-warning");
  await expect(warning).toBeVisible();
  await expect(warning).toContainText(/nothing was read from your photo/i);
  await expect(warning).toContainText(/fixture product/i);

  // Above the product name on the page, not tucked in beside it.
  const warningBox = await warning.boundingBox();
  const nameBox = await page.getByTestId("product-name").boundingBox();
  expect(warningBox!.y).toBeLessThan(nameBox!.y);
});
