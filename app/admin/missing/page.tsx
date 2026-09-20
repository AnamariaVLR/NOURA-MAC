/**
 * The products Noura could not identify.
 *
 * This is the pilot's most valuable output, which is why it is a queue rather
 * than a log line. Open Food Facts has never seen most of a UAE shelf, so the
 * list of what a shopper pointed at and got nothing for is the shopping list
 * for the catalogue.
 *
 * It holds only what the model read off the pack — name, brand, size, category,
 * and the text it transcribed. No user key: who scanned it is not part of the
 * question.
 */
import Link from "next/link";
import { Card, EmptyState, Pill, SectionTitle } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminMissingPage() {
  const rows = await prisma.missingProduct.findMany({
    orderBy: [{ timesSeen: "desc" }, { lastSeen: "desc" }],
    take: 100,
  });

  const total = rows.reduce((sum, row) => sum + row.timesSeen, 0);

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle hint="What a shopper pointed at and got nothing for. The shopping list for the catalogue.">
          Missing products
        </SectionTitle>

        {rows.length === 0 ? (
          <EmptyState
            title="Nothing missing yet"
            body="Every product scanned so far was either in the catalogue or in an open database. This list fills up as people scan things we do not have."
          />
        ) : (
          <>
            <p className="text-[12.5px] text-ink-soft" data-testid="missing-summary">
              {rows.length} product{rows.length === 1 ? "" : "s"}, {total} scan
              {total === 1 ? "" : "s"}.
            </p>

            <ul className="mt-3 space-y-2" data-testid="missing-queue">
              {rows.map((row) => (
                <li
                  key={row.id}
                  data-testid="missing-row"
                  className="rounded-xl border border-line bg-card px-3 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium">{row.name}</p>
                      <p className="mt-0.5 text-[12px] text-ink-soft">
                        {row.brand ?? "Brand unknown"}
                        {row.sizeLabel ? ` · ${row.sizeLabel}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Pill tone={row.timesSeen > 1 ? "brand" : "neutral"}>
                        {row.timesSeen}×
                      </Pill>
                    </div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Pill>{row.category}</Pill>
                    {row.subcategory ? <Pill>{row.subcategory}</Pill> : null}
                  </div>

                  {row.visibleText ? (
                    <p className="mt-2 rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[11.5px] leading-relaxed text-ink-soft">
                      “{row.visibleText}”
                    </p>
                  ) : null}

                  <p className="mt-2 text-[11px] text-ink-faint">
                    Last seen {formatDate(row.lastSeen)}
                    {row.lastScanId ? (
                      <>
                        {" · "}
                        <Link
                          href={`/result/${row.lastScanId}`}
                          className="underline underline-offset-2"
                        >
                          the scan
                        </Link>
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>

      <Card>
        <SectionTitle>Adding one</SectionTitle>
        <p className="text-[12.5px] leading-relaxed text-ink-soft">
          Find the product&rsquo;s barcode in Open Food Facts, add it to{" "}
          <code className="text-[11.5px]">prisma/seed-data/catalogue.ts</code>, then run{" "}
          <code className="text-[11.5px]">npm run seed:fetch</code> and{" "}
          <code className="text-[11.5px]">npm run db:seed</code>. If Open Food Facts does not have
          it either, nothing can be added — the record has to exist before Noura can read it.
        </p>
      </Card>

      <p className="flex items-center justify-center gap-3 text-center text-[12px] text-ink-faint">
        <Link href="/admin/listings" className="underline underline-offset-2">
          Price checks
        </Link>
        <span aria-hidden>·</span>
        <Link href="/admin/seed" className="underline underline-offset-2">
          Seed data
        </Link>
      </p>
    </div>
  );
}
