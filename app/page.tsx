/**
 * The front door.
 *
 * A shopper arriving cold has three questions — what is this, can I trust it,
 * what do I do — and the answer to the third is one button. Everything else on
 * this page exists to make that button make sense.
 *
 * Deliberately short and deliberately plain. It states the promise, states the
 * limits in the same breath, and gets out of the way.
 *
 * MERGE NOTE: the brand/website branch replaces this file with the full
 * marketing homepage, and its version should win — it carries the Noura visual
 * system, the worked example and the hero demonstration. Take theirs. Nothing
 * this branch depends on lives here; the scanner is at app/scan/page.tsx and the
 * engine is in lib/.
 */
import Link from "next/link";
import { Card, Disclaimer, Pill } from "@/components/ui";
import { DISCLAIMER, runMode } from "@/lib/config";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const mode = runMode();
  const [products, retailers, checks] = await Promise.all([
    prisma.product.count(),
    prisma.retailer.count(),
    prisma.listingCheck.count(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight text-balance">
          Know what you&rsquo;re buying, before you buy it.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          Photograph a product in a UAE supermarket. Noura identifies it, shows the published
          evidence behind it, and says plainly what that evidence supports — and what it does not.
        </p>
      </div>

      <Link
        href="/scan"
        data-testid="start-scan"
        className="flex w-full items-center justify-center gap-3 rounded-2xl bg-brand px-4 py-5 text-[18px] font-semibold text-white shadow-sm active:opacity-90"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 8V6a2 2 0 0 1 2-2h2" />
          <path d="M17 4h2a2 2 0 0 1 2 2v2" />
          <path d="M21 16v2a2 2 0 0 1-2 2h-2" />
          <path d="M7 20H5a2 2 0 0 1-2-2v-2" />
          <circle cx="12" cy="12" r="3.2" />
        </svg>
        Check a product
      </Link>

      {/* The three things that make this different, stated as limits rather than
          as features — because the limits ARE the product. */}
      <Card>
        <p className="text-[13.5px] font-medium">What makes this different</p>
        <ul className="mt-2.5 space-y-2.5 text-[12.5px] leading-relaxed text-ink-soft">
          <li>
            <span className="font-medium text-ink">Every line cites its source.</span> A threshold
            comes from a regulator&rsquo;s document or it is marked as Noura&rsquo;s own judgement.
            Nothing is a number we invented.
          </li>
          <li>
            <span className="font-medium text-ink">&ldquo;We don&rsquo;t know&rdquo; is an
            answer.</span> Where a figure is not published, Noura says so. It is never counted as a
            pass and never as a fail.
          </li>
          <li>
            <span className="font-medium text-ink">Healthy is category-specific.</span> Olive oil is
            not judged by the lines drawn for biscuits, and an egg is not marked down for being an
            egg.
          </li>
        </ul>
      </Card>

      <Card>
        <p className="text-[13.5px] font-medium">What it cannot do</p>
        <ul className="mt-2.5 space-y-2 text-[12.5px] leading-relaxed text-ink-soft">
          <li>
            It does not know you — not your allergies, your medication or your goals. It reads a
            label, not a person.
          </li>
          <li>
            It cannot assess cosmetics or supplements yet, and says so rather than guessing.
          </li>
          <li>
            Prices exist only where a person checked a shelf and signed their name to it.
            {checks === 0 ? " None have been recorded yet." : null}
          </li>
        </ul>
      </Card>

      {mode === "mock" ? (
        <Card className="border-warn-line bg-warn-bg">
          <p className="text-[13px] font-medium">Running in example mode</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
            No API key is set, so photographs are not read and every scan returns the same example
            product. Everything else — the evidence, the checks, the verdict, the alternatives —
            runs for real.
          </p>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="brand">{products} products with evidence</Pill>
        <Pill>{retailers} UAE retailers</Pill>
        <Pill tone={checks === 0 ? "warn" : "neutral"}>{checks} verified prices</Pill>
      </div>

      <Disclaimer text={DISCLAIMER} />

      <p className="text-center text-[12px] text-ink-faint">
        <Link href="/history" className="underline underline-offset-2">
          Your past scans
        </Link>
      </p>
    </div>
  );
}
