import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: "Noura — verified healthy products in the UAE",
  description:
    "Photograph a product. Noura identifies it, checks the published evidence, says plainly whether it is a good choice, and shows the best alternative you can actually buy in the UAE.",
  applicationName: "Noura",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    // iOS ignores the manifest for the home-screen icon and reads this tag.
    apple: [{ url: "/icons/apple-touch-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    // The three tags that make iOS launch this full-screen from the home screen
    // rather than in a Safari view with the address bar still showing.
    capable: true,
    title: "Noura",
    // "default" keeps the status bar legible against the warm paper background;
    // "black-translucent" would put dark text over the header on a light theme.
    statusBarStyle: "default",
  },
  // A phone number in a product name is not a phone number.
  formatDetection: { telephone: false, date: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Installed from a home screen there is no address bar to shrink, so the page
  // should own the whole screen including behind the notch.
  viewportFit: "cover",
  // Matches --color-brand in globals.css. The old value here was a different
  // green that appeared nowhere else in the app.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#6f8067" },
    { media: "(prefers-color-scheme: dark)", color: "#16160f" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/*
          Next emits the modern `mobile-web-app-capable`, which is what current
          iOS and Android read. The apple-prefixed spelling is deprecated and is
          still the ONLY one older iOS honours — and "older iOS" is a phone
          someone is holding in a supermarket today. Emitting both costs one tag
          and is the difference between launching full-screen and launching
          inside Safari with the address bar still there.
        */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-dvh antialiased">
        <div className="mx-auto flex min-h-dvh w-full max-w-[540px] flex-col">
          <header className="sticky top-0 z-10 border-b border-line bg-paper/90 backdrop-blur">
            <div className="flex items-center justify-between px-4 py-3">
              <Link href="/" className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="grid h-7 w-7 place-items-center rounded-full bg-brand text-[13px] font-bold text-white"
                >
                  ✓
                </span>
                <span className="text-[15px] font-semibold tracking-tight">Noura</span>
              </Link>
              <nav className="flex items-center gap-4 text-[13px] text-ink-soft">
                <Link href="/history" className="hover:text-ink">
                  History
                </Link>
                <Link href="/admin/listings" className="hover:text-ink">
                  Admin
                </Link>
              </nav>
            </div>
          </header>

          <main className="flex-1 px-4 pb-10 pt-5">{children}</main>

          <footer className="border-t border-line px-4 py-5 text-[11px] leading-relaxed text-ink-faint">
            Noura shows published product data with its source and the date it was last checked.
            Informational only, not medical advice.
          </footer>
        </div>
        <ServiceWorker />
      </body>
    </html>
  );
}
