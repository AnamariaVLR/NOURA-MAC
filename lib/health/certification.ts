/**
 * What Noura is entitled to say about a product's UAE certification.
 *
 * ── The five states, and why there are five ─────────────────────────────────
 *
 * The obvious model is a boolean, and it is wrong in both directions. "Certified"
 * implies we matched this exact product; "not certified" implies the register
 * says no. Neither is usually true. So:
 *
 *   VERIFIED          the register holds a valid certificate whose model number
 *                     IS this product's barcode. The exact product.
 *   BRAND_LEVEL_ONLY  the brand appears in the register, but nothing ties a
 *                     certificate to THIS product. Shown, never counted as
 *                     verification — a certified kettle says nothing about a
 *                     bottle of water from the same company.
 *   EXPIRED           an exact-product certificate exists and has lapsed. The
 *                     assurance is out of date; it is not a finding against the
 *                     product.
 *   NOT_FOUND         we asked the register about this barcode and it returned
 *                     nothing. **This is not "not certified".** Most food is not
 *                     within MOIAT's technical-regulation scope at all.
 *   UNKNOWN           we never asked, or the query failed. The default.
 *
 * The line between NOT_FOUND and UNKNOWN is the reason EvidenceLookup
 * exists: it is the record that the question was put.
 *
 * ── What this never does ────────────────────────────────────────────────────
 *
 * It never promotes a brand match to a product match, and it never treats a
 * SYNTHETIC row as evidence. Both are enforced here rather than at the call
 * site, so no future caller can forget.
 */

import { isVerifiableSource } from "../schemas";

/**
 * The six states, each defined by WHAT WAS ESTABLISHED, never by what was assumed.
 *
 *   VERIFIED          an authoritative source matched THIS EXACT PRODUCT, and the
 *                     record is live. The only state that counts as verification.
 *   BRAND_LEVEL_ONLY  the brand or company matched; this product did not. A
 *                     certified kettle is not a certified bottle of water.
 *   EXPIRED           an exact-product record was found and is no longer valid.
 *                     Not a finding against the product — the assurance is stale.
 *   NOT_FOUND         the source was asked and held no record. A fact about the
 *                     REGISTER. Never rendered as "not certified".
 *   UNKNOWN           the source could not be asked, or was never asked.
 *   CLAIM_ONLY        a manufacturer or retailer asserts it and no authoritative
 *                     register was able to confirm it. The pack says organic; the
 *                     registry does not say so. That is worth showing, and it is
 *                     not verification.
 *
 * The forbidden equivalences, written down because each has been made before:
 *   NOT_FOUND  ≠  NOT_CERTIFIED
 *   NOT_FOUND  ≠  UNKNOWN
 *   BRAND      ≠  PRODUCT
 *   CLAIM      ≠  VERIFIED
 */
export const CERTIFICATION_STATES = [
  "VERIFIED",
  "BRAND_LEVEL_ONLY",
  "EXPIRED",
  "NOT_FOUND",
  "UNKNOWN",
  "CLAIM_ONLY",
] as const;

/** One line each, for the admin coverage view and for tests to assert against. */
export const STATE_MEANING: Record<CertificationState, string> = {
  VERIFIED: "EXACT_PRODUCT_MATCH · AUTHORITATIVE_EVIDENCE",
  BRAND_LEVEL_ONLY: "BRAND_MATCH_BUT_NOT_EXACT_PRODUCT",
  EXPIRED: "EVIDENCE_FOUND_BUT_NO_LONGER_VALID",
  NOT_FOUND: "NO_RECORD_IN_THIS_SOURCE",
  UNKNOWN: "INSUFFICIENT_EVIDENCE_OR_SOURCE_NOT_AVAILABLE",
  CLAIM_ONLY: "MANUFACTURER_OR_RETAILER_CLAIM_WITHOUT_AUTHORITATIVE_VERIFICATION",
};

export type CertificationState = (typeof CERTIFICATION_STATES)[number];

export type CertificateEvidence = {
  certificateNumber: string;
  certificateType: string;
  /** Our reading: "valid" | "expired" | "suspended". */
  status: string;
  /** The register's own word, kept for provenance. */
  rawStatus: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  /** "BARCODE" (this exact product) or "BRAND" (the brand only). */
  matchBasis: string;
  bodyName: string | null;
  registerBrand: string | null;
  registerModelNumber: string | null;
  registerProductType: string | null;
  registerCompany: string | null;
  /** DataSource. A SYNTHETIC row can never verify anything. */
  sourceKind: string;
  sourceName: string;
  sourceUrl: string;
  lastVerifiedAt: Date;
};

export type LookupEvidence = {
  barcode: string;
  exactMatches: number;
  brandMatches: number;
  succeeded: boolean;
  source: string;
  sourceUrl: string;
  checkedAt: Date;
} | null;

export type CertificationAssessment = {
  state: CertificationState;
  /** The certificate the state rests on, when one does. */
  certificate: CertificateEvidence | null;
  /** Exact-product certificates, valid or not. */
  exact: CertificateEvidence[];
  /** Brand-level certificates. Never evidence about this product. */
  brandOnly: CertificateEvidence[];
  /** Whether the register was asked, and when. Drives NOT_FOUND vs UNKNOWN. */
  lookup: LookupEvidence;
  /** True only for VERIFIED — the one state that counts as verification. */
  countsAsVerification: boolean;
};

