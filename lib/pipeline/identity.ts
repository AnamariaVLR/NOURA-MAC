/**
 * THE IDENTITY GATE.
 *
 * One place decides what Noura believes it is looking at, and every stage after
 * it consumes that decision rather than forming its own. Evidence, analysis,
 * alternatives and commerce may not independently invent, replace or
 * reinterpret the product.
 *
 * -- Why this is data and not presentation ----------------------------------
 *
 * A photograph of Al Rawabi yoghurt once produced a complete Coca-Cola
 * assessment. The page looked entirely normal; the only thing wrong with it was
 * invisible. So the identity, the reasoning behind it, and the signals that
 * agreed or disagreed are all persisted on the scan, and a scan can be audited
 * long after the fact without re-running anything.
 *
 * -- The rule that cost the most thought ------------------------------------
 *
 * A barcode is normally decisive: digits are checkable, and a matched GTIN is
 * the strongest identity signal available. But a barcode is TRANSCRIBED by a
 * model from an image, and a single misread digit lands on a different real
 * product with real evidence.
 *
 * So: strong evidence must not override multiple independent contradictory
 * signals without confirmation. When the barcode-resolved product is
 * contradicted by BOTH the model's own claimed brand AND the text the model
 * transcribed off the pack, that is three signals naming three different
 * products, and the honest response is a question rather than a verdict.
 *
 * One contradiction is not enough -- models misread text, and brands are often
 * absent from a crop. Both, together, mean the barcode is the odd one out.
 */

import { createHash } from "node:crypto";
import { brandCorroborated } from "./match";

/* ---------------------------------------------------------------------------
 * States
 * ------------------------------------------------------------------------- */

export const IDENTITY_STATES = [
  /** The user chose this product from candidates we offered. Strongest. */
  "IDENTIFIED_AND_VERIFIED",
  /** A transcribed barcode resolved to a product, uncontradicted. */
  "IDENTIFIED_BY_BARCODE",
  /** Matched by name, and the pack text supports the matched brand. */
  "IDENTIFIED_BY_NAME_WITH_CORROBORATION",
  /** Matched by name with nothing from the image supporting it. */
  "IDENTIFIED_BY_NAME_ONLY",
  /** Signals disagree, or candidates cannot be separated. Ask. */
  "NEEDS_CONFIRMATION",
  /** Nothing was identified at all. */
  "NOT_IDENTIFIED",
  /** Identity is established; there is not enough evidence to assess it. */
  "INSUFFICIENT_EVIDENCE",
] as const;

export type IdentityState = (typeof IDENTITY_STATES)[number];

/**
 * The states that permit a product-specific verdict.
 *
 * IDENTIFIED_BY_NAME_ONLY is deliberately NOT among them. A name match with no
 * corroboration from the image is the shape of every confident
 * misidentification, and confirmation is cheaper than being wrong.
 */
export const ANALYSABLE_STATES: readonly IdentityState[] = [
  "IDENTIFIED_AND_VERIFIED",
  "IDENTIFIED_BY_BARCODE",
  "IDENTIFIED_BY_NAME_WITH_CORROBORATION",
];

export function permitsAnalysis(state: IdentityState): boolean {
  return ANALYSABLE_STATES.includes(state);
}

/** Reader-facing, and deliberately not collapsed into one word. */
export const IDENTITY_STATE_LABEL: Record<IdentityState, string> = {
  IDENTIFIED_AND_VERIFIED: "You confirmed this product",
  IDENTIFIED_BY_BARCODE: "Matched by barcode",
  IDENTIFIED_BY_NAME_WITH_CORROBORATION: "Matched by name, confirmed against the pack",
  IDENTIFIED_BY_NAME_ONLY: "Matched by name only, not confirmed against the pack",
  NEEDS_CONFIRMATION: "We need you to confirm this product",
  NOT_IDENTIFIED: "Not identified",
  INSUFFICIENT_EVIDENCE: "Identified, but there is not enough evidence to assess it",
};

/* ---------------------------------------------------------------------------
 * The audit record
 * ------------------------------------------------------------------------- */

