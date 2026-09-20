/**
 * Every prompt the health stage sends, in one file, with the reason for each rule.
 *
 * ── The one thing to understand before editing ──────────────────────────────
 * The model does NOT decide anything. lib/health/evaluate.ts produces the checklist
 * — every dimension as pass, fail or unknown — the verdict, and a plain fallback
 * sentence for each check. The model is handed that finished analysis and asked
 * only to rewrite the wording. If its output fails Zod validation, we ship the
 * deterministic sentences and the user never sees a degraded page.
 *
 * Why this split:
 *   - A verdict a model invents cannot be reproduced, audited, or unit-tested, and
 *     two users photographing the same jar would get different answers.
 *   - Prose is the one part of this pipeline where a model is genuinely better
 *     than a template, and the one part where being wrong is cheap and visible.
 */

import type { Evaluation } from "../health/evaluate";
import type { ProductCategory } from "../schemas";

/* ---------------------------------------------------------------------------
 * Stage 2 — identification
 * ------------------------------------------------------------------------- */

export const IDENTIFY_SYSTEM = [
  // Scope. The app is a UAE shopping wedge, not a general visual assistant.
  "You identify consumer packaged products from a photograph: food, drink, supplements and cosmetics.",
  // Rule 1 — read, do not infer. The single biggest failure mode in vision
  // identification is confidently naming a similar product from memory.
  "Report only what is legible in the image. If the brand is not readable, say the brand is unknown rather than guessing from packaging style.",
  // Rule 2 — barcodes are checkable, so they are worth more than any other cue.
  "If a barcode is legible, transcribe its digits exactly. Never reconstruct a barcode you cannot fully read; a wrong barcode silently attaches the wrong product's nutrition data.",
  // Rule 3 — calibrated confidence, because the UI shows it to the user and a
  // low-confidence identification is a useful answer, not a failure.
  "Set confidence honestly: 0.9+ only when brand and product name are both clearly legible; below 0.5 when you are largely inferring from shape or colour.",
  // Rule 4 — the category drives which rubric the checker applies, and the
  // categories are now specific (RUBRIC.md §4), so a wrong one applies the wrong
  // lines. The instruction is written to make "food" the honest fallback rather
  // than a lazy default.
  "Choose the most specific category that fits what the product IS: fats_oils for oils, butter, margarine and spreads; milk for dairy milk and for almond, oat, rice and soy drinks; yogurt for yogurt, labneh, laban, ayran and doogh; eggs; bread for bread, crispbread and rusks; cereal for breakfast cereal, muesli and granola; snacks for crisps, savoury biscuits, nuts and pretzels; drink for water, juice, soft drinks and iced tea; cosmetic; supplement. Use food only when none of the others fits — cheese, deli, ready meals.",
  // Rule 5 — the subcategory decides whether the product is judged per 100 g or
  // per 100 ml, so it must be read off the pack rather than inferred.
  "Set subcategory only when the pack makes it plain: olive_oil or other_fats_oils; dairy_milk or plant_milk; spoonable_yogurt or drinking_yogurt. Null is a correct answer and is better than a guess.",
  "Use the record_product tool exactly once. Do not write any prose.",
].join("\n");

export const IDENTIFY_USER =
  "Identify the product in this image. Transcribe the text you can actually read on the pack.";

/** The tool schema is the contract; Zod re-checks the result before it is used. */
export const IDENTIFY_TOOL = {
  name: "record_product",
  description: "Record the product visible in the image.",
  input_schema: {
    type: "object" as const,
    properties: {
      name: { type: "string", description: "Product name as printed on the pack." },
      brand: { type: ["string", "null"], description: "Brand, or null if not legible." },
      barcode: {
        type: ["string", "null"],
        description: "8-14 digits, exactly as printed. Null unless fully legible.",
      },
      category: {
        type: "string",
        enum: [
          "fats_oils",
          "milk",
          "yogurt",
          "eggs",
          "bread",
          "cereal",
          "snacks",
          "drink",
          "food",
          "cosmetic",
          "supplement",
        ],
      },
      subcategory: {
        type: ["string", "null"],
        enum: [
          "olive_oil",
          "other_fats_oils",
          "dairy_milk",
          "plant_milk",
          "spoonable_yogurt",
          "drinking_yogurt",
          null,
        ],
        description: "Null unless the pack makes it plain.",
      },
      sizeLabel: { type: ["string", "null"], description: 'Pack size, e.g. "500 ml". Null if absent.' },
      confidence: { type: "number", description: "0 to 1." },
      visibleText: {
        type: ["string", "null"],
        description: "The text you could actually read on the pack.",
      },
    },
    required: [
      "name",
      "brand",
      "barcode",
      "category",
      "subcategory",
      "sizeLabel",
      "confidence",
      "visibleText",
    ],
  },
};

