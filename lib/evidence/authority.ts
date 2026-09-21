/**
 * SOURCE CAPABILITY: what a source is allowed to prove.
 *
 * Noura records what a source says. The source's authority decides what that
 * saying is allowed to establish. Those are different questions and the whole
 * model rests on keeping them apart.
 *
 * -- Why a matrix rather than a ranking -------------------------------------
 *
 * A single trust score per source would be wrong in both directions at once. A
 * manufacturer is the BEST source in the world for what its own product is
 * called, what size the bottle is and what it declares on the ingredient panel
 * — nobody knows those better, and no independent party is closer to them. The
 * same manufacturer is worth nothing at all on whether the product is good for
 * you, and a score cannot say both.
 *
 * So authority is a function of (source, claim), never of source alone.
 *
 * -- The four states that must never merge ----------------------------------
 *
 *   the manufacturer says X
 *   X has been independently verified
 *   scientific evidence supports X
 *   Noura therefore concludes X
 *
 * Every one of those is a different epistemic position, and collapsing any two
 * of them is how a product page becomes a health claim.
 */

/* ---------------------------------------------------------------------------
 * What is being claimed
 * ------------------------------------------------------------------------- */

export const CLAIM_KINDS = [
  /** What the product is: name, brand, variant. */
  "PRODUCT_IDENTITY",
  /** The pack size or net quantity. */
  "PRODUCT_SIZE",
  /** The ingredient list or formulation as printed. */
  "INGREDIENTS",
  /** The nutrition panel as printed. */
  "NUTRITION",
  /** What the product is for. */
  "INTENDED_USE",
  /** "We hold certification X." */
  "CERTIFICATION_HELD",
  /** "Certification X is real, current, and covers this product." */
  "CERTIFICATION_VALID",
  /** Whether the product is regulated, recalled, permitted, restricted. */
  "REGULATORY_STATUS",
  /** Whether an ingredient or product affects health, and how. */
  "HEALTH_EFFECT",
  /** Whether the product is environmentally better or worse. */
  "ENVIRONMENTAL_EFFECT",
  /** What it costs. */
  "PRICE",
  /** Whether it is in stock. */
  "AVAILABILITY",
] as const;
export type ClaimKind = (typeof CLAIM_KINDS)[number];

/* ---------------------------------------------------------------------------
 * Who is speaking
 * ------------------------------------------------------------------------- */

