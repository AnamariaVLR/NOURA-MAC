"use client";

/**
 * The work queue. Pick a row, the form opens above the table with that listing
 * loaded; save, and the row leaves the "needs checking" list.
 */
import { useState } from "react";
import { ListingCheckForm, type PendingListing } from "./listing-check-form";

export type QueueRow = PendingListing & {
  category: string;
  lastCheckedLabel: string | null;
  ageDays: number | null;
  daysLeft: number | null;
  inStock: boolean | null;
  lastCheckedBy: string | null;
};

const STATE_STYLE: Record<string, { label: string; className: string }> = {
  "never-checked": { label: "never checked", className: "text-band-poor" },
  stale: { label: "out of date", className: "text-band-fair" },
  fresh: { label: "verified", className: "text-band-excellent" },
  "not-evidence": { label: "example data", className: "text-ink-faint" },
};

export function ListingQueue({ rows }: { rows: QueueRow[] }) {
  const [selected, setSelected] = useState<QueueRow | null>(null);
  const [filter, setFilter] = useState<"all" | "todo">("todo");

  const visible = filter === "todo" ? rows.filter((r) => r.staleness !== "fresh") : rows;

  return (
    <div className="space-y-4">
      {selected ? (
        <section className="rounded-2xl border border-brand/30 bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.07em] text-ink-soft">
              Record a check
            </h2>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-[12px] text-ink-soft underline underline-offset-2"
            >
              Close
            </button>
          </div>
          <ListingCheckForm listing={selected} />
        </section>
      ) : null}

      <div className="flex gap-2">
        {(["todo", "all"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-medium ${
              filter === value
                ? "border-brand/40 bg-brand-soft text-brand-deep"
                : "border-line text-ink-soft"
            }`}
          >
            {value === "todo" ? "Needs checking" : "All listings"}
          </button>
        ))}
      </div>

      <ul className="space-y-2" data-testid="listing-queue">
        {visible.map((row) => {
          const style = STATE_STYLE[row.staleness] ?? STATE_STYLE["never-checked"];
          return (
            <li key={row.listingId}>
              <button
                type="button"
                onClick={() => setSelected(row)}
                data-testid="queue-row"
                data-staleness={row.staleness}
                className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-left active:opacity-80"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium">{row.productName}</p>
                    <p className="mt-0.5 truncate text-[12px] text-ink-soft">
                      {row.retailerName} · {row.sizeLabel}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    {row.priceLabel ? (
                      <p className="tnum text-[13px] font-semibold">{row.priceLabel}</p>
                    ) : null}
                    <p className={`mt-0.5 text-[11px] font-medium ${style.className}`}>
                      {style.label}
                    </p>
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-ink-faint">
                  {row.lastCheckedLabel
                    ? `${row.lastCheckedLabel}${
                        row.daysLeft !== null ? ` · ${row.daysLeft} days left` : ""
                      }`
                    : "No check recorded yet"}
                </p>
              </button>
            </li>
          );
        })}
      </ul>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-line bg-card px-3 py-4 text-center text-[13px] text-ink-soft">
          Everything is checked and current. Nothing to do.
        </p>
      ) : null}
    </div>
  );
}
