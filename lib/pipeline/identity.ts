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
 * Scene multiplicity
 * ------------------------------------------------------------------------- */

/**
 * How many products the photograph is ABOUT.
 *
 * A camera does not crop to intent. Someone photographing a pot of yoghurt on a
 * shelf captures the four pots beside it, and someone photographing two items
 * to compare them captures exactly the same scene. The image cannot tell those
 * apart, and neither can we — so where more than one product is readable, the
 * answer is to ask rather than to pick the one that happens to be nearest the
 * middle.
 *
 * A real photograph proved the need: two cosmetics lying side by side, both
 * plainly readable, and the identification reported only one of them without
 * any signal that a second existed. It ended safely only because neither was in
 * the catalogue. Had one been, that product would have received a verdict and
 * the other would have vanished from the record entirely.
 */
export const SCENE_STATES = ["SINGLE_PRODUCT", "MULTIPLE_PRODUCTS", "UNCLEAR_MULTIPLE"] as const;
export type SceneMultiplicity = (typeof SCENE_STATES)[number];

export type SceneInput = {
  /** Packages substantially visible — readable enough to tell what they are. */
  distinctProductsVisible: number;
  /** The other readable packages, excluding the primary one. */
  otherProducts: { name: string; brand: string | null }[];
};

/**
 * Read the scene.
 *
 * The count and the list can disagree — a model may say "2" and list none, or
 * say "1" and list one anyway. Disagreement is not resolved by preferring one
 * field; it is itself the finding, and resolves to UNCLEAR_MULTIPLE.
 */
export function sceneOf(input: SceneInput): SceneMultiplicity {
  const counted = Number.isFinite(input.distinctProductsVisible)
    ? Math.max(1, Math.floor(input.distinctProductsVisible))
    : 1;
  const listed = input.otherProducts?.length ?? 0;

  if (counted === 1 && listed === 0) return "SINGLE_PRODUCT";
  if (counted > 1 && listed > 0) return "MULTIPLE_PRODUCTS";
  // One field says several, the other says one. We do not know which to believe.
  return "UNCLEAR_MULTIPLE";
}

/** Only a single-product scene may proceed without asking. */
export function scenePermitsAnalysis(scene: SceneMultiplicity): boolean {
  return scene === "SINGLE_PRODUCT";
}

export const SCENE_LABEL: Record<SceneMultiplicity, string> = {
  SINGLE_PRODUCT: "One product in the photo",
  MULTIPLE_PRODUCTS: "More than one product in the photo",
  UNCLEAR_MULTIPLE: "We could not tell how many products are in the photo",
};

/* ---------------------------------------------------------------------------
 * The audit record
 * ------------------------------------------------------------------------- */

/** Everything that went into the decision, kept so it can be re-examined. */
export type IdentityRecord = {
  state: IdentityState;
  /** How many products the photograph is about. */
  scene: SceneMultiplicity;
  /** The other readable packages, so the record shows what was NOT chosen. */
  otherProductsSeen: { name: string; brand: string | null }[];
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
export function fingerprint(product: IdentifiedProduct, scene: SceneMultiplicity = "SINGLE_PRODUCT"): string {
  const parts = [
    product.id,
    product.barcode ?? "",
    (product.brand ?? "").trim().toLowerCase(),
    product.name.trim().toLowerCase(),
    (product.sizeLabel ?? "").trim().toLowerCase(),
    // The scene is part of the identity, not context around it. A verdict
    // reached because ONE product was in frame is not the same claim as the
    // same verdict reached while a second sat beside it, and a later stage must
    // not be able to inherit the first while the truth was the second.
    scene,
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
