/**
 * The evidence architecture — one test per distinction it exists to preserve.
 *
 * Every test here protects a sentence a shopper might read. If a test fails,
 * the product is about to tell someone something it cannot support.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CERTIFICATION_STATES,
  CERTIFICATION_RANK,
  CERTIFICATION_LABEL,
  STATE_MEANING,
  type CertificationState,
} from "@/lib/health/certification";
import {
  CATEGORY_EVIDENCE,
  EVIDENCE_SOURCES,
  REJECTED_SOURCES,
  capStateForSource,
  integratedSourcesFor,
  planFor,
} from "@/lib/evidence/registry";
import { describeAll, describeLookup, uaeConformityLookup } from "@/lib/evidence/lookups";
import { CATEGORY_RULES } from "@/lib/health/categories";
import type { Basis } from "@/lib/health/categories/types";

const NOW = new Date("2026-09-21T00:00:00.000Z");

function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "e1",
    productId: "p1",
    sourceKey: "MOIAT",
    claim: "UAE_CONFORMITY",
    state: "NOT_FOUND",
    queriedValue: "6291001000012",
    exactMatches: 0,
    brandMatches: 0,
    succeeded: true,
    referenceNumber: null,
    validFrom: null,
    validUntil: null,
    sourceName: "MOIAT Conformity Register",
    sourceUrl: "https://moiat.gov.ae/en/open-data/product-conformity-data",
    retrievedAt: NOW,
    rawProvenance: null,
    ...over,
  } as never;
}

/* ── states ─────────────────────────────────────────────────────────────── */

describe("the six verification states are explicit and distinct", () => {
  it("defines exactly the six states, including CLAIM_ONLY", () => {
    expect([...CERTIFICATION_STATES].sort()).toEqual(
      ["BRAND_LEVEL_ONLY", "CLAIM_ONLY", "EXPIRED", "NOT_FOUND", "UNKNOWN", "VERIFIED"],
    );
  });

  it("gives every state a machine-readable meaning", () => {
    for (const s of CERTIFICATION_STATES) {
      expect(STATE_MEANING[s], s).toBeTruthy();
    }
    expect(STATE_MEANING.VERIFIED).toContain("EXACT_PRODUCT_MATCH");
    expect(STATE_MEANING.BRAND_LEVEL_ONLY).toContain("NOT_EXACT_PRODUCT");
    expect(STATE_MEANING.NOT_FOUND).toBe("NO_RECORD_IN_THIS_SOURCE");
    expect(STATE_MEANING.CLAIM_ONLY).toContain("WITHOUT_AUTHORITATIVE_VERIFICATION");
  });

  it("never equates NOT_FOUND with being uncertified, in any label", () => {
    for (const s of CERTIFICATION_STATES) {
      const label = CERTIFICATION_LABEL[s].toLowerCase();
      expect(label, s).not.toMatch(/\bnot certified\b|\buncertified\b/);
    }
    // And NOT_FOUND names a source rather than making a claim about the product.
    expect(CERTIFICATION_LABEL.NOT_FOUND).toMatch(/source|register/i);
  });

  it("ranks a claim below a registry record and far below exact verification", () => {
    expect(CERTIFICATION_RANK.CLAIM_ONLY).toBeLessThan(CERTIFICATION_RANK.BRAND_LEVEL_ONLY);
    expect(CERTIFICATION_RANK.CLAIM_ONLY).toBeLessThan(CERTIFICATION_RANK.VERIFIED);
    expect(CERTIFICATION_RANK.CLAIM_ONLY).toBeGreaterThan(CERTIFICATION_RANK.UNKNOWN);
    expect(CERTIFICATION_RANK.EXPIRED).toBeLessThan(CERTIFICATION_RANK.NOT_FOUND);
  });

  it("treats NOT_FOUND and UNKNOWN as different facts", () => {
    expect(CERTIFICATION_LABEL.NOT_FOUND).not.toBe(CERTIFICATION_LABEL.UNKNOWN);
    expect(STATE_MEANING.NOT_FOUND).not.toBe(STATE_MEANING.UNKNOWN);
  });
});

/* ── multi-source ───────────────────────────────────────────────────────── */