export const SOURCE_TYPES = [
  /** A government or statutory body. */
  "REGULATOR",
  /** A register of certificates, run by the certifying scheme or its authority. */
  "CERTIFICATION_REGISTRY",
  /** Peer-reviewed literature, or a scientific advisory body's opinion. */
  "SCIENTIFIC_LITERATURE",
  /** The company that makes the product, speaking about its own product. */
  "MANUFACTURER",
  /** A shop selling the product. */
  "RETAILER",
  /** A crowd-sourced product database such as Open Food Facts. */
  "OPEN_DATABASE",
  /** A person who looked, with their name attached. */
  "HUMAN_OBSERVATION",
  /** Noura's own deterministic rules, applied to evidence gathered above. */
  "NOURA_RULE",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/**
 * How close the source is to the thing it describes, and whose interest it
 * serves. Recorded separately from authority because they are different facts:
 * a manufacturer is PRIMARY and COMMERCIAL at once, and both matter.
 */
export const INDEPENDENCE_KINDS = [
  /** Speaking about itself. Closest to the facts, least disinterested. */
  "PRIMARY_SELF_INTERESTED",
  /** A third party with no stake in the answer. */
  "INDEPENDENT",
  /** A statutory body with legal authority. */
  "REGULATORY",
  /** Peer-reviewed or advisory scientific work. */
  "SCIENTIFIC",
  /** Selling the thing it describes. */
  "COMMERCIAL",
  /** Contributed by volunteers, unverified. */
  "CROWD_SOURCED",
  /** Noura's own reasoning, not a source at all. */
  "INTERNAL",
] as const;
export type Independence = (typeof INDEPENDENCE_KINDS)[number];

/* ---------------------------------------------------------------------------
 * What this source may establish about this claim
 * ------------------------------------------------------------------------- */

export const AUTHORITY_LEVELS = [
  /** Settles the question. Nothing further is needed. */
  "AUTHORITATIVE",
  /**
   * The party's own declaration, and authoritative ONLY as a declaration.
   *
   * A manufacturer's ingredient list establishes what the manufacturer declares
   * the product contains. It does not establish what is in the bottle — that
   * would take a laboratory — and the distinction is not pedantry: declared
   * formulations are wrong often enough that regulators run testing programmes.
   */
  "DECLARED",
  /** Real evidence, insufficient alone. Wants corroboration. */
  "SUPPORTING",
  /** Cannot speak to this at all. Recording it would be noise or worse. */
  "NONE",
] as const;
export type AuthorityLevel = (typeof AUTHORITY_LEVELS)[number];

/* ---------------------------------------------------------------------------
 * THE MATRIX
 * ------------------------------------------------------------------------- */

const NOTHING: Record<ClaimKind, AuthorityLevel> = {
  PRODUCT_IDENTITY: "NONE",
  PRODUCT_SIZE: "NONE",
  INGREDIENTS: "NONE",
  NUTRITION: "NONE",
  INTENDED_USE: "NONE",
  CERTIFICATION_HELD: "NONE",
  CERTIFICATION_VALID: "NONE",
  REGULATORY_STATUS: "NONE",
  HEALTH_EFFECT: "NONE",
  ENVIRONMENTAL_EFFECT: "NONE",
  PRICE: "NONE",
  AVAILABILITY: "NONE",
};

/**
 * Read a row as: "this source, asked this question, may establish this much."
 *
 * The blanks matter as much as the entries. A retailer saying a product is
 * healthy establishes NOTHING, and the model says so rather than quietly
 * downweighting it.
 */
export const CAPABILITY: Record<SourceType, Record<ClaimKind, AuthorityLevel>> = {
  REGULATOR: {
    ...NOTHING,
    PRODUCT_IDENTITY: "AUTHORITATIVE",
    CERTIFICATION_HELD: "AUTHORITATIVE",
    CERTIFICATION_VALID: "AUTHORITATIVE",
    REGULATORY_STATUS: "AUTHORITATIVE",
    INGREDIENTS: "SUPPORTING",
    NUTRITION: "SUPPORTING",
  },

  CERTIFICATION_REGISTRY: {
    ...NOTHING,
    CERTIFICATION_HELD: "AUTHORITATIVE",
    CERTIFICATION_VALID: "AUTHORITATIVE",
    PRODUCT_IDENTITY: "SUPPORTING",
    REGULATORY_STATUS: "SUPPORTING",
  },

  SCIENTIFIC_LITERATURE: {
    ...NOTHING,
    // The only source that may establish an effect. Not a manufacturer, not a
    // retailer, not a certificate, and not Noura.
    HEALTH_EFFECT: "AUTHORITATIVE",
    ENVIRONMENTAL_EFFECT: "AUTHORITATIVE",
  },

  MANUFACTURER: {
    ...NOTHING,
    // Nobody knows the product's own name and size better.
    PRODUCT_IDENTITY: "AUTHORITATIVE",
    PRODUCT_SIZE: "AUTHORITATIVE",
    INTENDED_USE: "AUTHORITATIVE",
    // Declared, not proven. See DECLARED above.
    INGREDIENTS: "DECLARED",
    NUTRITION: "DECLARED",
    CERTIFICATION_HELD: "DECLARED",
    // And nothing at all on whether any of it is good for you, or whether the
    // certificate it claims is real.
  },

  RETAILER: {
    ...NOTHING,
    PRICE: "AUTHORITATIVE",
    AVAILABILITY: "AUTHORITATIVE",
    PRODUCT_IDENTITY: "SUPPORTING",
    PRODUCT_SIZE: "SUPPORTING",
    INGREDIENTS: "SUPPORTING",
    NUTRITION: "SUPPORTING",
  },

  OPEN_DATABASE: {
    ...NOTHING,
    // Real evidence, contributed by volunteers, frequently right and
    // occasionally wrong. Never the last word.
    PRODUCT_IDENTITY: "SUPPORTING",
    PRODUCT_SIZE: "SUPPORTING",
    INGREDIENTS: "SUPPORTING",
    NUTRITION: "SUPPORTING",
  },

  HUMAN_OBSERVATION: {
    ...NOTHING,
    PRICE: "AUTHORITATIVE",
    AVAILABILITY: "AUTHORITATIVE",
    PRODUCT_IDENTITY: "SUPPORTING",
    PRODUCT_SIZE: "SUPPORTING",
  },

  NOURA_RULE: {
    ...NOTHING,
    // Noura establishes nothing about the world. It applies rules to evidence
    // other sources provided, and the conclusion is labelled as its own.
  },
};

export function authorityFor(source: SourceType, claim: ClaimKind): AuthorityLevel {
  return CAPABILITY[source]?.[claim] ?? "NONE";
}

export const INDEPENDENCE_OF: Record<SourceType, Independence> = {
  REGULATOR: "REGULATORY",
  CERTIFICATION_REGISTRY: "INDEPENDENT",
  SCIENTIFIC_LITERATURE: "SCIENTIFIC",
  MANUFACTURER: "PRIMARY_SELF_INTERESTED",
  RETAILER: "COMMERCIAL",
  OPEN_DATABASE: "CROWD_SOURCED",
  HUMAN_OBSERVATION: "INDEPENDENT",
  NOURA_RULE: "INTERNAL",
};

/* ---------------------------------------------------------------------------
 * The four states
 * ------------------------------------------------------------------------- */

export const EPISTEMIC_STATES = [
  /** "The manufacturer says X." A claim, attributed, not endorsed. */
  "CLAIMED_BY_SOURCE",
  /** "X has been independently verified." A third party checked. */
  "INDEPENDENTLY_VERIFIED",
  /** "Scientific evidence supports X." A body of work, not a product page. */
  "SCIENTIFICALLY_SUPPORTED",
  /** "Noura therefore concludes X." Our rules over the above, labelled as ours. */
  "NOURA_CONCLUSION",
] as const;
export type EpistemicState = (typeof EPISTEMIC_STATES)[number];

/**
 * Which of the four a single source, at its authority level, can produce.
 *
 * A DECLARED ingredient list is a claim, however authoritative the declarer is
 * about its own declaration. Only an independent or regulatory source
 * VERIFIES; only science SUPPORTS an effect; only Noura CONCLUDES, and only
 * from things the others established.
 */
export function epistemicStateFor(source: SourceType, claim: ClaimKind): EpistemicState | null {
  const authority = authorityFor(source, claim);
  if (authority === "NONE") return null;

  if (source === "NOURA_RULE") return "NOURA_CONCLUSION";
  if (source === "SCIENTIFIC_LITERATURE") return "SCIENTIFICALLY_SUPPORTED";
  if (authority === "DECLARED") return "CLAIMED_BY_SOURCE";

  const independence = INDEPENDENCE_OF[source];
  if (independence === "REGULATORY" || independence === "INDEPENDENT") {
    return authority === "AUTHORITATIVE" ? "INDEPENDENTLY_VERIFIED" : "CLAIMED_BY_SOURCE";
  }

  // Commercial and crowd-sourced parties make claims. A retailer's price is
  // authoritative and is still the retailer's claim about its own shelf.
  return "CLAIMED_BY_SOURCE";
}

/** The sentence a reader sees. Attribution is never optional. */
export function attribute(state: EpistemicState, sourceName: string, claim: string): string {
  switch (state) {
    case "CLAIMED_BY_SOURCE":
      return `${sourceName} states: ${claim}`;
    case "INDEPENDENTLY_VERIFIED":
      return `Independently verified by ${sourceName}: ${claim}`;
    case "SCIENTIFICALLY_SUPPORTED":
      return `Scientific evidence (${sourceName}) supports: ${claim}`;
    case "NOURA_CONCLUSION":
      return `Noura concludes, from the evidence above: ${claim}`;
  }
}

/* ---------------------------------------------------------------------------
 * What a source establishes, and what it does not
 * ------------------------------------------------------------------------- */

/** Plain sentence for the audit view and the page. Never generic. */
export function establishes(source: SourceType, claim: ClaimKind): string {
  const authority = authorityFor(source, claim);
  if (authority === "NONE") return "Nothing. This source cannot speak to this question.";
  if (authority === "DECLARED") {
    return `What ${label(source)} declares about ${claimLabel(claim)} — not that the declaration is correct.`;
  }
  if (authority === "SUPPORTING") {
    return `Evidence about ${claimLabel(claim)}, which wants corroboration before it is relied on.`;
  }
  return `${capitalise(claimLabel(claim))}, settled.`;
}

export function doesNotEstablish(source: SourceType, claim: ClaimKind): string[] {
  const out: string[] = [];
  const authority = authorityFor(source, claim);

  if (authority === "DECLARED") {
    out.push("that the declaration is accurate — only that it was made");
  }
  if (source === "MANUFACTURER" || source === "RETAILER") {
    out.push("that the product is healthier, safer or environmentally better");
    out.push("that any certification it mentions is real, current, or covers this product");
  }
  if (source === "OPEN_DATABASE") {
    out.push("anything with certainty — the record was contributed by a volunteer");
  }
  if (source === "CERTIFICATION_REGISTRY" || source === "REGULATOR") {
    out.push("that the product is nutritionally better than any other");
  }
  if (source === "SCIENTIFIC_LITERATURE") {
    out.push("that this particular product behaves as the literature describes");
  }
  return out;
}

function label(source: SourceType): string {
  return {
    REGULATOR: "the regulator",
    CERTIFICATION_REGISTRY: "the register",
    SCIENTIFIC_LITERATURE: "the literature",
    MANUFACTURER: "the manufacturer",
    RETAILER: "the retailer",
    OPEN_DATABASE: "the open database",
    HUMAN_OBSERVATION: "the person who checked",
    NOURA_RULE: "Noura",
  }[source];
}

function claimLabel(claim: ClaimKind): string {
  return {
    PRODUCT_IDENTITY: "what the product is",
    PRODUCT_SIZE: "the pack size",
    INGREDIENTS: "the ingredients",
    NUTRITION: "the nutrition panel",
    INTENDED_USE: "what the product is for",
    CERTIFICATION_HELD: "which certifications are claimed",
    CERTIFICATION_VALID: "whether a certification is valid",
    REGULATORY_STATUS: "the regulatory status",
    HEALTH_EFFECT: "the effect on health",
    ENVIRONMENTAL_EFFECT: "the environmental effect",
    PRICE: "the price",
    AVAILABILITY: "whether it is in stock",
  }[claim];
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/* ---------------------------------------------------------------------------
 * One researched claim
 * ------------------------------------------------------------------------- */

export type ResearchedClaim = {
  /** 1. What is being claimed. */
  claim: string;
  claimKind: ClaimKind;
  /** 2. The exact source. */
  sourceUrl: string | null;
  sourceName: string;
  /** 3. What kind of source it is. */
  sourceType: SourceType;
  /** 4. Its authority FOR THIS CLAIM. */
  authority: AuthorityLevel;
  /** 5. How close and how disinterested it is. */
  independence: Independence;
  /** 6. When it was retrieved, and how long it holds. */
  retrievedAt: Date;
  validUntil: Date | null;
  /** 7 and 8. */
  establishes: string;
  doesNotEstablish: string[];
  /** 9. How sure we are, as a state rather than a number. */
  epistemicState: EpistemicState;
  /** 10. Other sources that say the same thing, independently. */
  corroboratedBy: string[];
};

/** Build a claim record with its authority filled in from the matrix. */
export function researchedClaim(args: {
  claim: string;
  claimKind: ClaimKind;
  sourceType: SourceType;
  sourceName: string;
  sourceUrl?: string | null;
  retrievedAt?: Date;
  validUntil?: Date | null;
  corroboratedBy?: string[];
}): ResearchedClaim | null {
  const authority = authorityFor(args.sourceType, args.claimKind);
  // A source with no authority for this claim does not produce a weak record.
  // It produces none: storing it would invite a later reader to use it.
  if (authority === "NONE") return null;

  const epistemicState = epistemicStateFor(args.sourceType, args.claimKind);
  if (!epistemicState) return null;

  return {
    claim: args.claim,
    claimKind: args.claimKind,
    sourceUrl: args.sourceUrl ?? null,
    sourceName: args.sourceName,
    sourceType: args.sourceType,
    authority,
    independence: INDEPENDENCE_OF[args.sourceType],
    retrievedAt: args.retrievedAt ?? new Date(),
    validUntil: args.validUntil ?? null,
    establishes: establishes(args.sourceType, args.claimKind),
    doesNotEstablish: doesNotEstablish(args.sourceType, args.claimKind),
    epistemicState,
    corroboratedBy: args.corroboratedBy ?? [],
  };
}

/**
 * Is this claim corroborated by a source independent of the first?
 *
 * Two manufacturer pages are not corroboration; neither are two retailers
 * copying the same supplier feed. Corroboration requires a different KIND of
 * source, which is why independence is stored rather than derived.
 */
export function isIndependentlyCorroborated(claim: ResearchedClaim, others: ResearchedClaim[]): boolean {
  return others.some(
    (other) =>
      other.claimKind === claim.claimKind &&
      other.sourceType !== claim.sourceType &&
      other.independence !== claim.independence &&
      other.authority !== "NONE",
  );
}
