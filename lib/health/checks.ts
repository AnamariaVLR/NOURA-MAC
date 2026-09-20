/**
 * Turns evidence into a checklist — RUBRIC.md §3 and §4.
 *
 * One function per rubric dimension. Each returns a `Check` whose `status` is
 * "pass", "fail" or "unknown", and each names the RUBRIC.md rule it implements
 * and that rule's tag. Pure, synchronous, no network, no model — so the same
 * evidence always produces the same checklist and every branch is testable.
 *
 * THE INVARIANT THIS FILE EXISTS TO PROTECT (rule D6): a check is "pass" only
 * when a value was actually observed. Every function here reaches its "unknown"
 * branch before it can reach its "pass" branch, so a missing value cannot fall
 * through into a tick. tests/unit/rubric-unknown-sweep.test.ts asserts it over
 * every category and every dimension.
 *
 * WHICH lines a check uses is not decided here. It comes from the product's
 * category rule in lib/health/categories/, which is one file per §4 section. No
 * threshold is written in this file.
 */

import { isVerifiableSource } from "../schemas";
import type {
  Check,
  CheckStatus,
  Note,
  NutritionFacts,
  ProductCategory,
  SourceRef,
} from "../schemas";
import { hasIngredientList, resolveAddedSugar, type AddedSugarVerdict } from "./added-sugar";
import { assessAdditives, type AdditiveAssessment } from "./additives";
import { basisFor, resolveSubcategory, ruleFor } from "./categories";
import type { Basis, CategoryRule, CheckKey, NutrientLine } from "./categories/types";
import { fibrePer100Kcal, proteinEnergyShare, resolveEnergyKcal } from "./energy";
import { FIBRE, LABELS, PROTEIN, type ComponentKey } from "./rubric";
import { isSevere } from "./tolerance";

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
  /** RUBRIC.md §4 C4.0.1. Null resolves to the category's default. */
  subcategory?: string | null;
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

