import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Noura — verified healthy products in the UAE",
  description:
    "Photograph a product. Noura identifies it, checks the published evidence, says plainly whether it is a good choice, and shows the best alternative you can actually buy in the UAE.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f6f4d",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
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
      </body>
    </html>
  );
}