/* ---------------------------------------------------------------------------
 * Stage 4 — checklist wording
 * ------------------------------------------------------------------------- */

export const HEALTH_SYSTEM = [
  "You write the plain-language wording for a product checklist that has already been decided.",
  "",
  // Rule 1 — the model may not move a verdict. Stated first because it is the rule
  // a helpful model is most likely to violate.
  "You do not decide, adjust, endorse or question whether a check passed or failed. The statuses are not yours, and neither is the overall verdict.",
  // Rule 2 — one rewrite per check, no invention. Keys tie prose to evidence.
  "Rewrite each check you are given, reusing its `key` verbatim. Never introduce a check that is not in the list, and never drop one.",
  // Rule 3 — the wording must agree with the status it is attached to. A failed
  // check written in warm language is worse than no rewrite at all.
  "A failed check must read as a failure and a passed check as a pass. Never soften a failure or hedge a pass.",
  // Rule 4 — no facts from memory. This is the fabrication guard.
  "Use only the measured values supplied. Do not add nutrition figures, ingredients, brand history or health research from your own knowledge, even if you are confident.",
  // Rule 5 — unknown stays unknown. Do not let fluent prose paper over a gap.
  "Where a value is unknown, say plainly that it is unknown. Never write around it, and never imply a value we do not have.",
  // Rule 6 — no medical advice. A diagnosis or a dosage instruction would change
  // what this app legally is.
  "Never give medical, dietary or treatment advice, never address a medical condition, and never tell the reader what they should eat.",
  // Rule 7 — register. The reader is a curious non-specialist in the UAE.
  "Write for an intelligent reader who is not a nutritionist. Short sentences, no jargon, no marketing tone, no exclamation marks.",
  // Rule 8 — no hedging filler; the user is looking at a phone in an aisle.
  "Be concrete and brief: `claim` is one sentence under 120 characters, `detail` is one or two sentences under 320 characters.",
  "Use the write_checks tool exactly once.",
].join("\n");

export const HEALTH_TOOL = {
  name: "write_checks",
  description: "Rewrite the supplied checklist in plain language. Statuses are fixed.",
  input_schema: {
    type: "object" as const,
    properties: {
      checks: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: {
          type: "object",
          properties: {
            key: { type: "string", description: "The check key, copied exactly." },
            claim: { type: "string", description: "One sentence, under 120 characters." },
            detail: { type: "string", description: "One or two sentences, under 320 characters." },
          },
          required: ["key", "claim", "detail"],
        },
      },
    },
    required: ["checks"],
  },
};

export function healthUserPrompt(args: {
  productName: string;
  brand: string | null;
  category: ProductCategory;
  evaluation: Evaluation;
}): string {
  const { productName, brand, category, evaluation } = args;

  const checks = evaluation.checks
    .map((c) =>
      [
        `- key: ${c.key}`,
        `  status: ${c.status.toUpperCase()}`,
        `  measured: ${c.evidence.label} = ${c.evidence.value}`,
        `  our plain wording: ${c.claim} — ${c.detail}`,
      ].join("\n"),
    )
    .join("\n");

  const unknowns = evaluation.unknowns.length
    ? evaluation.unknowns.map((u) => `- ${u}`).join("\n")
    : "- (none)";

  return [
    `Product: ${productName}${brand ? ` by ${brand}` : ""} (${category})`,
    `Judged by ${evaluation.section}, as ${evaluation.subcategory.label}.`,
    `Verdict already decided: ${evaluation.verdict.verdict.replace(/_/g, " ").toUpperCase()}.`,
    `${evaluation.verdict.counts.passed} of ${evaluation.verdict.counts.known} checks passed; ` +
      `${evaluation.verdict.counts.unknown} could not be made.`,
    "",
    "Checks to rewrite, one each, same order, same keys, same statuses:",
    checks,
    "",
    "Known to be unverified:",
    unknowns,
    "",
    "Rewrite each check. Keep every number exactly as given, and keep the wording",
    "consistent with the status it carries.",
  ].join("\n");
}

/**
 * The keys we will accept back from the model. Anything else is treated as
 * hallucinated and the whole response is discarded in favour of our own text.
 */
export function allowedCheckKeys(evaluation: Evaluation): string[] {
  return evaluation.checks.map((c) => c.key);
}
