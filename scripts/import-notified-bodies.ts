/**
 * Replaces the SYNTHETIC AccreditedBody rows with MOIAT's real notified bodies.
 *
 *   npm run seed:bodies
 *
 * This one IS a documented open-data API — GetNotifiedBodiesList, unauthenticated,
 * paged — unlike the conformity register, which has no bulk export and has to be
 * queried a product at a time (see lib/evidence/moiat.ts).
 *
 * A notified body is who may issue a conformity certificate and for which
 * regulations. Noura uses it for exactly one thing: to name the issuer on a
 * certificate, so a claim on the result page can be traced to an organisation
 * rather than to "a body".
 */
import "../lib/load-env";
import { prisma } from "../lib/db";

const ENDPOINT = "https://api.moiat.gov.ae/api/OpenDataAPI/GetNotifiedBodiesList";
const SOURCE_NAME = "MOIAT Notified Bodies";
const SOURCE_URL = "https://moiat.gov.ae/en/open-data/open-data-apis";

type Body = {
  nbNumber?: string;
  nbName?: string;
  nbLocation?: string;
  regulations?: { regulationName?: string }[];
};

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

async function page(pageNumber: number, pageSize: number): Promise<Body[] | null> {
  try {
    const res = await fetch(`${ENDPOINT}?PageNumber=${pageNumber}&PageSize=${pageSize}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { result?: { data?: Body[] } };
    return body.result?.data ?? [];
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const now = new Date();
  let imported = 0;
  let skipped = 0;

  // The endpoint validates PageSize and rejects anything above 10, so paging is
  // in tens. 40 pages is 400 bodies, comfortably more than the register holds.
  for (let p = 1; p <= 40; p += 1) {
    const rows = await page(p, 10);
    if (rows === null) {
      console.error(`page ${p}: request failed — stopping rather than guessing at the rest`);
      break;
    }
    if (rows.length === 0) break;

    for (const row of rows) {
      const name = row.nbName?.trim();
      const number = row.nbNumber?.trim();
      if (!name || !number) {
        skipped += 1;
        continue;
      }

      // The scope is what the body may certify. Kept as the register words it,
      // truncated only for display.
      const scope =
        (row.regulations ?? [])
          .map((r) => r.regulationName?.trim())
          .filter(Boolean)
          .join(", ")
          .slice(0, 400) || "Scope not published";

      await prisma.accreditedBody.upsert({
        where: { slug: slugify(`${number}-${name}`) },
        create: {
          slug: slugify(`${number}-${name}`),
          name,
          scope,
          accreditationNo: number,
          source: "REGULATOR_IMPORT",
          sourceName: SOURCE_NAME,
          sourceUrl: SOURCE_URL,
          lastVerifiedAt: now,
        },
        update: { name, scope, source: "REGULATOR_IMPORT", lastVerifiedAt: now },
      });
      imported += 1;
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  const purged = await prisma.accreditedBody.deleteMany({
    where: { source: "SYNTHETIC", certifications: { none: {} } },
  });

  console.log(`\n  bodies imported   ${imported}\n  rows skipped      ${skipped}\n  synthetic purged  ${purged.count}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exitCode = 1;
});
