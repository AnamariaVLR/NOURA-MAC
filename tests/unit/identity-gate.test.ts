/**
 * The identity gate: what may be acted on, and what must be asked about.
 *
 * The case this exists for is not the one that was reported. It is the one that
 * survived the reported fix:
 *
 *   a real Al Rawabi pot → the model says "Almarai Greek Yoghurt", 0.95 →
 *   Almarai Greek Yoghurt is a real product with real evidence → Noura renders
 *   immaculate research about something the shopper is not holding.
 *
 * A confidence number cannot catch that, because the number is the thing that
 * is wrong. A second independent signal from the same image can.
 */

import { describe, expect, it } from "vitest";
import {
  basisPermitsAnalysis,
  brandCorroborated,
  identityBasis,
  type IdentityBasis,
} from "@/lib/pipeline/match";

describe("brand corroboration reads the pack, not the conclusion", () => {
  it("accepts a brand that appears in the transcribed text", () => {
    expect(brandCorroborated("AL RAWABI Greek Yoghurt 360g FULL FAT", "Al Rawabi")).toBe(true);
  });

  it("ignores case, spacing and punctuation", () => {
    expect(brandCorroborated("al-rawabi greek yoghurt", "AL RAWABI")).toBe(true);
    expect(brandCorroborated("Coca‑Cola 330ml", "Coca Cola")).toBe(true);
  });

  it("REFUSES a brand the pack never mentions — the whole point", () => {
    // The pack says Al Rawabi. The model concluded Almarai. Whatever its
    // confidence, its own transcription contradicts it.
    expect(brandCorroborated("AL RAWABI Greek Yoghurt 360g", "Almarai")).toBe(false);
  });

  it("refuses a partial brand match", () => {
    // Half the dairy brands in the UAE begin with "Al".
    expect(brandCorroborated("AL AIN water 500ml", "Al Rawabi")).toBe(false);
  });

  it("treats missing text as missing corroboration, never as agreement", () => {
    expect(brandCorroborated(null, "Al Rawabi")).toBe(false);
    expect(brandCorroborated("", "Al Rawabi")).toBe(false);
    expect(brandCorroborated("   ", "Al Rawabi")).toBe(false);
  });

  it("treats a missing brand the same way", () => {
    expect(brandCorroborated("AL RAWABI Greek Yoghurt", null)).toBe(false);
    expect(brandCorroborated("AL RAWABI Greek Yoghurt", "")).toBe(false);
  });
});

describe("the basis on which an identity may be acted on", () => {
  it("treats a barcode as decisive, whatever the text says", () => {
    // Digits are checkable. A wrong one is a transcription error, not a guess.
    expect(
      identityBasis({ barcode: "6291103793003", visibleText: null, matchedBrand: "Anything" }),
    ).toBe("barcode");
  });

  it("treats a corroborated name as actionable", () => {
    expect(
      identityBasis({
        barcode: null,
        visibleText: "AL RAWABI GREEK STYLE PLAIN YOGURT 360g",
        matchedBrand: "Al Rawabi",
      }),
    ).toBe("corroborated");
  });

  it("treats the user's own choice as the strongest basis of all", () => {
    expect(
      identityBasis({
        barcode: null,
        visibleText: null,
        matchedBrand: null,
        userConfirmed: true,
      }),
    ).toBe("user_confirmed");
  });

  it("marks a confident but unsupported match as uncorroborated", () => {
    expect(
      identityBasis({
        barcode: null,
        visibleText: "AL RAWABI GREEK STYLE PLAIN YOGURT 360g",
        matchedBrand: "Almarai",
      }),
    ).toBe("uncorroborated");
  });

  it("permits analysis on three bases and refuses it on the fourth", () => {
    const permitted: IdentityBasis[] = ["barcode", "corroborated", "user_confirmed"];
    for (const basis of permitted) expect(basisPermitsAnalysis(basis), basis).toBe(true);
    expect(basisPermitsAnalysis("uncorroborated")).toBe(false);
  });

  it("separates the three things that are easy to conflate", () => {
    // A model's claim, a catalogue match, and a verified identity are different
    // facts. Only the last two may carry a verdict, and a model's confidence is
    // not among the inputs at all.
    const modelWasConfidentButWrong = identityBasis({
      barcode: null,
      visibleText: "AL RAWABI",
      matchedBrand: "Almarai",
    });
    expect(modelWasConfidentButWrong).toBe("uncorroborated");
    expect(basisPermitsAnalysis(modelWasConfidentButWrong)).toBe(false);
  });
});
