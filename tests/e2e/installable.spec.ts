/**
 * The pilot's own acceptance test: is this a thing you can put on a home screen
 * and use in a shop?
 *
 * Runs at 390px — an iPhone 14/15 — because that is the only width this app is
 * designed for and the only one it will be used at.
 */
import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";
import {
  addChecks,
  clearChecks,
  clearScans,
  disconnect,
  productIdByName,
  seedPendingScan,
  withoutCertification,
  SCANNED_PRODUCT,
} from "./fixtures";

const FIXTURE = resolve(__dirname, "../../fixtures/product.png");

test.beforeEach(async () => {
  await clearChecks();
  await clearScans();
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
  // Installed from a home screen, Noura opens the SCANNER. Someone who has
  // installed it already knows what it is and is holding a jar; the marketing
  // front door is for people arriving cold from a link.
  expect(manifest.start_url).toBe("/scan");

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

test("390px: the scanner leads with one big Scan button", async ({ page }) => {
  await page.goto("/scan");
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

  await page.goto("/scan");
  await expect(page.getByTestId("scan-button")).toBeVisible();
  await page.getByTestId("file-input").setInputFiles(FIXTURE);
  await page.getByTestId("analyse-button").click();
  await page.waitForURL(/\/result\/[a-z0-9]+/i, { timeout: 60_000 });
  await expect(page.getByTestId("loading")).toHaveCount(0);

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

/* ===========================================================================
 * The confirmation flow, at 390px.
 *
 * A tie is a question for the shopper. This drives the question the way a
 * shopper would: by tapping, with a thumb, on a phone-sized screen.
 * ========================================================================= */
test("390px: a scan it cannot separate asks, and nothing is judged until answered", async ({
  page,
}) => {
  // Seed a scan that is awaiting confirmation, the way the pipeline would.
  const scan = await seedPendingScan(page, ["Almarai milk full fat", "Al Rawabi low fat milk"]);

  await page.goto(`/result/${scan.id}`);

  const question = page.getByTestId("confirm-product");
  await expect(question).toBeVisible();
  await expect(question).toContainText(/which one is this/i);
  // The promise that nothing has been decided yet has to be on the screen.
  await expect(question).toContainText(/nothing has been checked yet/i);

  // No verdict anywhere: the analysis has not run.
  await expect(page.getByTestId("checklist")).toHaveCount(0);
  await expect(page.getByTestId("verdict")).toHaveCount(0);

  const options = page.getByTestId("confirm-option");
  await expect(options).toHaveCount(2);

  // Each option is a real tap target on a phone.
  const box = await options.first().boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  // Answer it.
  await options.first().click();

  await expect(page.getByTestId("checklist")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId("match-provenance")).toContainText("You confirmed this product");
  // A confirmed match is not re-offered.
  await expect(page.getByTestId("not-this-product")).toHaveCount(0);
});

test("the confirm endpoint refuses a product it never offered", async ({ page }) => {
  const scan = await seedPendingScan(page, ["Almarai milk full fat"]);
  const other = await productIdByName("Coca-Cola");

  // page.request, not the bare `request` fixture: this has to carry the
  // browser's noura_user cookie, or the endpoint answers 404 for "not your
  // scan" and never reaches the rule under test.
  const res = await page.request.post(`/api/scan/${scan.id}/confirm`, {
    form: { productId: other },
  });
  expect(res.status()).toBe(400);
  expect(await res.text()).toContain("not one of the options");

  // And a scan that is not yours is a 404 whatever you send — the two refusals
  // are different and both matter.
  const stranger = await page.context().browser()!.newContext();
  const anonymous = await stranger.request.post(`/api/scan/${scan.id}/confirm`, {
    form: { productId: other },
  });
  expect(anonymous.status()).toBe(404);
  await stranger.close();
});

/* ===========================================================================
 * Desktop, and the states that are not the happy path.
 * ========================================================================= */
test("desktop: the app is readable and centred at 1280px, not stretched", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  for (const path of ["/", "/scan", "/offline"]) {
    await page.goto(path);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(1);

    // The column is capped and centred rather than filling a 1280px window:
    // a 1280px-wide line of body text is unreadable, and this app is a phone
    // app that desktop visitors also open.
    const main = page.locator("main").first();
    const box = await main.boundingBox();
    expect(box!.width, `${path} main column is too wide to read`).toBeLessThanOrEqual(640);
    const centreOffset = Math.abs(box!.x + box!.width / 2 - 1280 / 2);
    expect(centreOffset, `${path} is not centred`).toBeLessThan(40);
  }
});

test("not found: an unknown address explains itself and offers a way on", async ({ page }) => {
  const res = await page.goto("/result/does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(page.getByTestId("not-found-page")).toBeVisible();
  // Scans belong to a browser, so "not yours" and "not there" look the same.
  await expect(page.getByTestId("not-found-page")).toContainText(/different phone|different browser/i);
  await page.getByRole("link", { name: /check a product/i }).click();
  await page.waitForURL(/\/scan$/);
});

test("unknown is a visible state, not a silent gap", async ({ page }) => {
  await withoutCertification(SCANNED_PRODUCT, async () => {
  await page.goto("/scan");
  await expect(page.getByTestId("scan-button")).toBeVisible();
  await page.getByTestId("file-input").setInputFiles(FIXTURE);
  await page.getByTestId("analyse-button").click();
  await page.waitForURL(/\/result\/[a-z0-9]+/i, { timeout: 60_000 });
  await expect(page.getByTestId("loading")).toHaveCount(0);

  // The word itself has to be on screen. A greyed tick or a dash reads as a
  // weak pass, which is the one thing unknown must never look like.
  const unknown = page.locator('[data-testid="check"][data-check-status="unknown"]').first();
  await expect(unknown).toBeVisible();
  await expect(unknown).toContainText(/unknown|could not/i);

  // And it is excluded from the tally rather than counted against the product.
  await expect(page.getByTestId("check-tally")).toContainText(/could not be checked|unknown/i);
  });
});
