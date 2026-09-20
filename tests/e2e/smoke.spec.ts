/**
 * The end-to-end smoke test: a fixture image goes in at 390px and a complete result
 * screen comes out. Runs against a production build with no ANTHROPIC_API_KEY and
 * VERIFIED_OFFLINE=1, so it proves the app works with no key and no network.
 */
import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { BETTER_DRINKS, SCANNED_PRODUCT, addChecks, clearChecks, disconnect } from "./fixtures";

const FIXTURE = resolve(__dirname, "../../fixtures/product.png");

const VERDICTS = [
  "VERIFIED — GOOD CHOICE",
  "VERIFIED — ACCEPTABLE",
  "NOT RECOMMENDED",
  "COULD NOT VERIFY",
];

// Prices exist only as recorded checks, so the smoke test records the ones it needs.
test.beforeEach(async () => {
  await clearChecks();
  await addChecks([
    { productSlug: SCANNED_PRODUCT, retailerSlug: "carrefour-uae", priceAed: 2.75 },
    { productSlug: BETTER_DRINKS[0], retailerSlug: "carrefour-uae", priceAed: 1.75 },
  ]);
});

test.afterAll(async () => {
  await clearChecks();
  await disconnect();
});

async function scanFixture(page: Page) {
  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles(FIXTURE);
  await expect(page.getByTestId("analyse-button")).toBeEnabled();
  await page.getByTestId("analyse-button").click();
  await page.waitForURL(/\/result\/[a-z0-9]+/i, { timeout: 60_000 });
}

test("upload a fixture image and reach a full result page", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Verified healthy products/i })).toBeVisible();
  await expect(page.getByText(/Running in example mode/i)).toBeVisible();

  await scanFixture(page);

  // ---- identification ----------------------------------------------------
  await expect(page.getByTestId("product-name")).toBeVisible();
  await expect(page.getByTestId("product-name")).not.toBeEmpty();

  // ---- verdict, not a score ----------------------------------------------
  const verdict = page.getByTestId("verdict");
  await expect(verdict).toBeVisible();
  const verdictText = (await verdict.innerText()).trim();
  expect(VERDICTS.some((v) => verdictText.startsWith(v))).toBe(true);

  // The 0-100 score is gone: nothing on the page may show one.
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/\b\d{1,3}\s*\/\s*100\b/);
  expect(body).not.toMatch(/Health score/i);

  // ---- the checklist -----------------------------------------------------
  const checks = page.getByTestId("check");
  const checkCount = await checks.count();
  expect(checkCount).toBeGreaterThanOrEqual(3);

  // Every row is one of the three states, and carries its evidence and source.
  for (let i = 0; i < checkCount; i++) {
    const row = checks.nth(i);
    expect(["pass", "fail", "unknown"]).toContain(await row.getAttribute("data-check-status"));
    await expect(row.getByTestId("source-note")).toHaveCount(1);
    await expect(row.getByTestId("source-note")).toContainText(/last verified/i);
  }

  // A passed check must never be rendered for missing data.
  const passedRows = page.locator('[data-testid="check"][data-check-status="pass"]');
  for (let i = 0; i < (await passedRows.count()); i++) {
    await expect(passedRows.nth(i)).not.toContainText(/unknown/i);
  }

  // Unknown rows say "unknown" in words rather than showing a tick or a cross.
  const unknownRows = page.locator('[data-testid="check"][data-check-status="unknown"]');
  for (let i = 0; i < (await unknownRows.count()); i++) {
    const text = await unknownRows.nth(i).innerText();
    expect(text).toMatch(/unknown|not assessable|not verified/i);
    expect(text).not.toContain("✓");
  }

  // The tally agrees with the rows on screen.
  const tally = await page.getByTestId("check-tally").innerText();
  expect(Number(tally.match(/(\d+) passed/)?.[1])).toBe(await passedRows.count());

  // ---- the disclaimer is not optional ------------------------------------
  await expect(page.getByTestId("disclaimer")).toContainText(/not medical advice/i);

  // ---- UAE listings, priced in AED ---------------------------------------
  expect(await page.getByTestId("listings").locator("li").count()).toBeGreaterThan(0);
  await expect(page.getByTestId("listings")).toContainText(/AED \d+\.\d{2}/);

  // ---- prices carry an author and a date ---------------------------------
  await expect(page.getByTestId("freshness-label").first()).toContainText(/Verified by hand on/i);

  // ---- alternatives ------------------------------------------------------
  await expect(page.getByText(/Better options/i).first()).toBeVisible();

  const alternatives = page.getByTestId("alternatives").locator("> li");
  const altCount = await alternatives.count();

  if (altCount === 0) {
    await expect(page.getByTestId("no-alternatives")).toContainText(/No better verified option found/i);
  } else {
    expect(altCount).toBeLessThanOrEqual(3);
    for (let i = 0; i < altCount; i++) {
      const alt = alternatives.nth(i);
      await expect(alt.getByTestId("medal")).toHaveAttribute("aria-label", `Rank ${i + 1}`);
      await expect(alt).toContainText(/AED \d+\.\d{2}/);
      await expect(alt.getByTestId("why")).not.toBeEmpty();
    }
  }

  // ---- every fact is attributed ------------------------------------------
  expect(await page.getByTestId("source-note").count()).toBeGreaterThan(3);

  // ---- nothing overflows a 390px screen ----------------------------------
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the fixture product is judged, and its alternatives are in stock", async ({ page }) => {
  await scanFixture(page);

  // The mock fixture is a sugary ultra-processed drink, so the verdict must not be
  // one of the two VERIFIED ones — proof the verdict reflects the evidence rather
  // than defaulting to something cheerful.
  await expect(page.getByTestId("verdict")).toHaveAttribute("data-verdict", "not_recommended");

  // Its added-sugar check must be a visible failure, quoting the quantity.
  const addedSugars = page.locator('[data-testid="check"][data-check-key="addedSugars"]');
  await expect(addedSugars).toHaveAttribute("data-check-status", "fail");
  await expect(addedSugars).toContainText(/Contains added sugar/);
  // Total sugars is reported beside it as a separate, clearly-labelled fact.
  await expect(addedSugars).toContainText(/Total sugars are/);

  expect(await page.getByTestId("alternatives").locator("> li").count()).toBeGreaterThan(0);
  await expect(page.getByTestId("alternatives")).not.toContainText(/out of stock/i);
  await expect(page.getByTestId("alternatives")).toContainText(/Verified by hand/i);
});

test("the scan appears in history with its verdict, and the image is served back", async ({ page }) => {
  await scanFixture(page);

  const scanId = page.url().split("/result/")[1];
  const image = await page.request.get(`/api/image/${scanId}`);
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toContain("image/png");

  await page.goto("/history");
  await expect(page.getByRole("heading", { name: /Your scans/i })).toBeVisible();
  const row = page.locator(`a[href="/result/${scanId}"]`);
  await expect(row).toBeVisible();
  // History shows the verdict, not a number.
  await expect(row).toContainText(new RegExp(VERDICTS.join("|")));
  await expect(row).not.toContainText(/\d+\s*\/\s*100/);
});

test("a bad upload is refused with a readable message", async ({ page }) => {
  await page.goto("/");
  const response = await page.request.post("/api/scan", {
    multipart: {
      image: { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not an image") },
    },
  });
  expect(response.status()).toBe(400);
  expect((await response.json()).error).toMatch(/JPEG|PNG|WebP|GIF/i);
});
