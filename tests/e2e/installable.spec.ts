/**
 * The pilot's own acceptance test: is this a thing you can put on a home screen
 * and use in a shop?
 *
 * Runs at 390px — an iPhone 14/15 — because that is the only width this app is
 * designed for and the only one it will be used at.
 */
import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { addChecks, clearChecks, disconnect } from "./fixtures";

const FIXTURE = resolve(__dirname, "../../fixtures/product.png");

test.beforeEach(async () => {
  await clearChecks();
});

test.afterAll(async () => {
  await clearChecks();
  await disconnect();
});

/* ===========================================================================
 * Installability
 * ========================================================================= */
test("manifest: describes an installable, standalone, portrait app", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);

  const manifest = await res.json();
  expect(manifest.name).toBe("Noura");
  expect(manifest.short_name).toBe("Noura");
  expect(manifest.display).toBe("standalone");
  expect(manifest.orientation).toBe("portrait");
  expect(manifest.start_url).toBe("/");

  // The palette, not an approximation of it.
  expect(manifest.theme_color).toBe("#6f8067");
  expect(manifest.background_color).toBe("#f7f5f0");

  // 192 and 512 are the Android minimum; a maskable 512 stops the launcher
  // cropping the mark on a round icon.
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toContain("192x192");
  expect(sizes).toContain("512x512");
  expect(
    manifest.icons.some((i: { purpose?: string }) => i.purpose?.includes("maskable")),
  ).toBe(true);
});

test("icons: every file the manifest promises is actually served", async ({ request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  const urls = [
    ...manifest.icons.map((i: { src: string }) => i.src),
    "/icons/apple-touch-icon-180.png",
  ];

  for (const url of urls) {
    const res = await request.get(url);
    expect(res.ok(), `${url} is missing`).toBe(true);
    expect(res.headers()["content-type"]).toContain("image/png");
    // A 0-byte PNG passes a 200 check and fails on a home screen.
    expect((await res.body()).byteLength).toBeGreaterThan(500);
  }
});

test("iOS: the tags that make it open full-screen from the home screen", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", /manifest/);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    /apple-touch-icon-180/,
  );
  // Both spellings. The unprefixed one is current; the apple-prefixed one is
  // deprecated and is still the only one older iOS acts on.
  await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
  await expect(page.locator('meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute(
    "content",
    "yes",
  );
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute(
    "content",
    "default",
  );
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute(
    "content",
    "Noura",
  );
  // viewport-fit=cover lets the page own the area behind the notch.
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
});

/* ===========================================================================
 * The service worker, and the pages it must never keep
 * ========================================================================= */
test("service worker: caches the shell and excludes anything with a date on it", async ({
  request,
}) => {
  const res = await request.get("/sw.js");
  expect(res.ok()).toBe(true);
  const source = await res.text();

  // The exclusion list is the product's promise in code form.
  for (const path of ["/api/", "/admin", "/result/", "/history"]) {
    expect(source, `${path} must never be cached`).toContain(path);
  }
  expect(source).toContain("isNeverCached");
  expect(source).toContain("/offline");
});

test("offline: the page says what is wrong and what still works", async ({ page }) => {
  await page.goto("/offline");
  await expect(page.getByTestId("offline-page")).toBeVisible();
  await expect(page.getByRole("heading", { name: /no connection/i })).toBeVisible();
  // It has to tell the shopper what to do, not just that something failed.
  await expect(page.getByTestId("offline-page")).toContainText(/take the photo anyway/i);
});

/* ===========================================================================
 * Every screen at 390px
 * ========================================================================= */
async function assertNoHorizontalOverflow(page: Page, label: string) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  // A phone screen that scrolls sideways reads as broken.
  expect(overflow, `${label} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
}

test("390px: the home screen leads with one big Scan button", async ({ page }) => {
  await page.goto("/");
  expect(page.viewportSize()?.width).toBe(390);

  const scan = page.getByTestId("scan-button");
  await expect(scan).toBeVisible();
  await expect(scan).toContainText(/scan a product/i);

  // The primary action has to be genuinely big: a thumb, in a shop, one-handed.
  const box = await scan.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(56);
  expect(box!.width).toBeGreaterThan(300);

  // The camera input opens the REAR camera directly, not a file picker.
  const camera = page.locator('input[type="file"][capture="environment"]');
  await expect(camera).toHaveCount(1);
  await expect(camera).toHaveAttribute("accept", /image/);

  // And the secondary action exists without competing with it.
  const choose = page.getByTestId("choose-file");
  await expect(choose).toBeVisible();
  const chooseBox = await choose.boundingBox();
  expect(chooseBox!.height).toBeLessThan(box!.height);

  await assertNoHorizontalOverflow(page, "home");
});

test("390px: scan, result, and history all fit the screen", async ({ page }) => {
  await addChecks([
    { productSlug: "coca-cola-330ml", retailerSlug: "carrefour-uae", priceAed: 2.75 },
    { productSlug: "al-ain-water-500ml", retailerSlug: "carrefour-uae", priceAed: 1.75 },
  ]);

  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles(FIXTURE);
  await page.getByTestId("analyse-button").click();
  await page.waitForURL(/\/result\/[a-z0-9]+/i, { timeout: 60_000 });

  await expect(page.getByTestId("product-name")).toBeVisible();
  await expect(page.getByTestId("checklist")).toBeVisible();
  await assertNoHorizontalOverflow(page, "result");

  await page.goto("/history");
  await assertNoHorizontalOverflow(page, "history");
});

test("390px: the admin form asks for a password, and takes one", async ({ page }) => {
  await page.goto("/admin/listings");

  // Redirected to the login, with the destination preserved.
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByTestId("admin-login-form")).toBeVisible();
  await assertNoHorizontalOverflow(page, "admin login");

  // A wrong password is refused, in words.
  await page.getByTestId("admin-password").fill("not-the-password");
  await page.getByTestId("admin-login-submit").click();
  await expect(page.getByTestId("admin-login-error")).toBeVisible();

  // The right one gets through to the queue.
  await page.getByTestId("admin-password").fill(process.env.ADMIN_PASSWORD ?? "playwright-admin-password");
  await page.getByTestId("admin-login-submit").click();
  await page.waitForURL(/\/admin\/listings/, { timeout: 20_000 });
  await expect(page.getByTestId("listing-queue")).toBeVisible();
  await assertNoHorizontalOverflow(page, "admin listings");
});
