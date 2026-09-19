import { SeedButton } from "@/components/seed-button";
import { Card, Pill, SectionTitle } from "@/components/ui";
import { MODEL, runMode, seedEndpointAllowed } from "@/lib/config";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminSeedPage() {
  const enabled = seedEndpointAllowed();

  const [products, listings, retailers, bodies, certificates, syntheticCertificates, checks, newest] =
    await Promise.all([
      prisma.product.count(),
      prisma.productListing.count(),
      prisma.retailer.count(),
      prisma.accreditedBody.count(),
      prisma.productCertification.count(),
      prisma.productCertification.count({ where: { source: "SYNTHETIC" } }),
      prisma.listingCheck.count(),
      prisma.product.findFirst({ orderBy: { lastVerifiedAt: "desc" } }),
    ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">Seed data</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
          A development tool. Reseeding upserts the shipped catalogue, listings and regulator rows.
          It does not delete your scans or your price checks.
        </p>
      </div>

      <Card>
        <SectionTitle>Current contents</SectionTitle>
        <ul className="space-y-1 text-[13px] text-ink-soft">
          <li className="tnum">Products: {products}</li>
          <li className="tnum">Listings tracked: {listings}</li>
          <li className="tnum">Price checks recorded: {checks}</li>
          <li className="tnum">Retailers: {retailers}</li>
          <li className="tnum">Accredited bodies: {bodies}</li>
          <li className="tnum">Certificates: {certificates}</li>
        </ul>
        {newest ? (
          <p className="mt-3 text-[11.5px] text-ink-faint">
            Newest evidence last verified {formatDate(newest.lastVerifiedAt)}.
          </p>
        ) : null}
      </Card>

      {syntheticCertificates > 0 ? (
        <Card className="border-warn-line bg-warn-bg">
          <p className="text-[13px] font-medium">
            {syntheticCertificates} of {certificates} certificates are SYNTHETIC
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-soft">
            They have the shape of the MOIAT register but are not from it, so they never verify
            anything and never appear on a result page. Download the open data and run{" "}
            <code className="rounded bg-black/5 px-1 py-0.5">npm run seed:moiat -- file.csv</code>{" "}
            to replace them.
          </p>
        </Card>
      ) : null}

      <Card>
        <SectionTitle>Runtime</SectionTitle>
        <div className="flex flex-wrap gap-2">
          <Pill tone={runMode() === "live" ? "brand" : "warn"}>{runMode()} mode</Pill>
          <Pill>{MODEL}</Pill>
          <Pill tone={enabled ? "brand" : "warn"}>
            seed endpoint {enabled ? "enabled" : "disabled"}
          </Pill>
        </div>
      </Card>

      <SeedButton enabled={enabled} />
    </div>
  );
}
