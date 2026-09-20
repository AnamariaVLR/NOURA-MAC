/**
 * Noura's service worker.
 *
 * ── What it does, and the much longer list of what it does not ──────────────
 *
 * It caches the APP SHELL — the home page, the icons, the offline page — so that
 * opening Noura from a home screen in a supermarket basement shows something
 * immediately instead of a browser error. That is the whole ambition.
 *
 * IT NEVER CACHES A RESULT, A HISTORY PAGE, OR ANYTHING UNDER /admin OR /api.
 *
 * That exclusion is not a performance decision, it is the product's central
 * claim. Noura's promise is that a price was checked by a person on a date and a
 * verdict rests on evidence fetched on a date. A cached result page would show
 * yesterday's price as though it were today's, and a cached admin queue would
 * show an operator a row someone else had already done. "Verified" has to mean
 * verified now, so anything carrying a date is fetched or it is not shown.
 *
 * Strategies:
 *   navigation requests  → network first, fall back to the cached shell, then to
 *                          /offline. A stale home screen is fine; a stale result
 *                          is not, so only the shell is ever served from cache.
 *   static assets        → cache first. Hashed filenames make them immutable.
 *   everything else      → straight to the network, no caching, no interception.
 */

const VERSION = "noura-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const OFFLINE_URL = "/offline";

/** The minimum set that makes the app open at all with no connection. */
const SHELL = ["/", OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

/** Never cached, never served from cache, under any circumstances. */
function isNeverCached(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/result/") ||
    url.pathname.startsWith("/history")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // addAll fails the whole install if any single URL 404s; this is more
      // forgiving so one renamed icon cannot leave the app with no worker.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isNeverCached(url)) return; // straight through, uncached

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Only the home page is worth keeping; every other navigable page
          // either carries a date or is behind a password.
          if (url.pathname === "/" && response.ok) {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put("/", copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(url.pathname === "/" ? "/" : OFFLINE_URL);
          return cached ?? caches.match(OFFLINE_URL) ?? Response.error();
        }),
    );
    return;
  }

  // Static assets: cache first, because Next fingerprints their filenames.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
  }
});
