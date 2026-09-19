/**
 * UAE regulator layer: MOIAT product conformity + EIAC accredited bodies.
 *
 * ⚠️ READ THIS BEFORE TRUSTING A ROW IN THIS FILE.
 *
 * The rows below are SAMPLES with the shape of the real registers, not the real
 * registers. Certificate numbers are prefixed "SAMPLE-" and body names begin with
 * "SAMPLE —", and — more importantly — every row is seeded with
 * `source: "SYNTHETIC"`. The enum is what the code actually checks; the prefix is
 * only there so a human reading the database sees it too. A SYNTHETIC row never
 * verifies anything, never passes a check, and never reaches a result page.
 *
 * Why not ship the real data? Because a certificate number is a factual claim about
 * a real company. Inventing one that *looks* real is precisely the harm this product
 * exists to prevent. The real registers are published:
 *
 *   MOIAT Product Conformity open data
 *     https://moiat.gov.ae/en/open-data/product-conformity-data
 *   EIAC accredited conformity assessment bodies
 *     https://eiac.gov.ae
 *
 * Download the MOIAT CSV and run `npm run seed:moiat -- path/to/file.csv` to replace
 * every SYNTHETIC row with the real thing. See README, "Updating the MOIAT seed".
 */

export const MOIAT_SOURCE = {
  name: "MOIAT Product Conformity open data (SAMPLE rows — not imported from the register)",
  url: "https://moiat.gov.ae/en/open-data/product-conformity-data",
};

export const EIAC_SOURCE = {
  name: "EIAC accredited conformity assessment bodies (SAMPLE rows — not imported from the register)",
  url: "https://eiac.gov.ae",
};

export type SeedBody = {
  slug: string;
  name: string;
  scope: string;
  accreditationNo: string;
};

export const ACCREDITED_BODIES: SeedBody[] = [
  {
    slug: "sample-food-safety-cab",
    name: "SAMPLE — Food Safety Certification Body",
    scope: "Food products, HACCP and food safety management systems",
    accreditationNo: "SAMPLE-EIAC-PC-001",
  },
  {
    slug: "sample-halal-cab",
    name: "SAMPLE — Halal Certification Body",
    scope: "Halal food and consumer products (UAE.S 2055)",
    accreditationNo: "SAMPLE-EIAC-PC-002",
  },
  {
    slug: "sample-organic-cab",
    name: "SAMPLE — Organic Certification Body",
    scope: "Organic production and labelling of agricultural products",
    accreditationNo: "SAMPLE-EIAC-PC-003",
  },
  {
    slug: "sample-cosmetics-cab",
    name: "SAMPLE — Cosmetics & Personal Care Certification Body",
    scope: "Cosmetics, personal care products, GMP ISO 22716",
    accreditationNo: "SAMPLE-EIAC-PC-004",
  },
];

export type SeedCertificate = {
  /** Product slug from catalogue.ts. */
  productSlug: string;
  certificateNumber: string;
  certificateType: "ECAS" | "EQM" | "Halal" | "Organic" | "GMP";
  status: "valid" | "expired" | "suspended";
  issuedAt: string;
  expiresAt: string | null;
  bodySlug: string | null;
};

/**
 * Deliberately uneven coverage: most products have nothing, some have a valid
 * certificate, one is expired and one is suspended. A product with no row is NOT
 * treated as uncertified — it is treated as unknown, because absence from a sample
 * import is not evidence of absence from the register.
 */
