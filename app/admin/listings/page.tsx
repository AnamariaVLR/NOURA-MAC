import Link from "next/link";
import { ListingQueue, type QueueRow } from "@/components/listing-queue";
import { Card, EmptyState, Pill, SectionTitle } from "@/components/ui";
import { adminAllowed } from "@/lib/config";
import { formatDate } from "@/lib/format";
import { FRESHNESS_DAYS } from "@/lib/retail/freshness";
import { listingQueue } from "@/lib/retail/listings-admin";

export const dynamic = "force-dynamic";

export default async function AdminListingsPage() {
  if (!adminAllowed()) {
    return (
      <EmptyState
        title="Admin tools are disabled here"
        body="Run in development, or set ALLOW_ADMIN=1. There is no authentication in this version, so put some in front of /admin before enabling it anywhere public."
      />
    );
  }

  const { rows, counts, total } = await listingQueue();

  const queueRows: QueueRow[] = rows.map((row) => ({
    listingId: row.listingId,
    productName: row.productName,
    productBrand: row.productBrand,
    retailerName: row.retailerName,
    sizeLabel: row.sizeLabel,
    retailerUrl: row.retailerUrl,
    priceLabel: row.priceLabel,
    staleness: row.staleness,
    category: row.category,
    lastCheckedLabel: row.lastCheckedAt
      ? `Checked ${formatDate(row.lastCheckedAt)}${row.lastCheckedBy ? ` by ${row.lastCheckedBy}` : ""}`
      : null,
    ageDays: row.ageDays,
    daysLeft: row.daysLeft,
    inStock: row.inStock,
    lastCheckedBy: row.lastCheckedBy,
  }));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Price checks</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
          Every price in Noura comes from a person looking at a shelf or a retailer page. This is
          the queue. A check stays good for {FRESHNESS_DAYS} days, then the price stops being shown
          as verified.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Pill tone={counts["never-checked"] > 0 ? "warn" : "neutral"}>
          {counts["never-checked"]} never checked
        </Pill>
        <Pill tone={counts.stale > 0 ? "warn" : "neutral"}>{counts.stale} out of date</Pill>
        <Pill tone="brand">{counts.fresh} verified</Pill>
        <Pill>{total} listings</Pill>
      </div>

      {counts.fresh === 0 ? (
        <Card className="border-warn-line bg-warn-bg">
          <p className="text-[13px] font-medium">No verified prices yet</p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
            Until a listing has a check, result pages show no price for it and it cannot be
            recommended as an alternative. That is deliberate: we would rather show nothing than a
            price nobody stands behind. Tap any row below to record one, or load a batch with{" "}
            <code className="rounded bg-black/5 px-1 py-0.5">npm run listings:import</code>.
          </p>
        </Card>
      ) : null}

      <ListingQueue rows={queueRows} />

      <Card>
        <SectionTitle>Bulk checks</SectionTitle>
        <p className="text-[12.5px] leading-relaxed text-ink-soft">
          Export the queue, fill it in on a phone or in a spreadsheet, import it back:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-black/5 px-3 py-2 text-[11.5px] leading-relaxed">
{`npm run listings:export -- checks.csv
npm run listings:import -- checks.csv`}
        </pre>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          The importer records every row as a hand-verified check, so only import rows somebody
          actually checked.
        </p>
      </Card>

      <p className="text-center text-[12px] text-ink-faint">
        <Link href="/admin/seed" className="underline underline-offset-2">
          Seed data
        </Link>
      </p>
    </div>
  );
}
