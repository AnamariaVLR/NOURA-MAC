/**
 * The verdict: one of four sentences, derived from the checklist.
 *
 * ── The rules, in the order they are applied ────────────────────────────────
 *
 *  V0. Category not supported (D12), or no applicable
 *      or resolvable checks at all                  → COULD NOT VERIFY
 *  V1. Coverage below MIN_COVERAGE (50%)           → COULD NOT VERIFY
 *  V2. Any disqualifying check failed              → NOT RECOMMENDED
 *  V3. Pass rate ≥ 80% AND at least 3 known checks → VERIFIED — GOOD CHOICE
 *  V4. Pass rate ≥ ACCEPTABLE_PASS_RATE (50%)      → VERIFIED — ACCEPTABLE
 *  V5. Otherwise                                   → NOT RECOMMENDED
 *
 * Two definitions do the real work:
 *
 *   coverage  = known checks / applicable checks
 *   pass rate = passed checks / KNOWN checks
 *
 * D7: unknown checks are excluded from the pass-rate denominator, so a product can
 * neither gain nor lose from evidence that does not exist. But they do count
 * against coverage (D8), so a product cannot reach a verdict at all by publishing
 * almost nothing and happening to pass the one check we could make. Rule 1 exists
 * precisely to stop "we know two things, both fine" from reading as "good choice".
 *
 * Rule V2 covers the two overrides, both marked `disqualifying` on the check
 * itself. A suspended certificate is a live regulator warning about the assurance
 * the product rests on. A nutrient clearly above the rubric's high mark is the
 * other: counting checks equally would otherwise let salted butter offset 55 g of
 * saturated fat with ticks for "no additives" and "publishes ingredients". Neither
 * is a bad score to be averaged against good ones.
 *
 * Rule V3 carries a second condition (D5) — at least three checks actually made — so that
 * our strongest statement always rests on a minimum of evidence, not just a high
 * ratio over one or two dimensions.
 *
 * Why 80 / 50: they are round numbers chosen to place the shipped catalogue
 * sensibly (bottled water and plain dairy above the line, sugary drinks and salty
 * cereals below it), not values derived from evidence. Like the thresholds in
 * rubric.ts they are ours and provisional — DECISIONS.md §20.
 */

import type { Check, Verdict, VerdictResult } from "../schemas";
import type { CategoryRule } from "./categories/types";
import {
  ACCEPTABLE_PASS_RATE,
  GOOD_CHOICE_PASS_RATE,
  MIN_COVERAGE,
  MIN_KNOWN_FOR_GOOD_CHOICE,
} from "./rubric";

export const VERDICT_LABEL: Record<Verdict, string> = {
  good_choice: "VERIFIED — GOOD CHOICE",
  acceptable: "VERIFIED — ACCEPTABLE",
  not_recommended: "NOT RECOMMENDED",
  could_not_verify: "COULD NOT VERIFY",
};

/** Ordering used when comparing two products. Higher is better. */
export const VERDICT_RANK: Record<Verdict, number> = {
  good_choice: 3,
  acceptable: 2,
  not_recommended: 1,
  could_not_verify: 0,
};

/** The two verdicts that mean "we verified this and we can stand behind it". */
export function isVerified(verdict: Verdict): boolean {
  return verdict === "good_choice" || verdict === "acceptable";
}

/**
 * Rule D12 — a category Noura cannot evidence returns COULD NOT VERIFY with an
 * explicit message, whatever its checks say.
 *
 * Without this, a cosmetic that publishes an ingredient list and has no
 * certificate on file reaches VERIFIED — ACCEPTABLE on a pass rate of 1.0 over
 * one resolved check. That sentence would be true arithmetic and a false claim:
 * the thing that decides whether a cosmetic is safe is its ingredients against
 * the EU restricted-substance annexes, and Noura does not hold those. Better to
 * say we cannot assess the category than to publish a verdict built from the two
 * weakest dimensions we happen to have. RUBRIC.md §4.9 C4.9.6, §4.10 C4.10.4.
 */
export function verdictFor(checks: Check[], rule?: CategoryRule): VerdictResult {
  const applicable = checks.length;
  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;
  const unknown = checks.filter((c) => c.status === "unknown").length;
  const known = passed + failed;

  const coverage = applicable === 0 ? 0 : known / applicable;
  const passRate = known === 0 ? 0 : passed / known;

  const counts = { applicable, passed, failed, unknown, known };
  const rounded = {
    coverage: Math.round(coverage * 100) / 100,
    passRate: Math.round(passRate * 100) / 100,
  };

  // 0 — D12 first: an unsupported category is not a product that scored badly.
  if (rule && !rule.supported) {
    return {
      verdict: "could_not_verify",
      reason:
        rule.unsupportedMessage ??
        `Noura cannot assess ${rule.label.toLowerCase()} yet.`,
      counts,
      ...rounded,
    };
  }

  // 0 + 1 — not enough evidence to say anything.
  if (applicable === 0 || known === 0) {
    return {
      verdict: "could_not_verify",
      reason: "Nothing about this product could be checked.",
      counts,
      ...rounded,
    };
  }
  if (coverage < MIN_COVERAGE) {
    return {
      verdict: "could_not_verify",
      reason: `Only ${known} of ${applicable} things could be checked. That is too little to judge this product either way.`,
      counts,
      ...rounded,
    };
  }

  // 2 — the overrides: a suspended certificate, or a nutrient past the high mark.
  const disqualifier = checks.find((c) => c.status === "fail" && c.disqualifying);
  if (disqualifier) {
    return { verdict: "not_recommended", reason: disqualifier.claim, counts, ...rounded };
  }

  // 3-5 — how much of what we could check actually passed.
  const summary = `${passed} of ${known} checks passed${
    unknown > 0 ? `. ${unknown} could not be checked` : ""
  }.`;

  if (passRate >= GOOD_CHOICE_PASS_RATE && known >= MIN_KNOWN_FOR_GOOD_CHOICE) {
    return { verdict: "good_choice", reason: summary, counts, ...rounded };
  }
  if (passRate >= ACCEPTABLE_PASS_RATE) {
    return { verdict: "acceptable", reason: summary, counts, ...rounded };
  }
  return { verdict: "not_recommended", reason: summary, counts, ...rounded };
}
