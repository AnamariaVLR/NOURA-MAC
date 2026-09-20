/**
 * A page that is not there — or, just as often, one that is not yours.
 *
 * /result/[id] and /api/image/[id] deliberately answer 404 for someone else's
 * scan as well as for a scan that does not exist, because the difference is not
 * the caller's business. The copy has to cover both without implying the second.
 */
import Link from "next/link";
import { Card } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="space-y-4" data-testid="not-found-page">
      <Card>
        <h1 className="text-[19px] font-semibold tracking-tight">Not found</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
          There is nothing at this address. If you were opening a scan, it may have been taken on a
          different phone or in a different browser — scans belong to the browser that made them,
          and Noura has no account to look them up by.
        </p>
        <Link
          href="/scan"
          className="mt-4 block w-full rounded-xl bg-ink px-4 py-3.5 text-center text-[15px] font-semibold text-paper"
        >
          Check a product
        </Link>
      </Card>
    </div>
  );
}
