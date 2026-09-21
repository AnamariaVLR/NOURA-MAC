/**
 * A, G, H — what happens when identification is NOT available.
 *
 * This suite runs against a server started WITHOUT NOURA_FORCE_MOCK and without
 * an API key: precisely the configuration that produced the Coca-Cola incident.
 * It is a separate project in playwright.config.ts because it needs a different
 * server, and the whole point is that this configuration must now fail closed.
 */

import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const PACK_PHOTO = resolve(__dirname, "../../fixtures/product.png");
const client = new PrismaClient();

test.afterAll(async () => {
  await client.$disconnect();
});

test("A/G/H: no identification available means no verdict about anything", async ({ page }) => {
  await page.goto("/scan");
  await page.getByTestId("file-input").setInputFiles(PACK_PHOTO);
  await page.getByTestId("analyse-button").click();
  await page.waitForURL(/\/result\/[a-z0-9]+/i, { timeout: 60_000 });

  const id = page.url().split("/result/")[1];

  // ── The page says what happened, in the words the spec asks for ────────
  await expect(page.getByTestId("not-identified")).toBeVisible();
  await expect(page.getByTestId("not-identified")).toContainText(/product not identified/i);

  // ── And shows NOTHING about any product ────────────────────────────────
  await expect(page.getByTestId("verdict")).toHaveCount(0);
  await expect(page.getByTestId("checklist")).toHaveCount(0);
  await expect(page.getByTestId("check")).toHaveCount(0);
  await expect(page.getByTestId("claim-evidence")).toHaveCount(0);
  await expect(page.getByTestId("better-options")).toHaveCount(0);
  await expect(page.getByTestId("alternatives")).toHaveCount(0);
  await expect(page.getByTestId("where-to-buy")).toHaveCount(0);
  await expect(page.getByTestId("listings")).toHaveCount(0);

  // Not a fixture, and specifically not the fixture that caused this.
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/coca-cola/i);
  expect(body).not.toMatch(/fixture/i);

  // ── The row agrees with the page ───────────────────────────────────────
  const scan = await client.scan.findUnique({ where: { id }, include: { analysis: true } });
  expect(scan).not.toBeNull();
  expect(scan!.identificationMode).toBe("failed");
  expect(scan!.identificationProvenance).toBe("none");
  expect(scan!.productId).toBeNull();
  expect(scan!.analysis).toBeNull();
  expect(scan!.status).toBe("failed");
});

test("the failure explains itself rather than blaming the photo", async ({ page }) => {
  await page.goto("/scan");
  await page.getByTestId("file-input").setInputFiles(PACK_PHOTO);
  await page.getByTestId("analyse-button").click();
  await page.waitForURL(/\/result\/[a-z0-9]+/i, { timeout: 60_000 });

  // The real reason is a server configuration, and saying "try a clearer photo"
  // would send someone to retake a photo that was never the problem.
  await expect(page.getByTestId("not-identified")).toContainText(/not configured|identification/i);
});
