/**
 * CATEGORY → CLAIM → AUTHORITATIVE SOURCE.
 *
 * `CERTIFICATION_SOURCES.md` as structured data. Every entry below corresponds
 * to a row in that document, and the document records how each was checked.
 * Nothing here may be added from memory, from a scheme's marketing copy, or
 * because an API happens to exist: a source earns a place only if it can
 * produce evidence Noura may legitimately call VERIFIED, or if it is recorded
 * explicitly as one that cannot.
 *
 * ── The rule this file exists to encode ─────────────────────────────────────
 *
 * A source's `granularity` decides the CEILING of what it can ever establish:
 *
 *   EXACT_PRODUCT  can address a specific barcode  → may reach VERIFIED
 *   OPERATOR       addresses a legal entity        → BRAND_LEVEL_ONLY, never more
 *   NAME_ONLY      addresses a free-text name      → BRAND_LEVEL_ONLY at best
 *   NOT_ADDRESSABLE cannot identify a product      → not evidence at all
 *
 * This is not a policy choice. It is what the registers physically contain.
 * Organic certification certifies an operator and a process, not a package, so
 * no organic register in the world can verify a SKU — which is why olive oil
 * has no verifiable organic claim and why that is the honest answer rather than
 * a gap to be filled.
 */

import type { ProductCategory } from "../schemas";

export const EVIDENCE_CLAIMS = [
  "UAE_CONFORMITY",
  "HALAL",
  "ORGANIC",
  "ECOLABEL",
] as const;
export type EvidenceClaim = (typeof EVIDENCE_CLAIMS)[number];

export const CLAIM_LABEL: Record<EvidenceClaim, string> = {
  UAE_CONFORMITY: "UAE conformity",
  HALAL: "Halal",
  ORGANIC: "Organic certification",
  ECOLABEL: "Environmental certification",
};

/** What a source can physically address. Caps what it can ever establish. */
export type Granularity = "EXACT_PRODUCT" | "OPERATOR" | "NAME_ONLY" | "NOT_ADDRESSABLE";

/** How, and whether, Noura can ask. */
export type Access = "AUTOMATED" | "AUTOMATED_WITH_KEY" | "MANUAL" | "NONE";

export type EvidenceSource = {
  key: string;
  name: string;
  /** The organisation that is authoritative, not the website that lists it. */
  authority: string;
  url: string;
  claims: EvidenceClaim[];
  granularity: Granularity;
  access: Access;
  /** Can a record here ever be shown as VERIFIED? Follows from granularity. */
  canVerifyExactProduct: boolean;
  /** True where the source is a registry; false for trade lists and pack claims. */
  isAuthoritativeRegistry: boolean;
  /** Plain-language rule for what counts as VERIFIED from this source. */
  verificationRule: string;
  /** What this source cannot do. Shown in admin; never hidden. */
  limitations: string;
  /** Live in the product today. */
  integrated: boolean;
};

