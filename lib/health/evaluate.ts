/**
 * Stage 4's entry point: evidence in, checklist + verdict out.
 *
 * There is no number. Pure and synchronous. The model is offered the result
 * afterwards and may rewrite the wording of a check; it may never change a status
 * or the verdict.
 */

import type { Check, VerdictResult } from "../schemas";
import { countByStatus, evaluateChecks, unexplainedEnergy, type EvidenceInput } from "./checks";
import { verdictFor } from "./verdict";

export type { CertificationEvidence, EvidenceInput } from "./checks";

export type Evaluation = {
  verdict: VerdictResult;
  checks: Check[];
  /** Everything we could not establish, in the reader's words. */
  unknowns: string[];
};

export function evaluateProduct(input: EvidenceInput): Evaluation {
  const checks = evaluateChecks(input);
  const verdict = verdictFor(checks);

  const unknowns = checks
    .filter((c) => c.status === "unknown")
    .map((c) => `${c.label}: ${c.evidence.value}`);

  // A panel can be present and still be wrong. Crowd-sourced records regularly
  // carry a real energy figure alongside macros left at zero, which would let a
  // product pass checks on evidence that does not add up. We cannot correct it,
  // so we say so — as an unknown, never as a failed check.
  const gap = unexplainedEnergy(input.nutrition);
  if (gap !== null) {
    unknowns.push(
      `Nutrition panel may be incomplete: the declared ${gap.declared} kcal is more than the ` +
        `listed fat, protein and carbohydrate account for (about ${gap.explained} kcal)`,
    );
  }

  // Allergens are surfaced, never checked: an allergen is a fact about the reader,
  // not a defect in the product. They are shown in the evidence panel instead.
  return { verdict, checks, unknowns };
}

export { countByStatus, unexplainedEnergy, evaluateChecks, verdictFor };
