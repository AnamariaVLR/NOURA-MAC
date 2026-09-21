/**
 * The MOIAT conformity register, as a client.
 *
 * ── What this source is, and is not ─────────────────────────────────────────
 *
 * The UAE Ministry of Industry and Advanced Technology publishes a searchable
 * register of conformity certificates — ECAS, EQM, GMark, Halal National Mark
 * and Made In Emirates. 303,024 records at the time of writing, queryable by
 * barcode, brand and product type, unauthenticated.
 *
 * There is NO bulk download. moiat.gov.ae/en/open-data/product-conformity-data
 * is a search interface, and the three documented open-data APIs cover
 * industrial licences, notified bodies and recalled products — not conformity
 * certificates. This client calls the endpoint the register's own front end
 * uses, one product at a time.
 *
 * ── The thing to understand before trusting a match ─────────────────────────
 *
 * The register's `ModelNumber` field carries a BARCODE for consumer goods —
 * `6291109891093` on a bottle of water — which is what makes exact-product
 * matching possible at all. Its `Brand` field, by contrast, is frequently
 * several brands concatenated with no separator
 * ("JuxSoom LiteAl AinSTARStar True NatureQuench"), because one certificate
 * covers a company's whole range. A brand match therefore identifies a COMPANY,
 * not a product, and lib/health/certification.ts never promotes one to the other.
 *
 * ── Coverage, stated plainly ────────────────────────────────────────────────
 *
 * MOIAT regulates technical conformity. Its published product-type taxonomy DOES
 * cover food — organic processed food, edible vegetable oil, honey, eggs, dairy,
 * juices, bottled water and fourteen halal process categories — so absence is
 * about whether a manufacturer applied, not about whether the category exists,
 * and a scan of 262 catalogue barcodes returned exact certificates for 42 —
 * mostly UAE-made dairy, laban, yoghurt and bottled water. An olive oil
 * returning nothing means no olive oil producer in our catalogue has a
 * certificate on file, NOT that olive oil is outside the register's scope:
 * "Edible Vegetable Oil" (product type 15087) is a category it publishes. That
 * distinction is exactly why NOT_FOUND exists as a state separate from
 * "not certified".
 */

const BASE = "https://api.moiat.gov.ae/api/ConformityHub/GetCertificatesListV3";

export const MOIAT_SOURCE_NAME = "MOIAT Conformity Register";
export const MOIAT_SOURCE_URL = "https://moiat.gov.ae/en/open-data/product-conformity-data";

/** The register caps a page at 50 however large a pageSize is asked for. */
export const MOIAT_PAGE_SIZE = 50;

export type MoiatCertificate = {
  certificateNumber: string;
  certificateType: string;
  /** The register's own status word, e.g. "Active". */
  rawStatus: string;
  issuedAt: Date | null;
  expiresAt: Date | null;
  brand: string | null;
  /** Carries a barcode for consumer goods. This is what exact matching keys on. */
  modelNumber: string | null;
  productType: string | null;
  company: string | null;
  country: string | null;
};