export const EVIDENCE_SOURCES: Record<string, EvidenceSource> = {
  MOIAT: {
    key: "MOIAT",
    name: "MOIAT Conformity Register",
    authority: "UAE Ministry of Industry and Advanced Technology",
    url: "https://moiat.gov.ae/en/open-data/product-conformity-data",
    claims: ["UAE_CONFORMITY", "HALAL", "ORGANIC"],
    // 72% of imported register rows carry a GTIN-shaped ModelNumber (measured).
    granularity: "EXACT_PRODUCT",
    access: "AUTOMATED",
    canVerifyExactProduct: true,
    isAuthoritativeRegistry: true,
    verificationRule:
      "The register's model number equals this product's barcode, the certificate status is " +
      "Active, and it is within its validity dates.",
    limitations:
      "28% of rows carry a manufacturer SKU, free text or a placeholder and can never match a " +
      "barcode. The Brand column is concatenated multi-brand text, so brand matching is " +
      "company-level at best. Most packaged food is outside the register's technical scope.",
    integrated: true,
  },

  EU_ECOLABEL: {
    key: "EU_ECOLABEL",
    name: "EU Ecolabel product catalogue (ECAT)",
    authority: "European Commission and national Competent Bodies",
    url: "https://environment.ec.europa.eu/app/ecolabel-product-catalogue",
    claims: ["ECOLABEL"],
    granularity: "EXACT_PRODUCT",
    access: "AUTOMATED",
    canVerifyExactProduct: true,
    isAuthoritativeRegistry: true,
    verificationRule:
      "A catalogue row whose code_type is a GTIN, whose code_value equals this product's " +
      "barcode, and whose expiration_date has not passed.",
    limitations:
      "Regulation (EC) 66/2010 EXCLUDES FOOD AND FEED. Measured against Noura's catalogue on " +
      "2026-09-21: 0 of 50 products matched, and only 1 is even in a coverable category. An " +
      "environmental claim, not a health or safety one. See EVIDENCE_COVERAGE.md M1.",
    integrated: false,
  },

  USDA_NOP: {
    key: "USDA_NOP",
    name: "USDA Organic INTEGRITY Database",
    authority: "USDA Agricultural Marketing Service, National Organic Program",
    url: "https://organic.ams.usda.gov/integrity/",
    claims: ["ORGANIC"],
    granularity: "OPERATOR",
    access: "AUTOMATED_WITH_KEY",
    canVerifyExactProduct: false,
    isAuthoritativeRegistry: true,
    verificationRule:
      "BRAND_LEVEL_ONLY at most: the operation is listed with a relevant certified scope and " +
      "status Certified. This source can never establish VERIFIED for a SKU.",
    limitations:
      "Lists operations, not products. Certified product names are free text; USDA's own guide " +
      "warns they vary between certifying agents. Requires a free api.data.gov key.",
    integrated: false,
  },

  EU_ORGANIC_TRACES: {
    key: "EU_ORGANIC_TRACES",
    name: "TRACES NT organic operator certificates",
    authority: "European Commission and EU control bodies, Reg. (EU) 2018/848 Art. 35",
    url: "https://webgate.ec.europa.eu/tracesnt/directory/publication/organic-operator/index",
    claims: ["ORGANIC"],
    granularity: "OPERATOR",
    access: "MANUAL",
    canVerifyExactProduct: false,
    isAuthoritativeRegistry: true,
    verificationRule:
      "BRAND_LEVEL_ONLY at most: an issued, unsuspended operator certificate within validity, " +
      "recorded by a named person with the document number.",
    limitations:
      "Products are identified by name or CN code — a tariff class, not a SKU. No public API. " +
      "The public PDF states it is not a legally binding document or a valid operator certificate.",
    integrated: false,
  },

  COSMOS: {
    key: "COSMOS",
    name: "COSMOS certified products directory",
    authority: "COSMOS-standard AISBL",
    url: "https://www.cosmos-standard.org/en/databases/products-directory/",
    claims: ["ORGANIC"],
    granularity: "NAME_ONLY",
    access: "MANUAL",
    canVerifyExactProduct: false,
    isAuthoritativeRegistry: true,
    verificationRule: "Corroboration of a visible pack claim only. Never VERIFIED.",
    limitations:
      "Addressable only by commercial name — no barcode column, no validity dates. Name matching " +
      "cannot separate two products whose names differ only in capitalisation.",
    integrated: false,
  },

  MANUFACTURER_CLAIM: {
    key: "MANUFACTURER_CLAIM",
    name: "Manufacturer or retailer claim",
    authority: "None — the seller",
    url: "",
    claims: ["ORGANIC", "HALAL"],
    granularity: "NOT_ADDRESSABLE",
    access: "NONE",
    canVerifyExactProduct: false,
    isAuthoritativeRegistry: false,
    verificationRule:
      "Never VERIFIED under any circumstance. Resolves to CLAIM_ONLY, which exists so the page " +
      "can show that a claim was made while saying plainly that no register confirmed it.",
    limitations: "A claim by the party selling the product. Not evidence, and never displayed as such.",
    integrated: true,
  },
};

/** Sources deliberately excluded, with the reason. Asserted by a test. */
export const REJECTED_SOURCES: { name: string; reason: string }[] = [
  {
    name: "NAOOA certified olive oil list",
    reason:
      "A trade association's marketing page. Brand and product names only — no barcode, no lot, " +
      "no validity dates. Cannot identify a product.",
  },
  {
    name: "International Olive Council",
    reason: "Sets the trade standard. Operates no registry and certifies no products.",
  },
  {
    name: "eAmbrosia / GIview (PDO/PGI)",
    reason:
      "Registers protected NAMES, not products or producers. Cannot say whether a given bottle " +
      "is entitled to a designation.",
  },
  {
    name: "Open Food Facts labels_tags",
    reason:
      "Crowd-sourced. Useful as a hint that a claim exists and is worth checking; never evidence.",
  },
];