describe("a product holds independent evidence per source and per claim", () => {
  const lookups = [
    row({ claim: "UAE_CONFORMITY", state: "VERIFIED", referenceNumber: "UAE.C-1", exactMatches: 1 }),
    row({ claim: "HALAL", state: "NOT_FOUND" }),
    row({ claim: "ORGANIC", state: "BRAND_LEVEL_ONLY", brandMatches: 3 }),
  ];

  it("keeps three different answers for one product rather than one verdict", () => {
    const described = describeAll(lookups);
    expect(described.map((d) => d.state)).toEqual(["VERIFIED", "NOT_FOUND", "BRAND_LEVEL_ONLY"]);
  });

  it("names the source in every sentence, so no claim floats free of its register", () => {
    for (const d of describeAll(lookups)) {
      if (d.state === "CLAIM_ONLY") continue;
      expect(d.sentence, d.claim).toMatch(/MOIAT/);
    }
  });

  it("says 'no record found in <source>', never 'not certified'", () => {
    const d = describeLookup(row({ claim: "UAE_CONFORMITY", state: "NOT_FOUND" }));
    expect(d.sentence).toBe("UAE conformity: no record found in MOIAT Conformity Register");
    expect(d.sentence.toLowerCase()).not.toContain("not certified");
  });

  it("does not let one claim's absence say anything about another claim", () => {
    const described = describeAll(lookups);
    const halal = described.find((d) => d.claim === "HALAL")!;
    // Strip the source's own name before looking for cross-claim leakage — the
    // register is called the "Conformity Register", and naming it is correct.
    const withoutSource = halal.sentence.replace(/MOIAT Conformity Register/g, "");
    expect(withoutSource).not.toMatch(/organic|conformity/i);
  });

  it("reads the UAE conformity answer specifically, not whichever row came first", () => {
    const evidence = uaeConformityLookup(lookups);
    expect(evidence?.exactMatches).toBe(1);
    const noneForUae = uaeConformityLookup([row({ claim: "ORGANIC" })]);
    expect(noneForUae).toBeNull();
  });

  it("carries provenance on every record: reference, source, url and retrieval date", () => {
    const d = describeLookup(
      row({ state: "VERIFIED", referenceNumber: "UAE.C-1234", exactMatches: 1 }),
    );
    expect(d.referenceNumber).toBe("UAE.C-1234");
    expect(d.sourceUrl).toMatch(/moiat/i);
    expect(d.retrievedAt).toEqual(NOW);
    expect(d.sentence).toContain("UAE.C-1234");
  });
});

describe("state-specific wording", () => {
  const cases: [CertificationState, RegExp][] = [
    ["VERIFIED", /VERIFIED for this exact product/],
    ["BRAND_LEVEL_ONLY", /brand appears .*this product does not/],
    ["EXPIRED", /no longer valid/],
    ["NOT_FOUND", /no record found in/],
    ["UNKNOWN", /not checked against/],
    ["CLAIM_ONLY", /claimed on the pack, not confirmed/],
  ];
  for (const [state, pattern] of cases) {
    it(`${state} reads as what it is`, () => {
      expect(describeLookup(row({ state })).sentence).toMatch(pattern);
    });
  }

  it("never lets a brand record be phrased as a product certification", () => {
    const s = describeLookup(row({ state: "BRAND_LEVEL_ONLY" })).sentence;
    expect(s).not.toMatch(/this product is certified|verified for this product/i);
  });
});

/* ── the source registry ────────────────────────────────────────────────── */