/** Everything that went into the decision, kept so it can be re-examined. */
export type IdentityRecord = {
  state: IdentityState;
  /** Deterministic key for the resolved product. Null when none was resolved. */
  fingerprint: string | null;
  /** What the model said. */
  claimedBrand: string | null;
  claimedName: string | null;
  claimedBarcode: string | null;
  confidence: number | null;
  /** What the model transcribed off the pack. */
  visibleText: string | null;
  /** What we matched it to. */
  matchedProductId: string | null;
  matchedBrand: string | null;
  matchedName: string | null;
  matchedBarcode: string | null;
  matchMethod: string;
  /** Which signals supported the match, and which contradicted it. */
  brandAgrees: boolean | null;
  textCorroborates: boolean | null;
  barcodeContradicted: boolean;
  /** Plain sentence naming the reason, for the audit view. */
  reason: string;
};

/* ---------------------------------------------------------------------------
 * Fingerprint
 * ------------------------------------------------------------------------- */

export type IdentifiedProduct = {
  id: string;
  barcode: string | null;
  brand: string | null;
  name: string;
  sizeLabel: string | null;
};

/**
 * A deterministic key for one product identity.
 *
 * Every downstream stage recomputes this from the product it is about to work
 * on and compares it with the scan's. A mismatch means a stage has acquired a
 * different product than the one that was identified, and the pipeline fails
 * closed rather than continuing -- which is the only way to be sure that
 * evidence, analysis, alternatives and commerce are all about the same thing.
 */
export function fingerprint(product: IdentifiedProduct): string {
  const parts = [
    product.id,
    product.barcode ?? "",
    (product.brand ?? "").trim().toLowerCase(),
    product.name.trim().toLowerCase(),
    (product.sizeLabel ?? "").trim().toLowerCase(),
  ];
  return createHash("sha256").update(parts.join(" ")).digest("hex").slice(0, 32);
}

export class IdentityMismatchError extends Error {
  constructor(stage: string, expected: string, actual: string) {
    super(
      `Identity changed before ${stage}: expected ${expected}, got ${actual}. ` +
        "The pipeline stopped rather than produce an answer about a different product.",
    );
    this.name = "IdentityMismatchError";
  }
}

/**
 * The guard every downstream stage calls. Throws rather than returns, because a
 * caller that forgets to check a boolean is exactly how this class of bug
 * survives.
 */
export function assertSameIdentity(
  stage: string,
  expected: string | null,
  product: IdentifiedProduct,
): void {
  if (!expected) return;
  const actual = fingerprint(product);
  if (actual !== expected) throw new IdentityMismatchError(stage, expected, actual);
}

/* ---------------------------------------------------------------------------
 * The barcode contradiction rule
 * ------------------------------------------------------------------------- */

export type ContradictionInput = {
  claimedBrand: string | null | undefined;
  visibleText: string | null | undefined;
  matchedBrand: string | null | undefined;
};

/** Do two brand strings name the same brand? Letters and digits only. */
export function sameBrand(a: string | null | undefined, b: string | null | undefined): boolean {
  const flat = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!a?.trim() || !b?.trim()) return false;
  const x = flat(a);
  const y = flat(b);
  if (!x || !y) return false;
  return x.includes(y) || y.includes(x);
}

/**
 * Is a barcode-resolved identity contradicted by BOTH other signals?
 *
 * Both, not either. A missing brand or unreadable pack text is an absence, not
 * a contradiction, and treating absence as disagreement would send almost every
 * scan to confirmation.
 */
export function barcodeIsContradicted(input: ContradictionInput): boolean {
  const haveClaim = Boolean(input.claimedBrand?.trim());
  const haveText = Boolean(input.visibleText?.trim());
  if (!haveClaim || !haveText) return false;

  const brandAgrees = sameBrand(input.claimedBrand, input.matchedBrand);
  const textAgrees = brandCorroborated(input.visibleText, input.matchedBrand);

  return !brandAgrees && !textAgrees;
}
