/**
 * THE EVIDENCE GATE: is there enough here to say anything, and of what kind?
 *
 * This is where Noura decides not what a product IS but what it is entitled to
 * SAY about it. The output is an evidence state, and none of the six is a
 * failure — "this cannot currently be assessed with sufficient evidence" is a
 * successful result when it is the truthful one.
 *
 * The gate optimises for the most defensible state, never for producing a
 * verdict. Those pull in opposite directions often enough that it is worth
 * saying in the file that does it.
 */

import {
  isIndependentlyCorroborated,
  type ClaimKind,
  type ResearchedClaim,
} from "../evidence/authority";

export const EVIDENCE_STATES = [
  /** Independent or regulatory evidence for the things that matter. */
  "SUPPORTED",
  /** Some dimensions evidenced, others not. The common honest case. */
  "PARTIALLY_SUPPORTED",
  /** Everything rests on what the maker or the seller says. */
  "CLAIMED_ONLY",
  /** Too little to assess at all. */
  "INSUFFICIENT_EVIDENCE",
  /** Sources disagree about the same claim. */
  "CONFLICTING_EVIDENCE",
  /** Noura holds no rule for this kind of product. */
  "NOT_ASSESSABLE",
] as const;
export type EvidenceState = (typeof EVIDENCE_STATES)[number];

export const EVIDENCE_STATE_LABEL: Record<EvidenceState, string> = {
  SUPPORTED: "Independently evidenced",
  PARTIALLY_SUPPORTED: "Partly evidenced",
  CLAIMED_ONLY: "Only what the maker or seller says",
  INSUFFICIENT_EVIDENCE: "Not enough evidence to assess",
  CONFLICTING_EVIDENCE: "Sources disagree",
  NOT_ASSESSABLE: "Noura has no rule for this kind of product",
};

/** Only these may carry a product assessment. */
export function permitsAssessment(state: EvidenceState): boolean {
  return state === "SUPPORTED" || state === "PARTIALLY_SUPPORTED" || state === "CLAIMED_ONLY";
}

export type GateResult = {
  state: EvidenceState;
  /** Claim kinds we hold something for. */
  evidenced: ClaimKind[];
  /** Claim kinds the category's rubric wants and nothing answered. */
  missing: ClaimKind[];
  /** Kinds where two sources disagree. */
  conflicting: ClaimKind[];
  /** Kinds resting entirely on a commercial party's own word. */
  claimedOnly: ClaimKind[];
  /** A sentence naming what is known and what is not. */
  summary: string;
};

/** Two statements about the same claim that cannot both be right. */
function disagree(a: ResearchedClaim, b: ResearchedClaim): boolean {
  if (a.claimKind !== b.claimKind) return false;
  if (a.sourceType === b.sourceType) return false;

  // Numbers first, because that is where disagreement is checkable. Text is
  // compared loosely, and only flagged when neither contains the other: a
  // shorter ingredient list is usually an abbreviation rather than a conflict.
  const numbersOf = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));
  const an = numbersOf(a.claim);
  const bn = numbersOf(b.claim);
  if (an.length > 0 && bn.length > 0 && an[0] !== bn[0]) return true;

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const x = norm(a.claim);
  const y = norm(b.claim);
  if (an.length === 0 && bn.length === 0 && x.length > 12 && y.length > 12) {
    return !x.includes(y) && !y.includes(x);
  }
  return false;
}

/**
 * Read the evidence.
 *
 * `required` is what this product's category actually needs, supplied by the
 * caller from the rubric rather than guessed here — the gate does not know
 * what a yoghurt needs and should not pretend to.
 */
export function assessEvidence(args: {
  claims: ResearchedClaim[];
  required: ClaimKind[];
  /** True when Noura has no rule for this category at all. */
  categoryUnsupported?: boolean;
}): GateResult {
  const { claims, required } = args;

  if (args.categoryUnsupported) {
    return {
      state: "NOT_ASSESSABLE",
      evidenced: [],
      missing: required,
      conflicting: [],
      claimedOnly: [],
      summary:
        "Noura has no rule for this kind of product, so it has not assessed it. " +
        "What was found is shown as evidence rather than as a judgement.",
    };
  }

  const kinds = new Set(claims.map((c) => c.claimKind));
  const evidenced = required.filter((k) => kinds.has(k));
  const missing = required.filter((k) => !kinds.has(k));

  const conflicting: ClaimKind[] = [];
  for (const kind of evidenced) {
    const forKind = claims.filter((c) => c.claimKind === kind);
    const clash = forKind.some((a, i) => forKind.slice(i + 1).some((b) => disagree(a, b)));
    if (clash) conflicting.push(kind);
  }

  // A kind is "claimed only" when nothing independent supports it.
  const claimedOnly: ClaimKind[] = [];
  for (const kind of evidenced) {
    const forKind = claims.filter((c) => c.claimKind === kind);
    const anyIndependent = forKind.some(
      (c) =>
        c.epistemicState === "INDEPENDENTLY_VERIFIED" ||
        c.epistemicState === "SCIENTIFICALLY_SUPPORTED" ||
        isIndependentlyCorroborated(c, claims),
    );
    if (!anyIndependent) claimedOnly.push(kind);
  }

  const state: EvidenceState = (() => {
    // A disagreement outranks everything: an average of two contradictory
    // figures is worse than saying they contradict.
    if (conflicting.length > 0) return "CONFLICTING_EVIDENCE";
    if (evidenced.length === 0) return "INSUFFICIENT_EVIDENCE";
    // Below half the required dimensions is not a partial answer, it is an
    // absence with a couple of facts attached. RUBRIC V1 draws the same line.
    if (evidenced.length < required.length / 2) return "INSUFFICIENT_EVIDENCE";
    if (claimedOnly.length === evidenced.length) return "CLAIMED_ONLY";
    if (missing.length > 0 || claimedOnly.length > 0) return "PARTIALLY_SUPPORTED";
    return "SUPPORTED";
  })();

  return { state, evidenced, missing, conflicting, claimedOnly, summary: summarise(state, evidenced, missing, conflicting, claimedOnly) };
}

function list(kinds: ClaimKind[]): string {
  const words = kinds.map((k) =>
    k.toLowerCase().replace(/_/g, " ").replace("product ", "").replace("certification ", "certification "),
  );
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

function summarise(
  state: EvidenceState,
  evidenced: ClaimKind[],
  missing: ClaimKind[],
  conflicting: ClaimKind[],
  claimedOnly: ClaimKind[],
): string {
  switch (state) {
    case "CONFLICTING_EVIDENCE":
      return `Sources disagree about ${list(conflicting)}. Noura has not chosen between them.`;
    case "INSUFFICIENT_EVIDENCE":
      return missing.length > 0
        ? `Nothing was found for ${list(missing)}, which is too little to assess this product.`
        : "Too little was found to assess this product.";
    case "CLAIMED_ONLY":
      return `Everything known about ${list(evidenced)} comes from the maker or the seller, with nothing independent to check it against.`;
    case "PARTIALLY_SUPPORTED":
      return [
        `Evidence found for ${list(evidenced)}.`,
        missing.length > 0 ? `Nothing found for ${list(missing)}.` : "",
        claimedOnly.length > 0
          ? `${list(claimedOnly)} rests only on what the maker or seller says.`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
    case "SUPPORTED":
      return `Independent evidence was found for ${list(evidenced)}.`;
    case "NOT_ASSESSABLE":
      return "Noura has no rule for this kind of product.";
  }
}
