import type { MetadataRoute } from "next";

/**
 * The web app manifest — what turns the URL into something on a home screen.
 *
 * `display: "standalone"` removes the browser chrome, which is the whole point:
 * a shopper opening this from their home screen should not see an address bar
 * they might tap by accident while holding a jar.
 *
 * `orientation: "portrait"` because every screen in this app is laid out for a
 * 390px column and none of them has anything useful to do with landscape.
 *
 * The colours are the app's own: --color-paper for the background the splash
 * screen paints, --color-brand for the theme colour Android tints the status bar
 * with. They are duplicated here rather than imported because a manifest is
 * static JSON served at build time and cannot read a CSS custom property.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Noura",
    short_name: "Noura",
    description:
      "Photograph a product in a UAE supermarket. Noura checks the published evidence against " +
      "sourced thresholds and says plainly what it can and cannot verify.",
    // Installed from a home screen, Noura opens the SCANNER, not the marketing
    // page. Someone who has installed it already knows what it is; they are
    // holding a jar. The front door is still there at "/" for anyone arriving
    // cold from a link.
    start_url: "/scan",
    // Anything under the app is in scope; nothing outside it is.
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f5f0",
    theme_color: "#6f8067",
    lang: "en",
    dir: "ltr",
    categories: ["food", "health", "shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Scan a product",
        short_name: "Scan",
        url: "/scan",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
