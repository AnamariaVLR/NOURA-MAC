/**
 * WHO IS SPEAKING — decided from the URL, in our code, never by the page.
 *
 * This is the most important function in the research layer, and it is
 * deliberately boring: a deterministic lookup of a registrable domain against
 * lists we control.
 *
 * -- Why it cannot be the model's job ---------------------------------------
 *
 * Source type drives the capability matrix, and the matrix decides whether a
 * claim may reach INDEPENDENTLY_VERIFIED. If a page could tell us what kind of
 * source it is, then the sentence
 *
 *     "This is the official UAE certification registry."
 *
 * printed anywhere on any page would be enough to manufacture a verification.
 * Asking a model to judge trustworthiness from content has the same hole: the
 * content is the attack surface.
 *
 * So classification never reads the page. It reads the address the page was
 * fetched from, which the page does not control.
 */

import type { SourceType } from "../evidence/authority";

/** The registrable domain: "www.moiat.gov.ae" -> "moiat.gov.ae". */
export function registrableDomain(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

/**
 * Government and statutory bodies.
 *
 * Suffix matching on the domain, so `moiat.gov.ae` and `api.moiat.gov.ae` both
 * qualify while `moiat.gov.ae.attacker.com` does not — the check is on the END
 * of the hostname, which is the part registrars control.
 */
const REGULATOR_SUFFIXES = [
  ".gov",
  ".gov.ae",
  ".gov.uk",
  ".gov.au",
  ".govt.nz",
  "europa.eu",
  "who.int",
  "fao.org",
  "codexalimentarius.org",
  "moccae.gov.ae",
  "moiat.gov.ae",
  "esma.gov.ae",
];

/** Registers of certificates. */
const REGISTRY_DOMAINS = [
  "organic.ams.usda.gov",
  "organicapi.ams.usda.gov",
  "webgate.ec.europa.eu",
  "environment.ec.europa.eu",
  "environmental-data.ec.europa.eu",
  "cosmos-standard.org",
  "certificat.ecocert.com",
  "ecocert.com",
  "eiac.gov.ae",
  "bioc.info",
];

/** Peer-reviewed work and scientific advisory bodies. */
const SCIENCE_DOMAINS = [
  "pubmed.ncbi.nlm.nih.gov",
  "ncbi.nlm.nih.gov",
  "doi.org",
  "efsa.europa.eu",
  "cochranelibrary.com",
  "nature.com",
  "sciencedirect.com",
  "thelancet.com",
  "bmj.com",
  "nejm.org",
  "jamanetwork.com",
  "springer.com",
  "wiley.com",
  "mdpi.com",
  "frontiersin.org",
  "plos.org",
];

/** Crowd-sourced product databases. */
const OPEN_DATABASE_DOMAINS = [
  "openfoodfacts.org",
  "openbeautyfacts.org",
  "openproductsfacts.org",
  "openpetfoodfacts.org",
];

/** Shops. UAE first, then the general ones that ship here. */
const RETAILER_DOMAINS = [
  "carrefouruae.com",
  "carrefour.ae",
  "noon.com",
  "spinneys.com",
  "spinneysdubai.com",
  "amazon.ae",
  "amazon.com",
  "luluhypermarket.com",
  "waitrose.ae",
  "choithrams.com",
  "kibsons.com",
  "talabat.com",
  "instashop.com",
  "boots.com",
  "sephora.ae",
  "namshi.com",
  "ounass.ae",
];

function matchesSuffix(domain: string, suffixes: string[]): boolean {
  return suffixes.some((s) => domain === s.replace(/^\./, "") || domain.endsWith(s));
}

function matchesDomain(domain: string, list: string[]): boolean {
  return list.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/**
 * Tokens from a brand, usable for matching a manufacturer's own domain.
 *
 * Short and generic words are dropped: "the", "oil", "of" and similar would
 * match half the web, and a false MANUFACTURER classification grants
 * AUTHORITATIVE on product identity.
 */
const GENERIC_BRAND_WORDS = new Set([
  "the", "and", "of", "for", "oil", "co", "company", "ltd", "llc", "inc", "gmbh",
  "group", "brand", "products", "food", "foods", "care", "health", "beauty",
]);

export function brandTokens(brand: string | null | undefined): string[] {
  if (!brand?.trim()) return [];
  return brand
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !GENERIC_BRAND_WORDS.has(t));
}

/**
 * Classify a URL.
 *
 * `brand` is the brand the IMAGE established, not anything the page said. A
 * page only counts as the manufacturer when its domain carries a distinctive
 * token of that brand — bayer.com for Bayer. This is a heuristic, and it is
 * bounded: MANUFACTURER is authoritative only for identity, size and intended
 * use, and merely DECLARED for ingredients, so a wrong guess cannot produce a
 * verification of anything.
 *
 * Everything unrecognised is GENERIC_WEB, which can only ever make claims.
 */
export function classifySource(url: string, brand?: string | null): SourceType {
  const domain = registrableDomain(url);
  if (!domain) return "GENERIC_WEB";

  // Order matters: a registry that happens to sit on a .gov domain should be
  // classified as the registry, which is the more specific answer.
  if (matchesDomain(domain, REGISTRY_DOMAINS)) return "CERTIFICATION_REGISTRY";
  if (matchesDomain(domain, SCIENCE_DOMAINS)) return "SCIENTIFIC_LITERATURE";
  if (matchesSuffix(domain, REGULATOR_SUFFIXES)) return "REGULATOR";
  if (matchesDomain(domain, OPEN_DATABASE_DOMAINS)) return "OPEN_DATABASE";
  if (matchesDomain(domain, RETAILER_DOMAINS)) return "RETAILER";

  const tokens = brandTokens(brand);
  if (tokens.length > 0) {
    // Compare against the domain WITHOUT its public suffix, so "ogx.com" is a
    // match for OGX while "notogx-reviews.com" is not: the token must be a
    // whole label, not a substring anywhere in the name.
    const labels = domain.split(".");
    if (labels.some((label) => tokens.includes(label))) return "MANUFACTURER";
  }

  return "GENERIC_WEB";
}

/** Human-readable name for a source, from its domain. Never from its content. */
export function sourceNameFor(url: string): string {
  return registrableDomain(url) ?? url;
}
