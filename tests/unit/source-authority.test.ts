/**
 * What a source is allowed to prove.
 *
 * The model exists because a single trust score per source is wrong in both
 * directions at once. A manufacturer is the best source on earth for what its
 * own product is called and worth nothing on whether it is good for you, and no
 * ranking can say both.
 *
 * The four states these tests protect:
 *
 *   the manufacturer says X
 *   X has been independently verified
 *   scientific evidence supports X
 *   Noura therefore concludes X
 */

import { describe, expect, it } from "vitest";
import {
  AUTHORITY_LEVELS,
  CLAIM_KINDS,
  EPISTEMIC_STATES,
  INDEPENDENCE_OF,
  SOURCE_TYPES,
  attribute,
  authorityFor,
  doesNotEstablish,
  epistemicStateFor,
  establishes,
  isIndependentlyCorroborated,
  researchedClaim,
  type ClaimKind,
  type SourceType,
} from "@/lib/evidence/authority";

/* ── the manufacturer, in both directions ───────────────────────────────── */

describe("a manufacturer is the best source for some things and no source for others", () => {
  it("is AUTHORITATIVE for what its own product is called and how big it is", () => {
    // Nobody is closer to these facts, and no independent party knows better.
    expect(authorityFor("MANUFACTURER", "PRODUCT_IDENTITY")).toBe("AUTHORITATIVE");
    expect(authorityFor("MANUFACTURER", "PRODUCT_SIZE")).toBe("AUTHORITATIVE");
    expect(authorityFor("MANUFACTURER", "INTENDED_USE")).toBe("AUTHORITATIVE");
  });

  it("is DECLARED — not authoritative — for its own ingredient and nutrition panels", () => {
    // It establishes what was declared, not that the declaration is correct.
    // Regulators run testing programmes precisely because those differ.
    expect(authorityFor("MANUFACTURER", "INGREDIENTS")).toBe("DECLARED");
    expect(authorityFor("MANUFACTURER", "NUTRITION")).toBe("DECLARED");
  });

  it("establishes NOTHING about health, environment, or its own certificates being real", () => {
    expect(authorityFor("MANUFACTURER", "HEALTH_EFFECT")).toBe("NONE");
    expect(authorityFor("MANUFACTURER", "ENVIRONMENTAL_EFFECT")).toBe("NONE");
    expect(authorityFor("MANUFACTURER", "CERTIFICATION_VALID")).toBe("NONE");
  });

  it("may say WHICH certifications it claims, without that making them valid", () => {
    // Two different claims, two different answers. This is the distinction the
    // whole matrix exists for.
    expect(authorityFor("MANUFACTURER", "CERTIFICATION_HELD")).toBe("DECLARED");
    expect(authorityFor("MANUFACTURER", "CERTIFICATION_VALID")).toBe("NONE");
  });
});

/* ── everyone else ──────────────────────────────────────────────────────── */

describe("each source type is authoritative only where it should be", () => {
  it("lets a registry settle whether a certification exists and is valid", () => {
    expect(authorityFor("CERTIFICATION_REGISTRY", "CERTIFICATION_HELD")).toBe("AUTHORITATIVE");
    expect(authorityFor("CERTIFICATION_REGISTRY", "CERTIFICATION_VALID")).toBe("AUTHORITATIVE");
  });

  it("does not let a registry say the product is nutritionally better", () => {
    // A certificate attests to conformity with a standard. It is not a health
    // claim, and Noura has said so in its copy since the beginning.
    expect(authorityFor("CERTIFICATION_REGISTRY", "HEALTH_EFFECT")).toBe("NONE");
    expect(doesNotEstablish("CERTIFICATION_REGISTRY", "CERTIFICATION_VALID").join(" ")).toMatch(
      /nutritionally better/i,
    );
  });

  it("makes science the ONLY source that may establish an effect", () => {
    const canEstablishHealth = SOURCE_TYPES.filter(
      (s) => authorityFor(s as SourceType, "HEALTH_EFFECT") === "AUTHORITATIVE",
    );
    expect(canEstablishHealth).toEqual(["SCIENTIFIC_LITERATURE"]);

    const canEstablishEnvironment = SOURCE_TYPES.filter(
      (s) => authorityFor(s as SourceType, "ENVIRONMENTAL_EFFECT") === "AUTHORITATIVE",
    );
    expect(canEstablishEnvironment).toEqual(["SCIENTIFIC_LITERATURE"]);
  });

  it("lets a retailer settle price and availability and nothing else that matters", () => {
    expect(authorityFor("RETAILER", "PRICE")).toBe("AUTHORITATIVE");
    expect(authorityFor("RETAILER", "AVAILABILITY")).toBe("AUTHORITATIVE");
    expect(authorityFor("RETAILER", "HEALTH_EFFECT")).toBe("NONE");
    expect(authorityFor("RETAILER", "CERTIFICATION_VALID")).toBe("NONE");
  });

  it("treats a crowd database as supporting evidence, never as the last word", () => {
    expect(authorityFor("OPEN_DATABASE", "INGREDIENTS")).toBe("SUPPORTING");
    expect(authorityFor("OPEN_DATABASE", "NUTRITION")).toBe("SUPPORTING");
    const never = CLAIM_KINDS.filter(
      (c) => authorityFor("OPEN_DATABASE", c as ClaimKind) === "AUTHORITATIVE",
    );
    expect(never).toEqual([]);
  });

  it("gives Noura's own rules authority over nothing in the world", () => {
    // Noura applies rules to evidence others produced. It does not observe.
    for (const claim of CLAIM_KINDS) {
      expect(authorityFor("NOURA_RULE", claim as ClaimKind), claim).toBe("NONE");
    }
  });
});

