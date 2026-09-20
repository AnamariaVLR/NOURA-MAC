/**
 * The scanner — the whole product in one screen.
 *
 * ── Why this is at /scan and not at / ───────────────────────────────────────
 *
 * It used to be the homepage, back when there was no homepage. A shopper
 * arriving cold needs to be told what Noura is before being asked to photograph
 * something, so "/" explains and this screen does exactly one thing.
 *
 * MERGE NOTE: the brand/website branch owns both of these files and its versions
 * are better — they carry the Noura visual system. On merge, take theirs for
 * app/page.tsx and app/scan/page.tsx. Everything this branch cares about lives
 * in components/capture-form.tsx, the API routes and lib/, none of which this
 * file touches.
 */
import Link from "next/link";
import { CaptureForm } from "@/components/capture-form";
import { Card, Disclaimer, Pill } from "@/components/ui";
import { DISCLAIMER, runMode } from "@/lib/config";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Check a product — Noura",
  description:
    "Photograph a product. Noura identifies it, checks the published evidence and says plainly what it found and what it could not.",
};

export default async function ScanPage() {
  const mode = runMode();
  const [products, retailers, checks] = await Promise.all([
    prisma.product.count(),
    prisma.retailer.count(),
    prisma.listingCheck.count(),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight">
          Verified healthy products in the UAE
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
          Photograph a product. Noura identifies it, shows the published evidence behind it, says
          plainly whether it is a good choice and why, and finds the best alternative you can
          actually buy here.
        </p>
      </div>

      {mode === "mock" ? (
        <Card className="border-warn-line bg-warn-bg">
          <p className="text-[13px] font-medium">Running in example mode</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
            No <code className="rounded bg-black/5 px-1 py-0.5">ANTHROPIC_API_KEY</code> is set, so
            your image is not read. Every scan returns the same example product, and the rest —
            evidence, checks, verdict, prices, alternatives — runs for real.
          </p>
        </Card>
      ) : null}

      <CaptureForm />

      <Card>
        <p className="text-[13px] font-medium">What happens to your photo</p>
        <ol className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-ink-soft">
          <li>1. It is identified — by barcode where one is legible, by name otherwise.</li>
          <li>2. Ingredients, nutrition and UAE certification are looked up, with sources.</li>
          <li>3. Each thing we check gets a plain yes, no, or &ldquo;we could not tell&rdquo;.</li>
          <li>4. We show what scores better and where to buy it, at a price a person checked.</li>
        </ol>
        <p className="mt-3 text-[11px] text-ink-faint">
          The image is stored on this server and served back only to your browser.
        </p>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="brand">{products} products with evidence</Pill>
        <Pill>{retailers} UAE retailers</Pill>
        <Pill tone={checks === 0 ? "warn" : "neutral"}>{checks} verified prices</Pill>
      </div>

      {checks === 0 ? (
        <Card className="border-warn-line bg-warn-bg">
          <p className="text-[13px] font-medium">No prices have been checked yet</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
            Every price in Noura comes from a person looking at a shelf or a retailer page. Until
            someone records one, result pages will say so rather than show a number nobody stands
            behind.{" "}
            <Link href="/admin/listings" className="underline underline-offset-2">
              Record the first one
            </Link>
            .
          </p>
        </Card>
      ) : null}

      <Disclaimer text={DISCLAIMER} />

      <p className="text-center text-[12px] text-ink-faint">
        <Link href="/history" className="underline underline-offset-2">
          See your past scans
        </Link>
      </p>
    </div>
  );
}
