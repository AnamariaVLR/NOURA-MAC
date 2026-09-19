/**
 * Turns evidence into a checklist.
 *
 * One function per rubric dimension. Each returns a `Check` whose `status` is
 * "pass", "fail" or "unknown". Pure, synchronous, no network, no model — so the
 * same evidence always produces the same checklist and every branch is testable.
 *
 * THE INVARIANT THIS FILE EXISTS TO PROTECT: a check is "pass" only when a value
 * was actually observed. Every function here reaches its "unknown" branch before it
 * can reach its "pass" branch, so a missing value cannot fall through into a tick.
 * `tests/unit/checks.test.ts` asserts this over every dimension.
 */

import { isVerifiableSource } from "../schemas";
import type { Check, CheckStatus, NutritionFacts, ProductCategory, SourceRef } from "../schemas";
import { resolveAddedSugar, type AddedSugarVerdict } from "./added-sugar";
import {
  ADDITIVE_PASS_MAX,
  DIMENSIONS,
  DISQUALIFIER_MARGIN,
  LABELS,
  NOVA_PASS_MAX,
  SEVERE_NUTRIENT_DISQUALIFIES,
  THRESHOLDS,
  type ComponentKey,
} from "./rubric";

export type CertificationEvidence = {
  certificateType: string;
  status: "valid" | "expired" | "suspended";
  /** Name of the EIAC-accredited body, when the certificate names one. */
  bodyName: string | null;
  certificateNumber: string;
  /** DataSource. A "SYNTHETIC" certificate can never verify anything. */
  sourceKind: string;
  source: SourceRef;
};

export type EvidenceInput = {
  category: ProductCategory;
  nutrition: NutritionFacts | null;
  novaGroup: number | null;
  additives: string[];
  allergens: string[];
  ingredientsText: string | null;
  certifications: CertificationEvidence[];
  /** Attribution for the nutrition/ingredient evidence. */
  evidenceSource: SourceRef;
};

