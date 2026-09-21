/**
 * THE INVARIANT.
 *
 * Noura may never present a verdict, evidence, certification, alternatives or
 * commerce about a product the user did not photograph or choose.
 *
 * This file tests the failure rather than the functions, because the failure it
 * exists to prevent already happened and looked completely normal: a photograph
 * of Al Rawabi Greek yoghurt returned a full Coca-Cola assessment — correct
 * sugar figure, real EFSA citation, cited sources — because the server had no
 * API key and silently used a fixture.
 *
 * Every test here asserts on the SCAN ROW as well as the page, because the page
 * looked right and the row was the only place the truth lived.
 */

import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { clearScans, disconnect, prisma, seedPendingScan } from "./fixtures";

const PACK_PHOTO = resolve(__dirname, "../../fixtures/product.png");
const PHONE = { width: 390, height: 844 };

test.beforeEach(async ({ page }) => {
  await clearScans();
  await page.setViewportSize(PHONE);
});
test.afterAll(async () => {
  await disconnect();
});

async function scan(page: Page, file: string): Promise<string> {
  await page.goto("/scan");
  await page.getByTestId("file-input").setInputFiles(file);
  await page.getByTestId("analyse-button").click();
  await page.waitForURL(/\/result\/[a-z0-9]+/i, { timeout: 60_000 });
  return page.url().split("/result/")[1];
}

/** What the database says about how this scan got its identity. */
async function row(scanId: string) {
  const scan = await prisma().scan.findUnique({
    where: { id: scanId },
    include: { analysis: true },
  });
  if (!scan) throw new Error(`no scan ${scanId}`);
  return scan;
}

/* ── B. Explicit mock mode ─────────────────────────────────────────────── */

test("B: an explicit fixture is labelled as one, before the product name", async ({ page }) => {
  // The whole suite runs with NOURA_FORCE_MOCK=1, which is the ONLY way a
  // fixture can now be produced at all.
  const id = await scan(page, PACK_PHOTO);

  const scanRow = await row(id);
  expect(scanRow.identificationMode).toBe("mock");
  expect(scanRow.identificationProvenance).toBe("fixture");

  const warning = page.getByTestId("fixture-warning");
  await expect(warning).toBeVisible();
  await expect(warning).toContainText(/nothing was read from your photo/i);
  await expect(warning).toContainText(/fixture used for testing/i);
  await expect(warning).toContainText(/was not identified from your image/i);

  // Above the name, and full width — not a chip beside it.
  const warningBox = (await warning.boundingBox())!;
  const nameBox = (await page.getByTestId("product-name").boundingBox())!;
  expect(warningBox.y).toBeLessThan(nameBox.y);
  expect(warningBox.width).toBeGreaterThan(PHONE.width * 0.8);
});

/* ── D + E. Uncertain, then confirmed ──────────────────────────────────── */

test("D: an uncertain identification shows candidates and NO verdict", async ({ page }) => {
  const scanRow = await seedPendingScan(page, [
    "Almarai milk full fat",
    "Al Rawabi low fat milk",
  ]);
  await page.goto(`/result/${scanRow.id}`);

  await expect(page.getByTestId("confirm-product")).toBeVisible();
  // Nothing may be evaluated before the question is answered.
  await expect(page.getByTestId("verdict")).toHaveCount(0);
  await expect(page.getByTestId("checklist")).toHaveCount(0);
  await expect(page.getByTestId("better-options")).toHaveCount(0);
  await expect(page.getByTestId("where-to-buy")).toHaveCount(0);

  const stored = await row(scanRow.id);
  expect(stored.analysis).toBeNull();
  expect(stored.productId).toBeNull();
});

test("E: confirming records the user as the provenance, and only then evaluates", async ({
  page,
}) => {
  const pending = await seedPendingScan(page, ["Almarai milk full fat"]);
  await page.goto(`/result/${pending.id}`);
  await page.getByTestId("confirm-option").first().click();
  await expect(page.getByTestId("verdict")).toBeVisible({ timeout: 60_000 });

  const stored = await row(pending.id);
  expect(stored.identificationMode).toBe("confirmed");
  expect(stored.identificationProvenance).toBe("user_confirmed");
  expect(stored.analysis).not.toBeNull();
  await expect(page.getByTestId("match-provenance")).toContainText(/you confirmed/i);
});

