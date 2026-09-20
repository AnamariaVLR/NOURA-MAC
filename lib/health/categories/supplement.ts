/**
 * RUBRIC.md §4.10 — Supplements.
 *
 * The same shape as cosmetics and for a sharper reason: Noura has NO sourced
 * basis at all for evaluating a supplement's composition.
 *
 * S9 §1.2.11 puts foods for special dietary uses outside the nutrition-labelling
 * standard's scope, so the per-100 g lines of §3 do not apply. The thing that
 * would replace them — EFSA's tolerable upper intake levels — was not retrieved
 * (C4.10.2). Shipping a supplement verdict on this evidence base would be the
 * least defensible thing in this specification, so C4.10.4 does not.
 */

import type { CategoryRule } from "./types";

export const supplement: CategoryRule = {
  key: "supplement",
  label: "Supplements",
  section: "RUBRIC.md §4.10",

  // C4.10.4 + D12.
  supported: false,
  unsupportedMessage:
    "Noura cannot assess supplements yet. Judging one means comparing its doses against upper " +
    "intake levels, and Noura does not hold those. The per-100 g lines used for food do not " +
    "apply to a supplement, and using them anyway would produce a confident answer to a " +
    "question that was never asked.",

  subcategories: [{ key: "supplement", label: "Supplements", basis: "solid" }],
  defaultSubcategory: "supplement",

  checks: ["transparency", "certification"],

  lines: () => ({}),
  better: [],

  notes: [
    {
      rule: "C4.10.2",
      text:
        "Whether a supplement's doses are safe is decided against tolerable upper intake levels. " +
        "Noura has not retrieved those, so it has not checked this product against them.",
      source: "not retrieved; recorded at SOURCES §3",
    },
  ],
};