/** U9.1 — per 100 g for solids, per 100 ml for liquids. */
function unitFor(basis: Basis): string {
  return basis === "liquid" ? "per 100 ml" : "per 100 g";
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
 * Quantity checks: saturated fat, salt, total sugar
 *
 * RUBRIC.md §3 U2, U3 and the per-category total-sugar lines of §4.
 *
 * One function, because the shape of the rule is identical and only the line
 * differs. The line arrives from the category rule and carries its own RUBRIC
 * identifier, so the sentence a reader sees can name where the number came from.
 * ----------------------------------------------------------------------- */

function quantityCheck(
  key: "saturatedFat" | "salt" | "totalSugars",
  value: number | null,
  line: NutrientLine,
  basis: Basis,
  source: SourceRef,
): Check {
  const label = LABELS[key];

  // D6 — unknown first. There is no path from a null value to a pass. D7 and D8
  // then decide what an unknown does to the arithmetic, in verdict.ts.
  if (value === null) {
    return unknown(
      key,
      `${label} content is not published`,
      `No ${label.toLowerCase()} figure appears in the evidence we could find, so this check could not be made.`,
      source,
    );
  }

  const unit = unitFor(basis);
  const measured = `${round1(value)} g ${unit}`;

  // Rule 3 of the rubric header: the pass line is the "low" mark where the
  // category has one. Where it has only a single sourced line — C4.1.1 fats and
  // oils, C4.4.2 eggs — that line is the pass line, and D3 applies the declared
  // value as given either way.
  const passLine = line.low ?? line.high;
  const passed = value <= passLine;
  const high = value > line.high;

  // V2.2 — C0's two-strength rule lives in `disqualifyAbove`. An EMRO marketing
  // line fails; the general-population line disqualifies. The §2.2 tolerance is
  // applied so a product is never condemned for a difference smaller than the law
  // permits between a label and a laboratory.
  const severe = isSevere(value, line.tolerance, line.disqualifyAbove ?? line.high);

  const lowText = line.low === undefined ? null : `${line.low} g`;

  return {
    key,
    label,
    ...(severe ? { disqualifying: true as const } : {}),
    status: passed ? "pass" : "fail",
    claim: passed
      ? `Low ${label.toLowerCase()}`
      : high
        ? `High ${label.toLowerCase()}`
        : `Some ${label.toLowerCase()}`,
    detail: passed
      ? `${measured}. Low is ${lowText ?? `${line.high} g`} or less.`
      : high
        ? `${measured}. That counts as high, which starts above ${line.high} g.`
        : `${measured}. More than the ${lowText} that counts as low, but not yet high, which starts above ${line.high} g.`,
    evidence: { label, value: measured },
    source,
  };
}

/* -------------------------------------------------------------------------
 * U1 — Added sugar
 *
 * The one check decided on PRESENCE rather than quantity (U1.7). "No added
 * sugar" is a claim about what went into the product; the number on the panel is
 * a measurement of what came out of it, lactose and fructose included (U1.9).
 * The resolution of the evidence lives in ./added-sugar.ts and implements U1.8;
 * this function only turns a conclusion into a sentence.
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
  line: NutrientLine,
  basis: Basis,
  source: SourceRef,
): Check {
  const key: ComponentKey = "addedSugars";
  const label = LABELS[key];
  const unit = unitFor(basis);

  const resolved = resolveAddedSugar(nutrition, ingredientsText);
  const detail = addedSugarDetail(resolved, nutrition, unit);

  // U1.8 clauses 4 and 5 — a conflict and an absence both produce UNKNOWN. The
  // conflict branch is D11: two credible sources disagreeing is not a tie to be
  // broken, it is a question Noura declines to answer.
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

  // Present. U1.7: the check has already failed on presence. Only a KNOWN
  // quantity can be severe — Noura does not apply its harshest consequence to a
  // quantity it does not know (§7.1, DECISIONS §32).
  const severe = isSevere(resolved.grams, line.tolerance, line.disqualifyAbove ?? line.high);
  const grams = resolved.grams;

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
 * U4 — Fibre and protein
 *
 * U4.6: either target clears the check on its own. U4.3 expresses protein as a
 * SHARE OF ENERGY, not an absolute mass, which is what S12 actually defines —
 * the shipped 8 g/100 g had no source. Where energy is not published it is
 * derived from the macronutrients by the Codex factors (U4.5).
 * ----------------------------------------------------------------------- */

function nutrientDensityCheck(
  nutrition: NutritionFacts | null,
  basis: Basis,
  source: SourceRef,
): Check {
  const key: ComponentKey = "nutrientDensity";
  const label = LABELS[key];

  const fibre = nutrition?.fibreG ?? null;
  const fibrePerKcal = fibrePer100Kcal(nutrition);
  const proteinShare = proteinEnergyShare(nutrition);

  // D6 — unknown when NEITHER half resolves. Fibre resolves on a published
  // figure alone; protein needs an energy figure it can be a share of, so a
  // protein mass with no resolvable energy is not evidence of anything.
  const fibreResolved = fibre !== null;
  const proteinResolved = proteinShare !== null;
  if (!fibreResolved && !proteinResolved) {
    return unknown(
      key,
      "Fibre and protein are not published",
      "Neither a fibre figure nor enough of the panel to express protein as a share of energy " +
        "appears in the evidence we could find, so this check could not be made.",
      source,
    );
  }

  // U4.1 — HIGH FIBRE on either basis S12 allows.
  const highFibre =
    (fibre !== null && fibre >= FIBRE.highPer100g) ||
    (fibrePerKcal !== null && fibrePerKcal >= FIBRE.highPer100Kcal);
  // U4.3 — SOURCE OF PROTEIN.
  const sourceOfProtein = proteinShare !== null && proteinShare >= PROTEIN.sourceOfEnergyShare;
  const passed = highFibre || sourceOfProtein;

  const unit = unitFor(basis);
  const measured = [
    fibre !== null ? `${round1(fibre)} g fibre ${unit}` : "fibre unknown",
    proteinShare !== null
      ? `${Math.round(proteinShare * 100)}% of energy from protein`
      : "protein share unknown",
  ].join(", ");

  const target =
    `A useful amount is ${FIBRE.highPer100g} g of fibre per 100 g, or ` +
    `${Math.round(PROTEIN.sourceOfEnergyShare * 100)}% of the energy coming from protein.`;

  return {
    key,
    label,
    status: passed ? "pass" : "fail",
    claim: passed
      ? highFibre && sourceOfProtein
        ? "A useful source of both fibre and protein"
        : highFibre
          ? "A useful source of fibre"
          : "A useful source of protein"
      : "Little fibre or protein",
    detail: passed ? `${measured}. ${target}` : `${measured}. ${target} This has neither.`,
    evidence: { label, value: measured },
    source,
  };
}

/* -------------------------------------------------------------------------
 * U6 / §5 — Additives
 *
 * A4: the count is a NOTE, not a failure. No retrieved source supports a
 * zero-additive line, and S15 is explicit that authorisation follows a safety
 * assessment. A5: the check fails on, and only on, a flagged additive (§5.4).
 * ----------------------------------------------------------------------- */

function additivesCheck(
  assessment: AdditiveAssessment,
  ingredientsText: string | null,
  source: SourceRef,
): Check {
  const key: ComponentKey = "additives";
  const label = LABELS[key];
  const count = assessment.codes.length;

  // D6 — no additive list AND no ingredient list means we do not know. An
  // ingredient list with no additives flagged is genuine evidence of none.
  if (count === 0 && !hasIngredientList(ingredientsText)) {
    return unknown(
      key,
      "The additive list could not be checked",
      "We found no published ingredient list, so additives could not be checked.",
      source,
    );
  }

  const listed = count === 0 ? "none listed" : `${count} (${assessment.codes.join(", ")})`;

  if (assessment.failing.length > 0) {
    const first = assessment.failing[0].flag;
    const names = assessment.failing.map((f) => f.code).join(", ");
    return {
      key,
      label,
      // A6.8 — a flagged failure NEVER disqualifies. A warning label is a
      // labelling duty and a population-exposure finding is about a diet rather
      // than a product; neither justifies Noura's harshest output.
      status: "fail",
      claim:
        assessment.failing.length === 1
          ? `Contains ${first.label}`
          : `Contains ${assessment.failing.length} additives regulators have flagged`,
      // The one-clause reason here; the instrument's verbatim wording goes in the
      // note, which is where a quotation belongs and where there is room for it.
      detail: `${names}: ${first.short}. ${
        count > assessment.failing.length
          ? "The other additives here are permitted and are not a finding against the product."
          : ""
      }`.trim(),
      evidence: { label, value: listed },
      source,
    };
  }

  // A2 — the wording must not read as a clean bill of health. An additive that
  // is not flagged has not been cleared by Noura; it has not been looked at.
  return {
    key,
    label,
    status: "pass",
    claim: count === 0 ? "No additives listed" : `Contains ${count === 1 ? "one additive" : `${count} additives`}, none flagged`,
    detail:
      count === 0
        ? "The published ingredient list contains no additives."
        : "Every additive here is permitted for sale, and none appears on the short list of " +
          "additives a regulator has put a warning on. That list is not a complete screen: an " +
          "additive absent from it has not been cleared, only not checked.",
    evidence: { label, value: listed },
    source,
  };
}

/* -------------------------------------------------------------------------
 * U7 / §6 — UAE certification
 * ----------------------------------------------------------------------- */

function certificationCheck(
  certifications: CertificationEvidence[],
  fallbackSource: SourceRef,
): Check {
  const key: ComponentKey = "certification";
  const label = LABELS[key];

  // C6.1 — provenance. Demo scaffolding is not evidence. Every shipped SAMPLE-
  // certificate is SYNTHETIC, and a synthetic certificate must never produce a
  // tick, a cross, or any statement that a real body certified a real product.
  // Filtering here rather than at the call site means no caller can forget.
  const real = certifications.filter((c) => isVerifiableSource(c.sourceKind));
  const discarded = certifications.length - real.length;

  if (real.length === 0) {
    // D9 / C6.10 — absence from our copy of the register is not evidence of
    // absence from the register. Unknown, not failed.
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
      // C6.4 / V2.1 — a suspended certificate is a live regulator warning about
      // the assurance the product rests on, and overrides the rest of the list.
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
      // C6.5 — stated in the copy, every time.
      detail: accredited
        ? `Certificate ${accredited.certificateNumber} was issued by ${accredited.bodyName}, a body on the UAE accreditation register. A certificate confirms the product meets that standard; it is not a statement that the product is nutritionally better.`
        : `Certificate ${valid[0].certificateNumber} is recorded as valid, though our data does not name the body that issued it. A certificate confirms the product meets that standard; it is not a statement that the product is nutritionally better.`,
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
 * U8 — Ingredient transparency
 *
 * U8.1: absence here IS observable, which is why this check never returns
 * unknown — we looked, and there is no list (D10). U8.2 keeps it off products
 * outside the standard's labelling scope, which is done by the category rule
 * simply not listing the check: a fresh egg has no ingredient list to publish,
 * and the shipped code failed it for that.
 * ----------------------------------------------------------------------- */

function transparencyCheck(
  ingredientsText: string | null,
  category: ProductCategory,
  source: SourceRef,
): Check {
  const key: ComponentKey = "transparency";
  const label = LABELS[key];
  // The same predicate the added-sugar resolution uses, so the two checks cannot
  // disagree about whether a list exists. It rejects placeholders by name rather
  // than by length: "Dates" is a complete ingredient list (DECISIONS §31).
  const present = hasIngredientList(ingredientsText);
  // U8.3 — for cosmetics the duty is an INCI list, which is what S14 Art. 19
  // requires. Noura checks that a list exists, not that the names are INCI.
  const cosmetic = category === "cosmetic";

  return {
    key,
    label,
    status: present ? "pass" : "fail",
    claim: present ? "Publishes a full ingredient list" : "No ingredient list is published",
    detail: present
      ? cosmetic
        ? "A full ingredient list is published, which is what the EU cosmetics regulation requires. Noura has not checked those ingredients against the restricted-substance lists — it does not hold them."
        : "A complete ingredient list is published, which is what makes the rest of these checks possible."
      : "Without a published ingredient list we cannot check additives or allergens for you, and neither can you.",
    evidence: { label, value: present ? "published" : "not found" },
    source,
  };
}

/* -------------------------------------------------------------------------
 * Notes — RUBRIC.md §3 U5, §5 A4, and the per-category notes of §4
 *
 * Shown to the reader, counted in nothing.
 * ----------------------------------------------------------------------- */

const NOVA_NAMES: Record<number, string> = {
  1: "unprocessed or minimally processed",
  2: "a processed culinary ingredient",
  3: "processed",
  4: "ultra-processed",
};

/**
 * U5.1 — POLICY. The processing classification is a NOTE, not a check, and U5.2
 * requires the note to say plainly that it comes from the research literature
 * rather than from a regulator.
 *
 * S8 is tier 3 and under H2 a tier-3 source may not set a threshold; no retrieved
 * tier-1 or tier-2 source uses NOVA. Demoting it also removes the processing
 * double-count DECISIONS §5 flags, since the additive note measures the same
 * thing from the ingredient side. §9 Q10 asks whether to overturn this.
 */
export function processingNote(novaGroup: number | null): Note | null {
  if (novaGroup === null || !(novaGroup in NOVA_NAMES)) return null;
  return {
    rule: "U5.1",
    label: "Level of processing",
    text:
      `Researchers classify this as ${NOVA_NAMES[novaGroup]}, based on whether the ingredient ` +
      "list contains substances never used in a kitchen. That is a classification from the " +
      "research literature rather than a regulator's standard, so Noura shows it and does not " +
      "count it for or against the product.",
    source: "S8 · tier 3",
  };
}

/** A4 / A3.1 — the additive count and the sweetener list, both notes. */
export function additiveNotes(assessment: AdditiveAssessment, basis: Basis): Note[] {
  const notes: Note[] = [];

  if (assessment.codes.length > 0) {
    notes.push({
      rule: "A4",
      label: "Additives listed",
      text:
        `${assessment.codes.length} additive${assessment.codes.length === 1 ? "" : "s"}: ` +
        `${assessment.codes.join(", ")}. A long additive list is a sign of heavy processing. It ` +
        "is not a safety warning: every additive here is permitted for sale.",
      source: "S15 · tier 1",
    });
  }

  // Every flag is explained in full here, quoting the instrument, whether it
  // failed the check or not. A reader who wants to know why should not have to
  // take the one-clause version on trust.
  for (const { code, flag } of assessment.failing) {
    notes.push({
      rule: flag.rule,
      label: "Why this additive is flagged",
      text: `${code} is ${flag.label}. ${flag.basis}`,
      source: flag.source,
    });
  }

  for (const { code, flag } of assessment.flaggedNotes) {
    notes.push({
      rule: flag.rule,
      label: "Worth knowing",
      text: `${code} is ${flag.label}. ${flag.basis} Noura does not fail the product on it, because ${flag.unmeasurable}.`,
      source: flag.source,
    });
  }

  if (assessment.sweeteners.length > 0) {
    notes.push({
      rule: "A3.1",
      label: "Non-sugar sweeteners",
      text:
        `Sweetened with ${assessment.sweeteners.join(", ")}. ` +
        (basis === "liquid"
          ? "For drinks this is reported prominently and is not counted against the product: the " +
            "lines that set beverages at zero sweeteners were drawn for marketing to children, " +
            "and no source Noura holds sets a general-population limit."
          : "Reported, not counted against the product."),
      source: "S20-S22 · tier 1",
    });
  }

  return notes;
}

/* -------------------------------------------------------------------------
 * Assembly
 * ----------------------------------------------------------------------- */

/** Builds the checklist for a product, in its category rule's display order. */
export function evaluateChecks(input: EvidenceInput): Check[] {
  const rule = ruleFor(input.category);
  const basis = basisFor(input.category, input.subcategory ?? null);
  const lines = rule.lines(basis);
  const src = input.evidenceSource;
  const assessment = assessAdditives(input.additives);

  // A line the category declares but a check needs and does not have is a
  // programming error, not a product fact; it would silently become UNKNOWN.
  // tests/unit/rubric-s4-categories.test.ts asserts every declared check has one.
  const build: Record<CheckKey, () => Check> = {
    addedSugars: () =>
      addedSugarCheck(input.nutrition, input.ingredientsText, lines.addedSugars!, basis, src),
    totalSugars: () =>
      quantityCheck("totalSugars", input.nutrition?.sugarsG ?? null, lines.totalSugars!, basis, src),
    saturatedFat: () =>
      quantityCheck(
        "saturatedFat",
        input.nutrition?.saturatedFatG ?? null,
        lines.saturatedFat!,
        basis,
        src,
      ),
    salt: () => quantityCheck("salt", input.nutrition?.saltG ?? null, lines.salt!, basis, src),
    nutrientDensity: () => nutrientDensityCheck(input.nutrition, basis, src),
    additives: () => additivesCheck(assessment, input.ingredientsText, src),
    certification: () => certificationCheck(input.certifications, src),
    transparency: () => transparencyCheck(input.ingredientsText, input.category, src),
  };

  const checks = rule.checks.map((key) => build[key]());

  // A class disqualifier (today: C4.8.7 energy drinks) is not a nutrient crossing
  // a line, so it has no threshold and no "low" mark. It is appended as its own
  // failed check so that it appears on the page as a reason, rather than moving
  // the verdict from somewhere the reader cannot see.
  const classFailure = rule.classDisqualifier?.({ ingredientsText: input.ingredientsText });
  if (classFailure) {
    checks.push({
      key: "classification",
      label: "Product type",
      status: "fail",
      disqualifying: true,
      claim: classFailure.claim,
      detail: classFailure.detail,
      evidence: { label: "Product type", value: "energy drink" },
      source: src,
    });
  }

  return checks;
}

/** Everything shown to the reader that is not a check. */
export function collectNotes(input: EvidenceInput): Note[] {
  const rule: CategoryRule = ruleFor(input.category);
  const basis = basisFor(input.category, input.subcategory ?? null);
  const assessment = assessAdditives(input.additives);

  const categoryNotes: Note[] = rule.notes.map((n) => ({
    rule: n.rule,
    label: rule.label,
    text: n.text,
    source: n.source,
  }));

  const processing = processingNote(input.novaGroup);

  return [
    ...categoryNotes,
    ...additiveNotes(assessment, basis),
    ...(processing ? [processing] : []),
  ];
}

/** The subcategory a product was judged in, for display and for ranking. */
export function subcategoryFor(input: EvidenceInput) {
  return resolveSubcategory(input.category, input.subcategory ?? null);
}

/* -------------------------------------------------------------------------
 * Data-quality flag (not a check — it is a caveat about the record)
 * ----------------------------------------------------------------------- */

/**
 * Does the declared energy agree with the macronutrients?
 *
 * The Codex factors again (S6 §3.3.1, the same ones U4.5 uses to derive energy).
 * The check needs TOTAL carbohydrate, not sugars: sugars are a subset, so
 * reconciling against them alone would flag every breakfast cereal on the shelf.
 * Where total carbohydrate is missing, we do not guess; we do not run the check.
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
  const { energyKcal, carbohydratesG } = nutrition;
  if (energyKcal === null || energyKcal <= 0) return null;
  // Without total carbohydrate there is nothing to reconcile against.
  if (carbohydratesG === null) return null;

  const withoutDeclared = resolveEnergyKcal({ ...nutrition, energyKcal: null });
  const explained = Math.round(
    withoutDeclared?.kcal ??
      carbohydratesG * 4 + (nutrition.fatG ?? 0) * 9 + (nutrition.proteinG ?? 0) * 4,
  );
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