function round1(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function perUnit(nutrition: NutritionFacts): string {
  return nutrition.basis === "per_100ml" ? "per 100 ml" : "per 100 g";
}

function unknown(
  key: ComponentKey,
  claim: string,
  detail: string,
  source: SourceRef,
  measured = "unknown",
): Check {
  return {
    key,
    label: LABELS[key],
    status: "unknown",
    claim,
    detail,
    evidence: { label: LABELS[key], value: measured },
    source,
  };
}

/* -------------------------------------------------------------------------
 * Nutrients: saturated fat, salt
 * ----------------------------------------------------------------------- */

function nutrientCheck(
  key: "saturatedFat" | "salt",
  value: number | null,
  category: "food" | "drink",
  nutrition: NutritionFacts | null,
  source: SourceRef,
): Check {
  const label = LABELS[key];

  // Unknown first: there is no path from a null value to a pass.
  if (value === null || nutrition === null) {
    return unknown(
      key,
      `${label} content is not published`,
      `No ${label.toLowerCase()} figure appears in the evidence we could find, so this check could not be made.`,
      source,
    );
  }

  const t = THRESHOLDS[category][key];
  const unit = perUnit(nutrition);
  const measured = `${round1(value)} g ${unit}`;
  const passed = value <= t.good;
  // Clearly above the rubric's high mark this is not merely a failed check — it
  // overrides the rest of the list. A value within DISQUALIFIER_MARGIN of the mark
  // is a plain failure: a hairline crossing is not a severe failure.
  const severe = !passed && SEVERE_NUTRIENT_DISQUALIFIES && value >= t.bad * DISQUALIFIER_MARGIN;

  return {
    key,
    label,
    ...(severe ? { disqualifying: true as const } : {}),
    status: passed ? "pass" : "fail",
    claim: passed
      ? `Low ${label.toLowerCase()}`
      : value >= t.bad
        ? `High ${label.toLowerCase()}`
        : `Some ${label.toLowerCase()}`,
    detail: passed
      ? `${measured}. Low is ${t.good} g or less.`
      : value >= t.bad
        ? `${measured}. That counts as high, which starts at ${t.bad} g.`
        : `${measured}. More than the ${t.good} g that counts as low, but below the ${t.bad} g that counts as high.`,
    evidence: { label, value: measured },
    source,
  };
}

/* -------------------------------------------------------------------------
 * Added sugar
 *
 * The one check that is about presence rather than quantity. "No added sugar" is a
 * claim about what went into the product; the number on the nutrition panel is a
 * measurement of what came out of it, lactose and fructose included. The resolution
 * of the evidence lives in ./added-sugar.ts; this function only turns a conclusion
 * into a sentence.
 * ----------------------------------------------------------------------- */

function addedSugarDetail(
  resolved: AddedSugarVerdict,
  nutrition: NutritionFacts | null,
  unit: string,
): string {
  const total =
    nutrition?.sugarsG !== null && nutrition?.sugarsG !== undefined
      ? `Total sugars are ${round1(nutrition.sugarsG)} g ${unit}, which includes any sugar naturally present.`
      : "";

  switch (resolved.basis) {
    case "ingredient-list":
      return resolved.state === "present"
        ? `Sugar is named in the ingredients: ${resolved.terms.slice(0, 3).join(", ")}. ${total}`.trim()
        : `The published ingredient list names no sugar, syrup or other sweetener. ${total}`.trim();
    case "ingredient-list-over-figure":
      return `Sugar is named in the ingredients: ${resolved.terms.slice(0, 3).join(", ")}. A published figure disagrees, and we follow the ingredients. ${total}`.trim();
    case "published-figure":
      return resolved.state === "present"
        ? `The record publishes an added-sugar figure of ${round1(resolved.grams ?? 0)} g ${unit}. ${total}`.trim()
        : `The record publishes an added-sugar figure of zero, and no ingredient list was available to check it against. ${total}`.trim();
    case "conflicting-evidence":
      return `The ingredients name no sweetener, but a published figure says ${round1(resolved.grams ?? 0)} g ${unit} was added. The two disagree, so we are not going to guess. ${total}`.trim();
    default:
      return `No ingredient list and no added-sugar figure are published, so we cannot tell whether sugar was added. ${total} The sugar figure alone cannot answer it: the sugar in plain milk and in fruit is naturally there, not added.`.trim();
  }
}

function addedSugarCheck(
  nutrition: NutritionFacts | null,
  ingredientsText: string | null,
  category: "food" | "drink",
  source: SourceRef,
): Check {
  const key: ComponentKey = "addedSugars";
  const label = LABELS[key];
  const unit = nutrition ? perUnit(nutrition) : category === "drink" ? "per 100 ml" : "per 100 g";

  const resolved = resolveAddedSugar(nutrition, ingredientsText);
  const detail = addedSugarDetail(resolved, nutrition, unit);

  if (resolved.state === "unknown") {
    return unknown(key, "Whether sugar was added could not be established", detail, source);
  }

  if (resolved.state === "absent") {
    return {
      key,
      label,
      status: "pass",
      claim: "No added sugar",
      detail,
      evidence: {
        label,
        value:
          resolved.basis === "published-figure"
            ? `0 g ${unit} (published figure)`
            : "none in the published ingredient list",
      },
      source,
    };
  }

  // Present. Only a known quantity can be severe, and only clearly past the mark.
  const t = THRESHOLDS[category].sugars;
  const grams = resolved.grams;
  const severe =
    SEVERE_NUTRIENT_DISQUALIFIES && grams !== null && grams >= t.bad * DISQUALIFIER_MARGIN;

  return {
    key,
    label,
    ...(severe ? { disqualifying: true as const } : {}),
    status: "fail",
    claim: grams !== null ? `Contains added sugar: ${round1(grams)} g ${unit}` : "Contains added sugar",
    detail,
    evidence: {
      label,
      value: grams !== null ? `${round1(grams)} g ${unit}` : `listed as ${resolved.terms[0]}`,
    },
    source,
  };
}

/* -------------------------------------------------------------------------
 * Fibre and protein
 * ----------------------------------------------------------------------- */

function nutrientDensityCheck(
  nutrition: NutritionFacts | null,
  category: "food" | "drink",
  source: SourceRef,
): Check {
  const key: ComponentKey = "nutrientDensity";
  const label = LABELS[key];
  const fibre = nutrition?.fibreG ?? null;
  const protein = nutrition?.proteinG ?? null;

  if (fibre === null && protein === null) {
    return unknown(
      key,
      "Fibre and protein are not published",
      "Neither figure appears in the evidence we could find, so this check could not be made.",
      source,
    );
  }

  const t = THRESHOLDS[category];
  const unit = nutrition ? perUnit(nutrition) : "per 100 g";
  // Either target clears the check on its own: a high-fibre cereal and a
  // high-protein dairy product are both worth the tick, for different reasons.
  const passed =
    (fibre !== null && fibre >= t.fibreTarget) || (protein !== null && protein >= t.proteinTarget);

  const measured = [
    fibre !== null ? `${round1(fibre)} g fibre` : "fibre unknown",
    protein !== null ? `${round1(protein)} g protein` : "protein unknown",
  ].join(", ");

  return {
    key,
    label,
    status: passed ? "pass" : "fail",
    claim: passed ? "A useful source of fibre or protein" : "Little fibre or protein",
    detail: passed
      ? `${measured} ${unit}. A useful amount is ${t.fibreTarget} g of fibre or ${t.proteinTarget} g of protein.`
      : `${measured} ${unit}. A useful amount is ${t.fibreTarget} g of fibre or ${t.proteinTarget} g of protein; this has neither.`,
    evidence: { label, value: `${measured} ${unit}` },
    source,
  };
}

/* -------------------------------------------------------------------------
 * Processing
 * ----------------------------------------------------------------------- */

const NOVA_NAMES: Record<number, string> = {
  1: "unprocessed or minimally processed",
  2: "a processed culinary ingredient",
  3: "processed",
  4: "ultra-processed",
};

function processingCheck(novaGroup: number | null, source: SourceRef): Check {
  const key: ComponentKey = "processing";
  const label = LABELS[key];

  if (novaGroup === null || !(novaGroup in NOVA_NAMES)) {
    return unknown(
      key,
      "How processed this is could not be established",
      "No processing classification was published for this product.",
      source,
    );
  }

  const passed = novaGroup <= NOVA_PASS_MAX;

  return {
    key,
    label,
    status: passed ? "pass" : "fail",
    claim: passed
      ? novaGroup === 1
        ? "Unprocessed or minimally processed"
        : "A processed culinary ingredient, not a formulation"
      : novaGroup >= 4
        ? "Ultra-processed"
        : "Processed",
    detail: passed
      ? `Made from whole foods or simple ingredients rather than industrial formulation.`
      : `Industrially formulated rather than made from whole foods. Published classification: ${NOVA_NAMES[novaGroup]}.`,
    evidence: { label, value: NOVA_NAMES[novaGroup] },
    source,
  };
}

/* -------------------------------------------------------------------------
 * Additives
 * ----------------------------------------------------------------------- */

function additivesCheck(
  additives: string[],
  ingredientsText: string | null,
  category: ProductCategory,
  source: SourceRef,
): Check {
  const key: ComponentKey = "additives";
  const label = LABELS[key];

  // No additive list AND no ingredient list means we simply do not know. An
  // ingredient list with no additives flagged is genuine evidence of none.
  if (additives.length === 0 && !ingredientsText) {
    return unknown(
      key,
      "The additive list could not be checked",
      "We found no published ingredient list, so additives could not be counted.",
      source,
    );
  }

  // The additive taxonomy we rely on is the E-number list used for food and drink.
  // It does not cover cosmetics, so an empty result there means "our list does not
  // apply", not "this product contains no additives". Reporting that as a pass
  // would be a tick we did not earn.
  if (additives.length === 0 && category === "cosmetic") {
    return unknown(
      key,
      "We could not check the additives",
      "The additive list we use covers food and drink, not cosmetics, so we cannot make this check for this product. Its full ingredient list is shown below.",
      source,
      "not assessable",
    );
  }

  const count = additives.length;
  const passed = count <= ADDITIVE_PASS_MAX;
  const measured = count === 0 ? "none listed" : `${count} (${additives.slice(0, 6).join(", ")})`;

  return {
    key,
    label,
    status: passed ? "pass" : "fail",
    claim: passed
      ? "No additives listed"
      : count === 1
        ? "Contains one additive"
        : `Contains ${count} additives`,
    detail: passed
      ? "The published ingredient list contains no additives."
      : `A long additive list is a sign of heavy processing. It is not a safety warning: every additive here is permitted for sale. They are: ${additives.join(", ")}.`,
    evidence: { label, value: measured },
    source,
  };
}

/* -------------------------------------------------------------------------
 * UAE certification
 * ----------------------------------------------------------------------- */

function certificationCheck(
  certifications: CertificationEvidence[],
  fallbackSource: SourceRef,
): Check {
  const key: ComponentKey = "certification";
  const label = LABELS[key];

  // Demo scaffolding is not evidence. Every shipped SAMPLE- certificate is
  // SYNTHETIC, and a synthetic certificate must never produce a tick, a cross, or
  // any statement that a real body certified a real product. Filtering here rather
  // than at the call site means no future caller can forget.
  const real = certifications.filter((c) => isVerifiableSource(c.sourceKind));
  const discarded = certifications.length - real.length;

  if (real.length === 0) {
    // Absence from our copy of the register is not evidence of absence from the
    // register. Unknown, not failed — and unknown whether or not demo rows exist.
    return unknown(
      key,
      "We could not check UAE certification",
      discarded > 0
        ? "We hold no verified certification data for this product yet. This product does carry example rows in our demo data, which we do not treat as evidence and do not show you as one."
        : "No certificate for this product appears in the conformity data we hold. That does not mean it is uncertified — only that we cannot confirm it.",
      fallbackSource,
      "not verified",
    );
  }

  const suspended = real.filter((c) => c.status === "suspended");
  const valid = real.filter((c) => c.status === "valid");
  const expired = real.filter((c) => c.status === "expired");
  const source = real[0].source;

  if (suspended.length > 0) {
    const c = suspended[0];
    return {
      key,
      label,
      status: "fail",
      // A suspended certificate is the one finding that overrides everything else
      // in the verdict — see lib/health/verdict.ts.
      disqualifying: true,
      claim: `Its ${c.certificateType} certificate is suspended`,
      detail: `Certificate ${c.certificateNumber} is recorded as suspended. Treat any claim resting on it with caution.`,
      evidence: { label, value: `${c.certificateType} — suspended` },
      source,
    };
  }

  if (valid.length > 0) {
    const accredited = valid.find((c) => c.bodyName);
    const types = valid.map((c) => c.certificateType).join(", ");
    return {
      key,
      label,
      status: "pass",
      claim: accredited
        ? `Certified by an accredited body: ${types}`
        : `Holds a valid ${types} certificate`,
      detail: accredited
        ? `Certificate ${accredited.certificateNumber} was issued by ${accredited.bodyName}, a body on the UAE accreditation register. A certificate confirms the product meets that standard; it is not a statement that the product is nutritionally better.`
        : `Certificate ${valid[0].certificateNumber} is recorded as valid, though our data does not name the body that issued it.`,
      evidence: { label, value: accredited ? `${types}, accredited body` : types },
      source,
    };
  }

  const c = expired[0];
  return {
    key,
    label,
    status: "fail",
    claim: `Its ${c.certificateType} certificate has lapsed`,
    detail: `Certificate ${c.certificateNumber} is recorded as expired. A lapsed certificate is not a finding against the product; it means the assurance is out of date.`,
    evidence: { label, value: `${c.certificateType} — expired` },
    source,
  };
}

/* -------------------------------------------------------------------------
 * Ingredient transparency
 * ----------------------------------------------------------------------- */

function transparencyCheck(ingredientsText: string | null, source: SourceRef): Check {
  const key: ComponentKey = "transparency";
  const label = LABELS[key];
  // Absence here IS observable, which is why this check never returns unknown:
  // we looked, and there is no list.
  const present = Boolean(ingredientsText && ingredientsText.trim().length > 10);

  return {
    key,
    label,
    status: present ? "pass" : "fail",
    claim: present ? "Publishes a full ingredient list" : "No ingredient list is published",
    detail: present
      ? "A complete ingredient list is published, which is what makes the rest of these checks possible."
      : "Without a published ingredient list we cannot check additives or allergens for you, and neither can you.",
    evidence: { label, value: present ? "published" : "not found" },
    source,
  };
}

/* -------------------------------------------------------------------------
 * Assembly
 * ----------------------------------------------------------------------- */

/** Builds the checklist for a product, in the rubric's display order. */
export function evaluateChecks(input: EvidenceInput): Check[] {
  const nutritionCategory: "food" | "drink" = input.category === "drink" ? "drink" : "food";
  const src = input.evidenceSource;

  const build: Record<ComponentKey, () => Check> = {
    addedSugars: () => addedSugarCheck(input.nutrition, input.ingredientsText, nutritionCategory, src),
    saturatedFat: () =>
      nutrientCheck(
        "saturatedFat",
        input.nutrition?.saturatedFatG ?? null,
        nutritionCategory,
        input.nutrition,
        src,
      ),
    salt: () =>
      nutrientCheck("salt", input.nutrition?.saltG ?? null, nutritionCategory, input.nutrition, src),
    nutrientDensity: () => nutrientDensityCheck(input.nutrition, nutritionCategory, src),
    processing: () => processingCheck(input.novaGroup, src),
    additives: () => additivesCheck(input.additives, input.ingredientsText, input.category, src),
    certification: () => certificationCheck(input.certifications, src),
    transparency: () => transparencyCheck(input.ingredientsText, src),
  };

  return DIMENSIONS[input.category].map((key) => build[key]());
}

/* -------------------------------------------------------------------------
 * Data-quality flag (not a check — it is a caveat about the record)
 * ----------------------------------------------------------------------- */

/**
 * Does the declared energy agree with the macronutrients?
 *
 * 4 kcal/g carbohydrate, 9 kcal/g fat, 4 kcal/g protein — the Atwater factors. The
 * check needs TOTAL carbohydrate, not sugars: sugars are a subset, so reconciling
 * against them alone would flag every breakfast cereal on the shelf. Where total
 * carbohydrate is missing, we do not guess; we simply do not run the check.
 *
 * A flagged panel is reported as an unknown, never as a failed check. The fault
 * lies in the record, not in the product, and the user should be told which.
 */
export const ENERGY_GAP_KCAL = 40;
export const ENERGY_GAP_RATIO = 2;

export function unexplainedEnergy(
  nutrition: NutritionFacts | null,
): { declared: number; explained: number } | null {
  if (!nutrition) return null;
  const { energyKcal, carbohydratesG, fatG, proteinG } = nutrition;
  if (energyKcal === null || energyKcal <= 0) return null;
  // Without total carbohydrate there is nothing to reconcile against.
  if (carbohydratesG === null) return null;

  const explained = Math.round(carbohydratesG * 4 + (fatG ?? 0) * 9 + (proteinG ?? 0) * 4);
  const gap = energyKcal - explained;
  if (gap < ENERGY_GAP_KCAL) return null;
  // A large gap on a small base is noise; a large gap that doubles the figure is not.
  if (explained > 0 && energyKcal / explained < ENERGY_GAP_RATIO) return null;

  return { declared: Math.round(energyKcal), explained };
}

/** Convenience for callers that only care about the three-way split. */
export function countByStatus(checks: Check[]): Record<CheckStatus, number> {
  return {
    pass: checks.filter((c) => c.status === "pass").length,
    fail: checks.filter((c) => c.status === "fail").length,
    unknown: checks.filter((c) => c.status === "unknown").length,
  };
}