/* ── the four states ────────────────────────────────────────────────────── */

describe("the four epistemic states never merge", () => {
  it("keeps a manufacturer's ingredient list as a CLAIM", () => {
    expect(epistemicStateFor("MANUFACTURER", "INGREDIENTS")).toBe("CLAIMED_BY_SOURCE");
  });

  it("makes a registry's certificate INDEPENDENTLY VERIFIED", () => {
    expect(epistemicStateFor("CERTIFICATION_REGISTRY", "CERTIFICATION_VALID")).toBe(
      "INDEPENDENTLY_VERIFIED",
    );
  });

  it("makes a scientific finding SCIENTIFICALLY SUPPORTED, not verified or concluded", () => {
    expect(epistemicStateFor("SCIENTIFIC_LITERATURE", "HEALTH_EFFECT")).toBe(
      "SCIENTIFICALLY_SUPPORTED",
    );
  });

  it("labels Noura's own output as Noura's own conclusion", () => {
    // NOURA_RULE has no authority over any claim, so it produces no state here.
    // That is deliberate: a conclusion is built in the assessment layer from
    // evidence, not asserted as a source.
    expect(epistemicStateFor("NOURA_RULE", "HEALTH_EFFECT")).toBeNull();
  });

  it("keeps a retailer's price a claim even though the retailer settles it", () => {
    // Authoritative and still a claim: it is the shop's statement about its own
    // shelf, and that is exactly what the page should say.
    expect(authorityFor("RETAILER", "PRICE")).toBe("AUTHORITATIVE");
    expect(epistemicStateFor("RETAILER", "PRICE")).toBe("CLAIMED_BY_SOURCE");
  });

  it("writes a different sentence for each state", () => {
    const sentences = EPISTEMIC_STATES.map((s) => attribute(s, "Acme", "it contains water"));
    expect(new Set(sentences).size).toBe(EPISTEMIC_STATES.length);
    expect(sentences[0]).toMatch(/^Acme states:/);
    expect(sentences[1]).toMatch(/^Independently verified by Acme/);
    expect(sentences[2]).toMatch(/^Scientific evidence \(Acme\) supports/);
    expect(sentences[3]).toMatch(/^Noura concludes/);
  });

  it("never phrases a claim as a verification", () => {
    const claimed = attribute("CLAIMED_BY_SOURCE", "Acme", "this product is organic");
    expect(claimed.toLowerCase()).not.toMatch(/verified|confirmed|proven/);
  });
});

/* ── what a record does and does not carry ──────────────────────────────── */