type RawRow = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function date(value: unknown): Date | null {
  const raw = text(value);
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function toCertificate(row: RawRow): MoiatCertificate | null {
  const certificateNumber = text(row.CertificateNumber);
  if (!certificateNumber) return null;
  return {
    certificateNumber,
    certificateType: text(row.CertificateType) ?? "Unknown",
    rawStatus: text(row.StatusNameEN) ?? "Unknown",
    issuedAt: date(row.IssueDate),
    expiresAt: date(row.ExpiryDate),
    brand: text(row.Brand),
    modelNumber: text(row.ModelNumber),
    productType: text(row.ProductTypeEN),
    company: text(row.CompanyNameEN),
    country: text(row.CountryNameEN),
  };
}

/**
 * The register's status word, read into ours.
 *
 * Anything that is not plainly active is treated as not-valid rather than
 * guessed at. An unrecognised word becomes "expired" — the conservative
 * reading, since the alternative is presenting an unknown state as valid.
 */
export function readStatus(rawStatus: string): "valid" | "expired" | "suspended" {
  const s = rawStatus.trim().toLowerCase();
  if (s === "active" || s === "valid") return "valid";
  if (s.includes("suspend") || s.includes("withdraw") || s.includes("cancel")) return "suspended";
  return "expired";
}

/**
 * Rows the register can return more than once.
 *
 * One certificate commonly covers several models, and a brand query returns a
 * row per model — so the same (certificate, model) pair arrives repeatedly. The
 * register is not wrong; it is a list of certificate-model pairs and we are
 * storing them as rows, so the deduplication belongs on our side.
 */
export function dedupe(certificates: MoiatCertificate[]): MoiatCertificate[] {
  const seen = new Set<string>();
  const out: MoiatCertificate[] = [];
  for (const certificate of certificates) {
    const key = `${certificate.certificateNumber}|${certificate.modelNumber ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(certificate);
  }
  return out;
}

/**
 * One request, retried.
 *
 * The register is someone else's public endpoint and it rate-limits: a run of
 * 35 products at 300 ms produced a long stretch of failures partway through.
 * Three attempts with widening backoff turns that into a slower run rather than
 * a wrong answer — and a wrong answer here is expensive, because a failed query
 * is UNKNOWN and an empty one is NOT FOUND, and only one of those is a fact.
 */
const ATTEMPTS = 3;

async function query(params: Record<string, string>): Promise<RawRow[] | null> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    const rows = await queryOnce(params);
    if (rows !== null) return rows;
    if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, attempt * 2_000));
  }
  return null;
}

async function queryOnce(params: Record<string, string>): Promise<RawRow[] | null> {
  const search = new URLSearchParams({
    pageIndex: "0",
    pageSize: String(MOIAT_PAGE_SIZE),
    getCount: "false",
    getProduct: "true",
    ...params,
  });
  try {
    const res = await fetch(`${BASE}?${search}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;

    // THE ONE THING TO GET RIGHT HERE.
    //
    // A query that matches nothing answers 200 with a body of `""` — an empty
    // JSON string, not an empty array. Handing that to JSON.parse throws, and an
    // earlier version of this function caught the throw and returned null, which
    // this file reads as "the request failed".
    //
    // That turned "the register has nothing for this barcode" into "we could not
    // ask" — collapsing NOT_FOUND into UNKNOWN, which is the exact distinction
    // lib/health/certification.ts exists to preserve. It made every uncertified
    // product in the catalogue look like a network problem, and it did it
    // silently, because both states render as "we could not confirm".
    //
    // An empty body is an ANSWER. It means zero rows.
    const body = (await res.text()).trim();
    if (body === "" || body === '""') return [];

    const raw = JSON.parse(body);
    // The endpoint returns a JSON *string* containing JSON.
    const rows = typeof raw === "string" ? (raw.trim() === "" ? [] : JSON.parse(raw)) : raw;
    return Array.isArray(rows) ? (rows as RawRow[]) : [];
  } catch {
    // Null, not []. A failed query is UNKNOWN; an empty one is NOT FOUND, and
    // the difference is the whole point of lib/health/certification.ts.
    return null;
  }
}

/** Certificates the register returns for a barcode. Null means the query failed. */
export async function certificatesForBarcode(barcode: string): Promise<MoiatCertificate[] | null> {
  if (!/^\d{8,14}$/.test(barcode)) return [];
  const rows = await query({ barcode });
  if (rows === null) return null;
  return dedupe(rows.map(toCertificate).filter((c): c is MoiatCertificate => c !== null));
}

/** Certificates the register returns for a brand. Null means the query failed. */
export async function certificatesForBrand(brand: string): Promise<MoiatCertificate[] | null> {
  const trimmed = brand.trim();
  if (trimmed.length < 2) return [];
  const rows = await query({ brand: trimmed });
  if (rows === null) return null;
  return dedupe(rows.map(toCertificate).filter((c): c is MoiatCertificate => c !== null));
}

/**
 * Does this certificate name this exact product?
 *
 * Only a model number that IS the barcode counts. No normalisation beyond
 * trimming, no prefix matching, no "close enough": a single wrong digit is a
 * different product, and the cost of a false exact match is Noura telling a
 * shopper their product is certified when it is not.
 */
export function namesExactProduct(certificate: MoiatCertificate, barcode: string): boolean {
  return certificate.modelNumber !== null && certificate.modelNumber.trim() === barcode.trim();
}