/** A certificate is live when it is valid and has not passed its expiry. */
export function isLive(certificate: CertificateEvidence, now: Date): boolean {
  if (certificate.status !== "valid") return false;
  if (certificate.expiresAt && certificate.expiresAt.getTime() <= now.getTime()) return false;
  return true;
}

/**
 * The whole rule, in one pure function.
 *
 * Order matters and is the argument: a suspension outranks everything, an exact
 * match outranks a brand match, and a brand match never becomes a product one.
 *
 * RUBRIC.md §6 — C6.1 (a certificate is evidence only from a named register),
 * C6.10 / D9 (a missing certificate is UNKNOWN, never a failure). Both POLICY.
 */
export function assessCertification(
  certificates: CertificateEvidence[],
  lookup: LookupEvidence,
  now: Date = new Date(),
): CertificationAssessment {
  // Demo scaffolding is not evidence, and is filtered here so no caller can
  // forget. RUBRIC.md §6 C6.1.
  const real = certificates.filter((c) => isVerifiableSource(c.sourceKind));

  const exact = real.filter((c) => c.matchBasis === "BARCODE");
  const brandOnly = real.filter((c) => c.matchBasis !== "BARCODE");

  const base = { exact, brandOnly, lookup };

  // A suspended certificate for THIS product is a live regulator warning and
  // outranks every other reading.
  const suspended = exact.find((c) => c.status === "suspended");
  if (suspended) {
    return { ...base, state: "EXPIRED", certificate: suspended, countsAsVerification: false };
  }

  const live = exact.find((c) => isLive(c, now));
  if (live) return { ...base, state: "VERIFIED", certificate: live, countsAsVerification: true };

  if (exact.length > 0) {
    // An exact match that is not live: lapsed, or withdrawn.
    return { ...base, state: "EXPIRED", certificate: exact[0], countsAsVerification: false };
  }

  if (brandOnly.length > 0) {
    // The brand is in the register and this product is not. That is worth
    // showing and is NOT verification of anything about this product.
    return {
      ...base,
      state: "BRAND_LEVEL_ONLY",
      certificate: brandOnly[0],
      countsAsVerification: false,
    };
  }

  // Nothing matched. Did we ask?
  if (lookup && lookup.succeeded) {
    return { ...base, state: "NOT_FOUND", certificate: null, countsAsVerification: false };
  }

  return { ...base, state: "UNKNOWN", certificate: null, countsAsVerification: false };
}

/**
 * How strongly one product's certification is evidenced, for ranking.
 *
 * VERIFIED is the only state that outranks the others, because it is the only
 * one that says something about the exact product. BRAND_LEVEL_ONLY sits above
 * NOT_FOUND only in the sense that more is known, and EXPIRED sits below
 * NOT_FOUND because a lapsed assurance is a worse signal than silence — the same
 * ordering the ranker already applies to a suspended certificate (§8 R3).
 */
export const CERTIFICATION_RANK: Record<CertificationState, number> = {
  VERIFIED: 3,
  BRAND_LEVEL_ONLY: 1,
  // A claim on the pack that no register confirms sits above silence — someone
  // is at least asserting it, and that is information — and far below a brand
  // record, which at least came from a registry. It must never approach VERIFIED.
  CLAIM_ONLY: 0.5,
  UNKNOWN: 0,
  NOT_FOUND: 0,
  EXPIRED: -1,
};

/** Reader-facing label. Never "not certified" — see the header. */
export const CERTIFICATION_LABEL: Record<CertificationState, string> = {
  VERIFIED: "Verified for this exact product",
  BRAND_LEVEL_ONLY: "Brand appears in the register, this product does not",
  EXPIRED: "A certificate exists but is no longer valid",
  NOT_FOUND: "No record found in the source we searched",
  UNKNOWN: "Not checked against any register",
  CLAIM_ONLY: "Claimed on the pack, not confirmed by a register",
};

/* -------------------------------------------------------------------------
 * Mapping a database row to evidence
 *
 * One function, exported, because doing it by hand is how a field gets missed.
 * The row's column is `source`; this type's field is `sourceKind`, and a
 * mismatch there silently filters EVERY certificate out as unverifiable —
 * which is a failure that looks exactly like "nothing is certified".
 * ----------------------------------------------------------------------- */

export type CertificationRow = {
  certificateNumber: string;
  certificateType: string;
  status: string;
  rawStatus: string | null;
  issuedAt: Date | null;
  expiresAt: Date | null;
  matchBasis: string;
  registerBrand: string | null;
  registerModelNumber: string | null;
  registerProductType: string | null;
  registerCompany: string | null;
  source: string;
  sourceName: string;
  sourceUrl: string;
  lastVerifiedAt: Date;
  body?: { name: string } | null;
};

export function toCertificateEvidence(row: CertificationRow): CertificateEvidence {
  return {
    certificateNumber: row.certificateNumber,
    certificateType: row.certificateType,
    status: row.status,
    rawStatus: row.rawStatus,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    matchBasis: row.matchBasis,
    bodyName: row.body?.name ?? null,
    registerBrand: row.registerBrand,
    registerModelNumber: row.registerModelNumber,
    registerProductType: row.registerProductType,
    registerCompany: row.registerCompany,
    sourceKind: row.source,
    sourceName: row.sourceName,
    sourceUrl: row.sourceUrl,
    lastVerifiedAt: row.lastVerifiedAt,
  };
}
