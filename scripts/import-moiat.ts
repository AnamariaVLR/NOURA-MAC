/**
 * Replaces the shipped SYNTHETIC certificate rows with the real MOIAT register.
 *
 *   1. Download the CSV from
 *      https://moiat.gov.ae/en/open-data/product-conformity-data
 *   2. npm run seed:moiat -- ./moiat-product-conformity.csv
 *
 * Matching: a certificate is attached to a product when the CSV row's barcode
 * matches a product barcode. Rows that match nothing in our catalogue are counted
 * and skipped — we do not invent products to hang certificates on.
 *
 * Column names vary between MOIAT exports, so the header is matched
 * case-insensitively against the aliases in COLUMNS below.
 */
import "../lib/load-env";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { CertificateStatusSchema, CertificateTypeSchema } from "../lib/schemas";
import { parseCsv } from "../lib/retail/listings-csv";

const prisma = new PrismaClient();

const COLUMNS: Record<string, string[]> = {
  certificateNumber: ["certificate number", "certificate_no", "certificateno", "cert no"],
  certificateType: ["certificate type", "scheme", "certificate_scheme", "type"],
  status: ["status", "certificate status"],
  issuedAt: ["issue date", "issued", "issued_date", "issue_date"],
  expiresAt: ["expiry date", "expires", "expiry_date", "valid until"],
  barcode: ["barcode", "gtin", "ean", "product barcode"],
  bodyName: ["certification body", "cab", "notified body", "body"],
};

function indexOfColumn(header: string[], aliases: string[]): number {
  const normalised = header.map((h) => h.trim().toLowerCase());
  for (const alias of aliases) {
    const idx = normalised.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Accept both 2025-03-11 and 11/03/2025.
  const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : trimmed;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: npm run seed:moiat -- path/to/moiat-product-conformity.csv");
    process.exit(1);
  }

  const rows = parseCsv(readFileSync(path, "utf8"));
  if (rows.length < 2) {
    console.error("CSV has no data rows.");
    process.exit(1);
  }

  const header = rows[0];
  const idx = Object.fromEntries(
    Object.entries(COLUMNS).map(([key, aliases]) => [key, indexOfColumn(header, aliases)]),
  ) as Record<keyof typeof COLUMNS, number>;

  const missing = (["certificateNumber", "barcode"] as const).filter((k) => idx[k] === -1);
  if (missing.length) {
    console.error(`CSV is missing required column(s): ${missing.join(", ")}`);
    console.error(`Header seen: ${header.join(" | ")}`);
    process.exit(1);
  }

  const products = await prisma.product.findMany({ select: { id: true, barcode: true } });
  const byBarcode = new Map(products.filter((p) => p.barcode).map((p) => [p.barcode!, p.id]));

  let imported = 0;
  let unmatched = 0;
  let rejected = 0;
  const now = new Date();

  for (const row of rows.slice(1)) {
    const cell = (key: keyof typeof COLUMNS) => (idx[key] === -1 ? "" : (row[idx[key]] ?? "").trim());
    const barcode = cell("barcode").replace(/\D/g, "");
    const productId = byBarcode.get(barcode);
    if (!productId) {
      unmatched += 1;
      continue;
    }

    const type = CertificateTypeSchema.safeParse(cell("certificateType"));
    const status = CertificateStatusSchema.safeParse(cell("status").toLowerCase());
    const certificateNumber = cell("certificateNumber");
    const issuedAt = parseDate(cell("issuedAt"));
    if (!certificateNumber || !type.success || !issuedAt) {
      rejected += 1;
      continue;
    }

    let bodyId: string | null = null;
    const bodyName = cell("bodyName");
    if (bodyName) {
      const slug = bodyName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      const body = await prisma.accreditedBody.upsert({
        where: { slug },
        update: { name: bodyName, source: "REGULATOR_IMPORT" },
        create: {
          slug,
          name: bodyName,
          scope: "As published in the MOIAT conformity register",
          accreditationNo: "see EIAC register",
          source: "REGULATOR_IMPORT",
          sourceName: "MOIAT Product Conformity open data",
          sourceUrl: "https://moiat.gov.ae/en/open-data/product-conformity-data",
          lastVerifiedAt: now,
        },
      });
      bodyId = body.id;
    }

    const payload = {
      productId,
      certificateType: type.data,
      status: status.success ? status.data : "valid",
      issuedAt,
      expiresAt: parseDate(cell("expiresAt")),
      bodyId,
      // A real import is evidence; the SYNTHETIC rows it replaces were not.
      source: "REGULATOR_IMPORT",
      sourceName: "MOIAT Product Conformity open data",
      sourceUrl: "https://moiat.gov.ae/en/open-data/product-conformity-data",
      lastVerifiedAt: now,
    };

    await prisma.productCertification.upsert({
      where: { certificateNumber },
      update: payload,
      create: { ...payload, certificateNumber },
    });
    imported += 1;
  }

  // Real rows are in; drop the scaffolding for any product that now has one.
  const withReal = new Set(
    (
      await prisma.productCertification.findMany({
        where: { source: "REGULATOR_IMPORT" },
        select: { productId: true },
      })
    ).map((c) => c.productId),
  );
  const removed = await prisma.productCertification.deleteMany({
    where: { source: "SYNTHETIC", productId: { in: [...withReal] } },
  });

  console.log(
    `imported ${imported}, unmatched ${unmatched}, rejected ${rejected}, ` +
      `synthetic rows removed ${removed.count}`,
  );
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