describe("the source registry encodes what each source can actually do", () => {
  it("caps a source that cannot address an exact product at BRAND_LEVEL_ONLY", () => {
    // USDA lists operations. It may never produce VERIFIED, whatever it returns.
    expect(capStateForSource("VERIFIED", "USDA_NOP")).toBe("BRAND_LEVEL_ONLY");
    expect(capStateForSource("VERIFIED", "EU_ORGANIC_TRACES")).toBe("BRAND_LEVEL_ONLY");
    expect(capStateForSource("VERIFIED", "COSMOS")).toBe("BRAND_LEVEL_ONLY");
  });

  it("caps a non-registry at CLAIM_ONLY — a pack claim can never be VERIFIED", () => {
    expect(capStateForSource("VERIFIED", "MANUFACTURER_CLAIM")).toBe("CLAIM_ONLY");
    expect(capStateForSource("BRAND_LEVEL_ONLY", "MANUFACTURER_CLAIM")).toBe("CLAIM_ONLY");
    // But an honest "we could not check" stays what it is.
    expect(capStateForSource("UNKNOWN", "MANUFACTURER_CLAIM")).toBe("UNKNOWN");
  });

  it("lets a GTIN-addressable authoritative register reach VERIFIED", () => {
    expect(capStateForSource("VERIFIED", "MOIAT")).toBe("VERIFIED");
    expect(capStateForSource("VERIFIED", "EU_ECOLABEL")).toBe("VERIFIED");
  });

  it("returns UNKNOWN for a source it has never heard of, rather than trusting it", () => {
    expect(capStateForSource("VERIFIED", "SOME_BLOG")).toBe("UNKNOWN");
  });

  it("states a verification rule and a limitation for every source", () => {
    for (const [key, s] of Object.entries(EVIDENCE_SOURCES)) {
      expect(s.verificationRule, key).toBeTruthy();
      expect(s.limitations, key).toBeTruthy();
      expect(s.authority, key).toBeTruthy();
      // canVerifyExactProduct must follow from granularity, not be set by hand.
      expect(s.canVerifyExactProduct, key).toBe(s.granularity === "EXACT_PRODUCT");
    }
  });

  it("gives a reason for every deliberately rejected source", () => {
    expect(REJECTED_SOURCES.length).toBeGreaterThan(0);
    for (const r of REJECTED_SOURCES) expect(r.reason.length, r.name).toBeGreaterThan(30);
  });

  it("only asks integrated sources today, and MOIAT is one of them", () => {
    const keys = integratedSourcesFor("fats_oils").map((s) => s.key);
    expect(keys).toContain("MOIAT");
    expect(keys).not.toContain("USDA_NOP");
  });

  it("plans evidence for every category the rubric supports", () => {
    for (const category of Object.keys(CATEGORY_RULES)) {
      const plan = planFor(category as never);
      expect(plan, category).not.toBeNull();
      expect(plan!.claims.length, category).toBeGreaterThan(0);
    }
  });

  it("records that EU Ecolabel is not integrated, and why", () => {
    const eco = EVIDENCE_SOURCES.EU_ECOLABEL;
    expect(eco.integrated).toBe(false);
    expect(eco.limitations).toMatch(/EXCLUDES FOOD/i);
  });

  it("says plainly where a category has no verifiable certification", () => {
    const oils = CATEGORY_EVIDENCE.find((c) => c.category === "fats_oils")!;
    expect(oils.note).toMatch(/no verifiable quality or grade certification/i);
  });
});

/* ── threshold wording (Phase 10 audit, made permanent) ─────────────────── */

describe("no category line can call a threshold 'low' without evidence", () => {
  it("every nutrient line is two-band or carries explicit single-line wording", () => {
    const unsafe: string[] = [];
    for (const rule of Object.values(CATEGORY_RULES)) {
      for (const basis of ["solid", "liquid"] as Basis[]) {
        let lines: Record<string, { low?: unknown; singleLine?: unknown }>;
        try {
          lines = rule.lines(basis) as never;
        } catch {
          continue;
        }
        for (const [key, line] of Object.entries(lines)) {
          if (!line || typeof line !== "object") continue;
          const hasLow = line.low !== undefined && line.low !== null;
          if (!hasLow && !line.singleLine) unsafe.push(`${rule.key}/${basis}/${key}`);
        }
      }
    }
    // A single-band line says "the applicable line for X is N", never "low".
    expect(unsafe, `lines that could wrongly read as "low": ${unsafe.join(", ")}`).toEqual([]);
  });
});

/* ── the price-priority weighting ───────────────────────────────────────── */

describe("the field list is ordered by what it unlocks, not by staleness", () => {
  it("produces no prices of its own — only an ordering", async () => {
    // The guard that matters. This module exists to say WHICH products to check;
    // if it ever returned a number that looked like a price, that number would
    // have been invented, and an invented price is the one thing Noura may
    // never show.
    const source = readFileSync("lib/retail/priority.ts", "utf8");
    expect(source).not.toMatch(/priceFils|priceAed|price:\s*\d/);
    expect(source).not.toMatch(/createMany|\.create\(|\.update\(|upsert/);
  });

  it("says in its own documentation how a price may enter", () => {
    const source = readFileSync("lib/retail/priority.ts", "utf8");
    expect(source).toMatch(/ListingCheck/);
    expect(source).toMatch(/person records/i);
  });
});