export const CERTIFICATES: SeedCertificate[] = [
  {
    productSlug: "al-rawabi-full-cream-yogurt-400g",
    certificateNumber: "SAMPLE-ECAS-2025-004112",
    certificateType: "ECAS",
    status: "valid",
    issuedAt: "2025-03-11",
    expiresAt: "2027-03-10",
    bodySlug: "sample-food-safety-cab",
  },
  {
    productSlug: "al-rawabi-full-cream-yogurt-400g",
    certificateNumber: "SAMPLE-HALAL-2025-009877",
    certificateType: "Halal",
    status: "valid",
    issuedAt: "2025-01-20",
    expiresAt: "2027-01-19",
    bodySlug: "sample-halal-cab",
  },
  {
    productSlug: "al-rawabi-low-fat-milk-1l",
    certificateNumber: "SAMPLE-ECAS-2025-004118",
    certificateType: "ECAS",
    status: "valid",
    issuedAt: "2025-03-11",
    expiresAt: "2027-03-10",
    bodySlug: "sample-food-safety-cab",
  },
  {
    productSlug: "al-rawabi-laban-1l",
    certificateNumber: "SAMPLE-HALAL-2024-008120",
    certificateType: "Halal",
    status: "valid",
    issuedAt: "2024-06-02",
    expiresAt: "2026-06-01",
    bodySlug: "sample-halal-cab",
  },
  {
    productSlug: "oatly-organic-oat-drink-1l",
    certificateNumber: "SAMPLE-ORG-2025-001904",
    certificateType: "Organic",
    status: "valid",
    issuedAt: "2025-05-14",
    expiresAt: "2027-05-13",
    bodySlug: "sample-organic-cab",
  },
  {
    productSlug: "alpro-oat-no-sugars-1l",
    certificateNumber: "SAMPLE-ECAS-2025-004301",
    certificateType: "ECAS",
    status: "valid",
    issuedAt: "2025-02-08",
    expiresAt: "2027-02-07",
    bodySlug: "sample-food-safety-cab",
  },
  {
    productSlug: "hummus-classic-240g",
    certificateNumber: "SAMPLE-ECAS-2023-002210",
    certificateType: "ECAS",
    // Exercises the "certificate has lapsed" path in the checker and the UI.
    status: "expired",
    issuedAt: "2023-04-01",
    expiresAt: "2025-03-31",
    bodySlug: "sample-food-safety-cab",
  },
  {
    productSlug: "lipton-ice-tea-peach-500ml",
    certificateNumber: "SAMPLE-EQM-2024-007733",
    certificateType: "EQM",
    // Exercises the "certificate suspended" path.
    status: "suspended",
    issuedAt: "2024-09-15",
    expiresAt: "2026-09-14",
    bodySlug: "sample-food-safety-cab",
  },
  {
    productSlug: "al-ain-water-500ml",
    certificateNumber: "SAMPLE-ECAS-2025-005520",
    certificateType: "ECAS",
    status: "valid",
    issuedAt: "2025-07-01",
    expiresAt: "2027-06-30",
    bodySlug: "sample-food-safety-cab",
  },
  {
    productSlug: "nivea-sun-protect-bronze-spf20-200ml",
    certificateNumber: "SAMPLE-GMP-2025-003340",
    certificateType: "GMP",
    status: "valid",
    issuedAt: "2025-04-22",
    expiresAt: "2027-04-21",
    bodySlug: "sample-cosmetics-cab",
  },
  {
    productSlug: "garnier-honey-treasures-shampoo-300ml",
    certificateNumber: "SAMPLE-GMP-2025-003377",
    certificateType: "GMP",
    status: "valid",
    issuedAt: "2025-04-22",
    expiresAt: "2027-04-21",
    bodySlug: "sample-cosmetics-cab",
  },
  {
    productSlug: "kelloggs-all-bran-fibre-plus-500g",
    certificateNumber: "SAMPLE-ECAS-2025-006010",
    certificateType: "ECAS",
    status: "valid",
    issuedAt: "2025-08-05",
    expiresAt: "2027-08-04",
    bodySlug: "sample-food-safety-cab",
  },
];

/** True for any row that came from the shipped samples rather than a real import. */
export function isSampleCertificate(certificateNumber: string): boolean {
  return certificateNumber.startsWith("SAMPLE-");
}
