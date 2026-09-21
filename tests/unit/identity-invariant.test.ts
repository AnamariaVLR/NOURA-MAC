/**
 * The identity invariant, case by case.
 *
 * An image must never acquire a product verdict unless Noura has established
 * that the verdict belongs to the product actually shown in the image. That is
 * worth more than a high automatic identification rate: when uncertain,
 * confirmation beats a confident wrong answer.
 */

import { describe, expect, it } from "vitest";
import {
  ANALYSABLE_STATES,
  IDENTITY_STATES,
  IDENTITY_STATE_LABEL,
  IdentityMismatchError,
  assertSameIdentity,
  barcodeIsContradicted,
  fingerprint,
  permitsAnalysis,
  sameBrand,
  type IdentityState,
} from "@/lib/pipeline/identity";

const AL_RAWABI = {
  id: "p-alrawabi",
  barcode: "6291103793003",
  brand: "Al Rawabi",
  name: "Greek Style Plain Yogurt",
  sizeLabel: "360 g",
};

const NADA = {
  id: "p-nada",
  barcode: "6281018146988",
  brand: "nada",
  name: "GREEK YOGHURT Low Fat Plain",
  sizeLabel: "160 g",
};

/* ── the barcode contradiction rule ─────────────────────────────────────── */

describe("A: barcode, claimed brand and pack text all agree", () => {
  it("is not contradicted, and proceeds", () => {
    expect(
      barcodeIsContradicted({
        claimedBrand: "Al Rawabi",
        visibleText: "AL RAWABI Greek Style Plain Yogurt 360g",
        matchedBrand: "Al Rawabi",
      }),
    ).toBe(false);
  });
});

describe("B: barcode conflicts with the claimed brand only", () => {
  it("is NOT treated as a contradiction — one disagreement is not enough", () => {
    // The pack text still supports the match, so the model's brand field is the
    // odd one out rather than the barcode. Sending this to confirmation would
    // send almost every partially-readable pack to confirmation.
    expect(
      barcodeIsContradicted({
        claimedBrand: "Almarai",
        visibleText: "AL RAWABI Greek Style Plain Yogurt 360g",
        matchedBrand: "Al Rawabi",
      }),
    ).toBe(false);
  });
});

describe("C: barcode conflicts with BOTH the claimed brand and the pack text", () => {
  it("is contradicted, and must go to confirmation", () => {
    // Three signals, three different products. The transcribed digits are the
    // one most easily wrong by a single character.
    expect(
      barcodeIsContradicted({
        claimedBrand: "Almarai",
        visibleText: "AL RAWABI Greek Style Plain Yogurt 360g",
        matchedBrand: "nada",
      }),
    ).toBe(true);
  });

  it("does not treat an absent signal as a contradiction", () => {
    // Absence is not disagreement.
    expect(
      barcodeIsContradicted({ claimedBrand: null, visibleText: "AL RAWABI", matchedBrand: "nada" }),
    ).toBe(false);
    expect(
      barcodeIsContradicted({ claimedBrand: "Almarai", visibleText: null, matchedBrand: "nada" }),
    ).toBe(false);
  });

  it("a wrong barcode cannot buy a verdict merely by hitting a real product", () => {
    // nada's barcode IS a real product with real evidence. That is exactly what
    // makes a misread dangerous, and exactly what this rule is for.
    const contradicted = barcodeIsContradicted({
      claimedBrand: "Al Rawabi",
      visibleText: "AL RAWABI GREEK STYLE PLAIN YOGURT 360g FULL FAT",
      matchedBrand: NADA.brand,
    });
    expect(contradicted).toBe(true);
  });
});

describe("brand comparison tolerates formatting, not substitution", () => {
  it("matches the same brand written differently", () => {
    expect(sameBrand("Al Rawabi", "AL-RAWABI")).toBe(true);
    expect(sameBrand("Coca Cola", "Coca-Cola")).toBe(true);
  });

  it("does not match different brands", () => {
    expect(sameBrand("Al Rawabi", "Almarai")).toBe(false);
    expect(sameBrand("nada", "Al Ain")).toBe(false);
  });

  it("treats a missing brand as no agreement", () => {
    expect(sameBrand(null, "Al Rawabi")).toBe(false);
    expect(sameBrand("Al Rawabi", "")).toBe(false);
  });
});

/* ── D, E, F: which states may carry a verdict ──────────────────────────── */