export type CategoryEvidencePlan = {
  category: ProductCategory;
  /** Claims worth asking about for this category, in display order. */
  claims: EvidenceClaim[];
  /** Source keys to ask, per claim. */
  sources: Partial<Record<EvidenceClaim, string[]>>;
  /** Stated plainly where a category has no verifiable certification at all. */
  note?: string;
};

const FOOD_CLAIMS: EvidenceClaim[] = ["UAE_CONFORMITY", "HALAL", "ORGANIC"];
const FOOD_SOURCES = {
  UAE_CONFORMITY: ["MOIAT"],
  HALAL: ["MOIAT"],
  ORGANIC: ["MOIAT", "USDA_NOP", "EU_ORGANIC_TRACES"],
};

/**
 * Per category. Deliberately conservative: a category lists a claim only where
 * some source could answer it, so the admin coverage view never shows a gap that
 * no source on earth could close.
 */
export const CATEGORY_EVIDENCE: CategoryEvidencePlan[] = [
  { category: "fats_oils", claims: FOOD_CLAIMS, sources: FOOD_SOURCES,
    note: "Olive oil has no verifiable quality or grade certification anywhere. Extra-virgin " +
      "grade is a lab result on a lot, not a registered fact about a barcode." },
  { category: "milk", claims: FOOD_CLAIMS, sources: FOOD_SOURCES },
  { category: "yogurt", claims: FOOD_CLAIMS, sources: FOOD_SOURCES },
  { category: "eggs", claims: FOOD_CLAIMS, sources: FOOD_SOURCES },
  { category: "bread", claims: FOOD_CLAIMS, sources: FOOD_SOURCES },
  { category: "cereal", claims: FOOD_CLAIMS, sources: FOOD_SOURCES },
  { category: "snacks", claims: FOOD_CLAIMS, sources: FOOD_SOURCES },
  { category: "drink", claims: FOOD_CLAIMS, sources: FOOD_SOURCES },
  { category: "food", claims: FOOD_CLAIMS, sources: FOOD_SOURCES },
  {
    category: "cosmetic",
    claims: ["UAE_CONFORMITY", "ECOLABEL", "ORGANIC"],
    sources: { UAE_CONFORMITY: ["MOIAT"], ECOLABEL: ["EU_ECOLABEL"], ORGANIC: ["COSMOS"] },
    note: "EU Ecolabel can verify a cosmetic by barcode, but is not integrated: measured coverage " +
      "of Noura's catalogue is currently 0%. See EVIDENCE_COVERAGE.md M1.",
  },
  {
    category: "supplement",
    claims: ["UAE_CONFORMITY"],
    sources: { UAE_CONFORMITY: ["MOIAT"] },
    note: "No supplement-specific certification source has been researched. Absence here means " +
      "not investigated, not investigated and found wanting.",
  },
];

export function planFor(category: ProductCategory): CategoryEvidencePlan | null {
  return CATEGORY_EVIDENCE.find((p) => p.category === category) ?? null;
}

/** Sources actually asked today, for a category. Drives the import and admin. */
export function integratedSourcesFor(category: ProductCategory): EvidenceSource[] {
  const plan = planFor(category);
  if (!plan) return [];
  const keys = new Set(Object.values(plan.sources).flat());
  return [...keys]
    .map((k) => EVIDENCE_SOURCES[k])
    .filter((s): s is EvidenceSource => Boolean(s) && s.integrated);
}

/**
 * The ceiling. A source that cannot address an exact product must never produce
 * VERIFIED, whatever its records say — enforced here so no importer can forget.
 */
export function capStateForSource(state: string, sourceKey: string): string {
  const source = EVIDENCE_SOURCES[sourceKey];
  // An unrecognised source is not evidence. Defaulting to the claimed state
  // would let any future caller launder an arbitrary string into VERIFIED.
  if (!source) return "UNKNOWN";

  // AUTHORITY FIRST, then granularity. Order matters: a manufacturer claim is
  // NOT_ADDRESSABLE *and* not a registry, and checking granularity first would
  // cap it at BRAND_LEVEL_ONLY — a pack claim wearing a registry's clothes.
  if (!source.isAuthoritativeRegistry) {
    return state === "UNKNOWN" || state === "NOT_FOUND" ? state : "CLAIM_ONLY";
  }
  if (state === "VERIFIED" && !source.canVerifyExactProduct) return "BRAND_LEVEL_ONLY";
  return state;
}
