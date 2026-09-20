import Link from "next/link";
import { Card, EmptyState, Pill, SectionTitle, VERDICT_TEXT_COLOR } from "@/components/ui";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { VERDICT_LABEL } from "@/lib/health/verdict";
import { IdentificationSchema, VerdictSchema, parseJsonColumn } from "@/lib/schemas";
import { currentUserKey } from "@/lib/user";

export const dynamic = "force-dynamic";

export default async function HistoryPage() {
  const userKey = await currentUserKey();

  const scans = userKey
    ? await prisma.scan.findMany({
        where: { userKey },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { product: true, analysis: true },
      })
    : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Your scans</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
          Held against this browser only. There are no accounts in this version, so clearing your
          cookies clears this list.
        </p>
      </div>

      {scans.length === 0 ? (
        <EmptyState
          title="No scans yet"
          body="Photograph a product on the home screen and it will appear here."
        />
      ) : (
        <div className="space-y-2.5">
          {scans.map((scan) => {
            const identification = parseJsonColumn(scan.identificationJson, IdentificationSchema);
            const name = scan.product?.name ?? identification?.name ?? "Unidentified product";
            const verdict = VerdictSchema.safeParse(scan.analysis?.verdict);

            return (
              <Link key={scan.id} href={`/result/${scan.id}`} className="block">
                <Card className="transition-colors hover:border-brand/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium">{name}</p>
                      <p className="mt-0.5 truncate text-[12px] text-ink-soft">
                        {scan.product?.brand ?? identification?.brand ?? "Brand unknown"} ·{" "}
                        {formatDate(scan.createdAt)}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {scan.mode === "mock" ? <Pill tone="warn">example</Pill> : null}
                        {scan.status === "failed" ? <Pill tone="warn">not in the catalogue</Pill> : null}
                        {scan.status === "needs_confirmation" ? (
                          <Pill tone="warn">waiting for you to confirm</Pill>
                        ) : null}
                      </div>
                    </div>
                    {scan.analysis && verdict.success ? (
                      <div className="w-[104px] shrink-0 text-right">
                        <p
                          className={`text-[11px] font-semibold uppercase leading-tight tracking-[0.04em] ${VERDICT_TEXT_COLOR[verdict.data]}`}
                        >
                          {VERDICT_LABEL[verdict.data]}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      <SectionTitle>Housekeeping</SectionTitle>
      <p className="text-[12px] leading-relaxed text-ink-faint">
        Scans keep a copy of the photo you uploaded. It is served back only to this browser.
      </p>
    </div>
  );
}