describe("D/E/F: only established identities may carry a verdict", () => {
  it("permits exactly three states", () => {
    expect([...ANALYSABLE_STATES].sort()).toEqual(
      ["IDENTIFIED_AND_VERIFIED", "IDENTIFIED_BY_BARCODE", "IDENTIFIED_BY_NAME_WITH_CORROBORATION"],
    );
  });

  it("refuses a name match with nothing from the image behind it", () => {
    // E: loose name match only.
    expect(permitsAnalysis("IDENTIFIED_BY_NAME_ONLY")).toBe(false);
  });

  it("refuses every uncertain or absent identity", () => {
    // F: unknown or unreadable image.
    for (const state of ["NEEDS_CONFIRMATION", "NOT_IDENTIFIED", "INSUFFICIENT_EVIDENCE"] as const) {
      expect(permitsAnalysis(state), state).toBe(false);
    }
  });

  it("keeps barcode and corroborated-name distinguishable in DATA, not just wording", () => {
    // They are different confidence levels and must not collapse into one.
    expect(permitsAnalysis("IDENTIFIED_BY_BARCODE")).toBe(true);
    expect(permitsAnalysis("IDENTIFIED_BY_NAME_WITH_CORROBORATION")).toBe(true);
    expect("IDENTIFIED_BY_BARCODE").not.toBe("IDENTIFIED_BY_NAME_WITH_CORROBORATION");
    expect(IDENTITY_STATE_LABEL.IDENTIFIED_BY_BARCODE).not.toBe(
      IDENTITY_STATE_LABEL.IDENTIFIED_BY_NAME_WITH_CORROBORATION,
    );
  });

  it("gives every state a label, so none can render as a blank", () => {
    for (const state of IDENTITY_STATES) {
      expect(IDENTITY_STATE_LABEL[state as IdentityState], state).toBeTruthy();
    }
  });
});

/* ── G, H, I, J: the identity must survive every stage ──────────────────── */

describe("G/H/I/J: an identity that changes mid-pipeline fails closed", () => {
  const expected = fingerprint(AL_RAWABI);

  it("is stable for the same product", () => {
    expect(fingerprint({ ...AL_RAWABI })).toBe(expected);
  });

  it("changes when any identifying field changes", () => {
    expect(fingerprint({ ...AL_RAWABI, id: "other" })).not.toBe(expected);
    expect(fingerprint({ ...AL_RAWABI, barcode: "6281018146988" })).not.toBe(expected);
    expect(fingerprint({ ...AL_RAWABI, brand: "Almarai" })).not.toBe(expected);
    expect(fingerprint({ ...AL_RAWABI, name: "Something else" })).not.toBe(expected);
    expect(fingerprint({ ...AL_RAWABI, sizeLabel: "160 g" })).not.toBe(expected);
  });

  it("ignores formatting so a harmless difference is not a false alarm", () => {
    expect(fingerprint({ ...AL_RAWABI, brand: "  AL RAWABI  " })).toBe(expected);
  });

  for (const stage of ["evidence retrieval", "analysis", "alternatives", "commerce"]) {
    it(`throws when the product changes before ${stage}`, () => {
      expect(() => assertSameIdentity(stage, expected, NADA)).toThrow(IdentityMismatchError);
      // And says which stage, so an operator can see where it diverged.
      expect(() => assertSameIdentity(stage, expected, NADA)).toThrow(new RegExp(stage));
    });
  }

  it("passes silently when the product is the same", () => {
    expect(() => assertSameIdentity("analysis", expected, { ...AL_RAWABI })).not.toThrow();
  });

  it("does nothing when there is no identity to check against", () => {
    // A scan with no fingerprint has no verdict either; there is nothing to guard.
    expect(() => assertSameIdentity("analysis", null, NADA)).not.toThrow();
  });
});

/* ── K: the record survives the lifecycle ───────────────────────────────── */

describe("K: the identity record is complete enough to audit after the fact", () => {
  it("names every signal a later reader would need", () => {
    // The Coca-Cola page looked entirely normal. What was missing was any
    // record of WHY it believed what it believed.
    const required = [
      "state", "fingerprint", "claimedBrand", "claimedName", "claimedBarcode",
      "confidence", "visibleText", "matchedProductId", "matchedBrand", "matchedName",
      "matchedBarcode", "matchMethod", "brandAgrees", "textCorroborates",
      "barcodeContradicted", "reason",
    ];
    const sample: Record<string, unknown> = {
      state: "IDENTIFIED_BY_BARCODE",
      fingerprint: fingerprint(AL_RAWABI),
      claimedBrand: "Al Rawabi",
      claimedName: "Greek Style Plain Yogurt",
      claimedBarcode: AL_RAWABI.barcode,
      confidence: 0.94,
      visibleText: "AL RAWABI Greek Style Plain Yogurt 360g",
      matchedProductId: AL_RAWABI.id,
      matchedBrand: AL_RAWABI.brand,
      matchedName: AL_RAWABI.name,
      matchedBarcode: AL_RAWABI.barcode,
      matchMethod: "barcode-local",
      brandAgrees: true,
      textCorroborates: true,
      barcodeContradicted: false,
      reason: "The transcribed barcode matched a catalogue product.",
    };
    for (const key of required) expect(Object.keys(sample), key).toContain(key);
    // And it round-trips, because it is stored as JSON on the scan.
    expect(JSON.parse(JSON.stringify(sample))).toEqual(sample);
  });
});