/* ── F. No contamination between scans ─────────────────────────────────── */

test("F: a second scan cannot inherit the first scan's identity", async ({ page }) => {
  const first = await scan(page, PACK_PHOTO);
  const firstRow = await row(first);

  const second = await scan(page, PACK_PHOTO);
  expect(second).not.toBe(first);

  const secondRow = await row(second);
  // Same fixture, so the same product — but a DIFFERENT scan row and a
  // different analysis, derived independently rather than carried over.
  expect(secondRow.id).not.toBe(firstRow.id);
  expect(secondRow.analysis?.id).not.toBe(firstRow.analysis?.id);

  // And a scan belongs to the browser that made it: another visitor cannot read
  // it, so no identity leaks across sessions.
  const stranger = await page.context().browser()!.newContext();
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(`/result/${first}`);
  // A browser that never made this scan cannot read it — including one with no
  // cookie at all, which is the case the original check silently skipped.
  await expect(strangerPage.getByTestId("not-found-page")).toBeVisible();
  await stranger.close();
});

/* ── The data-level claim, not the page text ───────────────────────────── */

test("every scan row records a mode, and only some modes may carry a verdict", async ({ page }) => {
  const id = await scan(page, PACK_PHOTO);
  const stored = await row(id);

  expect(["live", "confirmed", "mock", "failed", "uncertain"]).toContain(stored.identificationMode);
  expect(["barcode", "image_model", "user_confirmed", "fixture", "none"]).toContain(
    stored.identificationProvenance,
  );

  // The invariant, stated against the database: an analysis exists only for a
  // mode that means a product was actually established.
  const all = await prisma().scan.findMany({ include: { analysis: true } });
  for (const s of all) {
    if (s.analysis) {
      expect(
        ["live", "confirmed", "mock"],
        `scan ${s.id} carries an analysis with mode ${s.identificationMode}`,
      ).toContain(s.identificationMode);
    }
  }
});

/* ── K: the identity record survives the lifecycle ─────────────────────── */

test("K: identity state, record and fingerprint persist on the scan", async ({ page }) => {
  const id = await scan(page, PACK_PHOTO);
  const stored = await row(id);

  // Machine-readable, not a presentation label.
  expect([
    "IDENTIFIED_AND_VERIFIED",
    "IDENTIFIED_BY_BARCODE",
    "IDENTIFIED_BY_NAME_WITH_CORROBORATION",
    "IDENTIFIED_BY_NAME_ONLY",
    "NEEDS_CONFIRMATION",
    "NOT_IDENTIFIED",
    "INSUFFICIENT_EVIDENCE",
  ]).toContain(stored.identityState);

  // A scan carrying an analysis must carry the identity that analysis is about.
  if (stored.analysis) {
    expect(stored.identityFingerprint, "an analysed scan has no fingerprint").toBeTruthy();
    expect(stored.identityJson).toBeTruthy();

    const record = JSON.parse(stored.identityJson!) as Record<string, unknown>;
    // Enough to audit the decision without re-running anything.
    for (const key of [
      "state", "fingerprint", "claimedBrand", "claimedName", "claimedBarcode",
      "visibleText", "matchedProductId", "matchedBrand", "matchMethod",
      "brandAgrees", "textCorroborates", "barcodeContradicted", "reason",
    ]) {
      expect(Object.keys(record), key).toContain(key);
    }
    expect(record.fingerprint).toBe(stored.identityFingerprint);
    expect(record.matchedProductId).toBe(stored.productId);
  }
});

test("K: a confirmed scan records the user as the identity, with a fresh fingerprint", async ({
  page,
}) => {
  const pending = await seedPendingScan(page, ["Almarai milk full fat"]);
  await page.goto(`/result/${pending.id}`);
  await page.getByTestId("confirm-option").first().click();
  await expect(page.getByTestId("verdict")).toBeVisible({ timeout: 60_000 });

  const stored = await row(pending.id);
  expect(stored.identityState).toBe("IDENTIFIED_AND_VERIFIED");
  expect(stored.identityFingerprint).toBeTruthy();
  expect(stored.productId).toBeTruthy();
});
