/**
 * Reading and writing EvidenceLookup rows.
 *
 * One product has as many lookup rows as there are (source, claim) pairs worth
 * asking. This module is the only place that knows how to turn those rows into
 * the shape the checker consumes, so no caller can quietly reduce several
 * sources to one answer.
 */

import type { EvidenceLookup } from "@prisma/client";
import type { LookupEvidence } from "../health/certification";
import { EVIDENCE_SOURCES, type EvidenceClaim } from "./registry";

/** The UAE conformity answer specifically — what the certification check reads. */
export function uaeConformityLookup(rows: EvidenceLookup[]): LookupEvidence {
  const row = rows.find((r) => r.sourceKey === "MOIAT" && r.claim === "UAE_CONFORMITY");
  if (!row) return null;
  return {
    barcode: row.queriedValue,
    exactMatches: row.exactMatches,
    brandMatches: row.brandMatches,
    succeeded: row.succeeded,
    source: row.sourceName,
    sourceUrl: row.sourceUrl,
    checkedAt: row.retrievedAt,
  };
}

export type ClaimEvidence = {
  claim: EvidenceClaim;
  claimLabel: string;
  sourceKey: string;
  sourceName: string;
  sourceUrl: string;
  state: string;
  referenceNumber: string | null;
  validUntil: Date | null;
  retrievedAt: Date;
  /** Honest sentence naming the source. Never "not certified". */
  sentence: string;
};

/**
 * One line per (source, claim), phrased so a reader can tell WHICH register said
 * WHAT. "No UAE conformity record found in MOIAT" — never "not certified".
 */
export function describeLookup(row: EvidenceLookup): ClaimEvidence {
  const source = EVIDENCE_SOURCES[row.sourceKey];
  const sourceName = source?.name ?? row.sourceName;
  const claimLabel =
    row.claim === "UAE_CONFORMITY" ? "UAE conformity"
    : row.claim === "HALAL" ? "Halal"
    : row.claim === "ORGANIC" ? "Organic certification"
    : "Environmental certification";

  const sentence = (() => {
    switch (row.state) {
      case "VERIFIED":
        return `${claimLabel}: VERIFIED for this exact product in ${sourceName}` +
          (row.referenceNumber ? ` — certificate ${row.referenceNumber}` : "");
      case "BRAND_LEVEL_ONLY":
        return `${claimLabel}: the brand appears in ${sourceName}, this product does not`;
      case "EXPIRED":
        return `${claimLabel}: a record exists in ${sourceName} but is no longer valid`;
      case "NOT_FOUND":
        return `${claimLabel}: no record found in ${sourceName}`;
      case "CLAIM_ONLY":
        return `${claimLabel}: claimed on the pack, not confirmed by any register we searched`;
      default:
        return `${claimLabel}: not checked against ${sourceName}`;
    }
  })();

  return {
    claim: row.claim as EvidenceClaim,
    claimLabel,
    sourceKey: row.sourceKey,
    sourceName,
    sourceUrl: row.sourceUrl,
    state: row.state,
    referenceNumber: row.referenceNumber,
    validUntil: row.validUntil,
    retrievedAt: row.retrievedAt,
    sentence,
  };
}

/** Every claim we hold an answer for, ordered for display. */
export function describeAll(rows: EvidenceLookup[]): ClaimEvidence[] {
  const order: Record<string, number> = { UAE_CONFORMITY: 0, HALAL: 1, ORGANIC: 2, ECOLABEL: 3 };
  return [...rows]
    .sort((a, b) => (order[a.claim] ?? 9) - (order[b.claim] ?? 9))
    .map(describeLookup);
}