describe("a researched claim carries all ten fields, or is not recorded", () => {
  it("records every field the evidence model requires", () => {
    const record = researchedClaim({
      claim: "Aqua, Glycerin, Panthenol",
      claimKind: "INGREDIENTS",
      sourceType: "MANUFACTURER",
      sourceName: "Bayer Consumer Care",
      sourceUrl: "https://example.invalid/bepanthen",
      retrievedAt: new Date("2026-09-21"),
    })!;

    expect(record.claim).toBeTruthy();
    expect(record.claimKind).toBe("INGREDIENTS");
    expect(record.sourceUrl).toBeTruthy();
    expect(record.sourceName).toBeTruthy();
    expect(record.sourceType).toBe("MANUFACTURER");
    expect(record.authority).toBe("DECLARED");
    expect(record.independence).toBe("PRIMARY_SELF_INTERESTED");
    expect(record.retrievedAt).toBeInstanceOf(Date);
    expect(record.establishes).toMatch(/declares/i);
    expect(record.doesNotEstablish.length).toBeGreaterThan(0);
    expect(record.epistemicState).toBe("CLAIMED_BY_SOURCE");
    expect(Array.isArray(record.corroboratedBy)).toBe(true);
  });

  it("says plainly what a manufacturer's page does NOT establish", () => {
    const record = researchedClaim({
      claim: "Dermatologically tested",
      claimKind: "INGREDIENTS",
      sourceType: "MANUFACTURER",
      sourceName: "Bayer",
    })!;
    const text = record.doesNotEstablish.join(" ").toLowerCase();
    expect(text).toContain("healthier");
    expect(text).toMatch(/certification .*real|real, current/);
  });

  it("refuses to record a claim the source cannot speak to", () => {
    // Not a weak record — no record. Storing it would invite a later reader to
    // use it, and the whole point is that it may not be used.
    expect(
      researchedClaim({
        claim: "This product is good for your skin",
        claimKind: "HEALTH_EFFECT",
        sourceType: "MANUFACTURER",
        sourceName: "Bayer",
      }),
    ).toBeNull();

    expect(
      researchedClaim({
        claim: "Certified organic",
        claimKind: "CERTIFICATION_VALID",
        sourceType: "RETAILER",
        sourceName: "Carrefour",
      }),
    ).toBeNull();
  });
});

/* ── corroboration ──────────────────────────────────────────────────────── */

describe("corroboration requires a different kind of source", () => {
  const manufacturer = researchedClaim({
    claim: "100 ml",
    claimKind: "PRODUCT_SIZE",
    sourceType: "MANUFACTURER",
    sourceName: "OGX",
  })!;

  it("is not satisfied by another source of the same kind", () => {
    const anotherManufacturerPage = researchedClaim({
      claim: "100 ml",
      claimKind: "PRODUCT_SIZE",
      sourceType: "MANUFACTURER",
      sourceName: "OGX regional site",
    })!;
    expect(isIndependentlyCorroborated(manufacturer, [anotherManufacturerPage])).toBe(false);
  });

  it("is satisfied by a source with different independence", () => {
    const retailer = researchedClaim({
      claim: "100 ml",
      claimKind: "PRODUCT_SIZE",
      sourceType: "RETAILER",
      sourceName: "Carrefour UAE",
    })!;
    expect(isIndependentlyCorroborated(manufacturer, [retailer])).toBe(true);
  });

  it("does not count a source speaking about a different claim", () => {
    const priceFromRetailer = researchedClaim({
      claim: "AED 39.00",
      claimKind: "PRICE",
      sourceType: "RETAILER",
      sourceName: "Carrefour UAE",
    })!;
    expect(isIndependentlyCorroborated(manufacturer, [priceFromRetailer])).toBe(false);
  });
});

/* ── the matrix as a whole ──────────────────────────────────────────────── */

describe("the capability matrix is complete and honest", () => {
  it("answers for every source and every claim", () => {
    for (const source of SOURCE_TYPES) {
      for (const claim of CLAIM_KINDS) {
        const level = authorityFor(source as SourceType, claim as ClaimKind);
        expect(AUTHORITY_LEVELS, `${source}/${claim}`).toContain(level);
      }
    }
  });

  it("gives every source type an independence", () => {
    for (const source of SOURCE_TYPES) {
      expect(INDEPENDENCE_OF[source as SourceType], source).toBeTruthy();
    }
  });

  it("writes a specific sentence for what each source establishes", () => {
    // Never a generic "this is evidence". The reader should be able to tell
    // what kind of thing they are being shown.
    expect(establishes("MANUFACTURER", "INGREDIENTS")).toMatch(/declares/i);
    expect(establishes("OPEN_DATABASE", "NUTRITION")).toMatch(/corroboration/i);
    expect(establishes("CERTIFICATION_REGISTRY", "CERTIFICATION_VALID")).toMatch(/settled/i);
    expect(establishes("MANUFACTURER", "HEALTH_EFFECT")).toMatch(/nothing/i);
  });

  it("never lets a commercial party be the one to verify something", () => {
    for (const source of ["MANUFACTURER", "RETAILER"] as SourceType[]) {
      for (const claim of CLAIM_KINDS) {
        const state = epistemicStateFor(source, claim as ClaimKind);
        if (state) expect(state, `${source}/${claim}`).toBe("CLAIMED_BY_SOURCE");
      }
    }
  });
});
