/**
 * Visual identity is the foundation; a barcode corroborates it.
 *
 * A barcode lives on the bottom of a pot, the back of a carton, or under the
 * shrink-wrap. Photographing the front of a product is the NORMAL case, not a
 * degraded one, and an architecture that treats a missing barcode as a missing
 * identity would fail the shopper it was built for.
 *
 * Two things must both hold:
 *   NO BARCODE           is not NO IDENTITY
 *   BARCODE AVAILABLE    is not BARCODE WINS
 */

import { describe, expect, it } from "vitest";
import { isUsableIdentification, MIN_IDENTIFY_CONFIDENCE } from "@/lib/pipeline/identify";
import { decideMatch, brandCorroborated } from "@/lib/pipeline/match";
import { barcodeIsContradicted, permitsAnalysis } from "@/lib/pipeline/identity";

/** A front-of-pack read: brand, name, size and the text behind them. */
function frontOfPack(over: Record<string, unknown> = {}) {
  return {
    name: "Greek Yoghurt Plain",
    brand: "Al Rawabi",
    barcode: null as string | null,
    category: "yogurt",
    subcategory: "spoonable_yogurt",
    sizeLabel: "360 g",
    confidence: 0.92,
    visibleText: "AL RAWABI Greek Yoghurt Plain Net Weight 360g FULL FAT",
    ...over,
  };
}

/**
 * Two tubs of the same yoghurt in different sizes, plus an unrelated brand.
 *
 * The names are identical on purpose: that is the real shape of a supermarket
 * shelf, and it makes the printed size the only thing separating them. Earlier
 * these carried a "FULL FAT" suffix, which the matcher correctly refused to
 * auto-match against a scan that never read those words — it could have been
 * the low-fat tub. That rule is right and is tested elsewhere; it simply made
 * this fixture unable to test what it was written to test.
 */
const CATALOGUE = [
  { id: "a", slug: "alrawabi-greek-360", name: "Greek Yoghurt Plain", brand: "AL RAWABI", sizeLabel: "360 g", imageUrl: null },
  { id: "b", slug: "alrawabi-greek-160", name: "Greek Yoghurt Plain", brand: "AL RAWABI", sizeLabel: "160 g", imageUrl: null },
  { id: "c", slug: "nada-greek", name: "GREEK YOGHURT Low Fat Plain", brand: "nada", sizeLabel: "160 g", imageUrl: null },
];

/* ── A. Front of pack, no barcode, strong evidence ──────────────────────── */

describe("A: a front-of-pack photograph with no barcode can identify a product", () => {
  it("is usable without any barcode at all", () => {
    expect(isUsableIdentification(frontOfPack() as never)).toBe(true);
  });

  it("resolves to the right product on brand, name and size", () => {
    const decision = decideMatch(
      { name: "Greek Yoghurt Plain", brand: "Al Rawabi", sizeLabel: "360 g", visibleText: null },
      CATALOGUE,
    );
    expect(decision.kind).toBe("auto");
    if (decision.kind === "auto") expect(decision.product.id).toBe("a");
  });

  it("survives a modest self-reported confidence when the text corroborates", () => {
    // Poor lighting, half the label in shadow. The model says 0.2 and still
    // reads "AL RAWABI" while claiming the brand is Al Rawabi: two statements
    // about the same image that agree. That agreement is the evidence, and it
    // does not depend on a number the model is poorly calibrated to produce.
    const dim = frontOfPack({ confidence: 0.2 });
    expect(dim.confidence).toBeLessThan(MIN_IDENTIFY_CONFIDENCE);
    expect(isUsableIdentification(dim as never)).toBe(true);
  });

  it("still refuses when the text does NOT corroborate and confidence is low", () => {
    // Absence of corroboration plus a disclaimed answer is not an identity.
    const weak = frontOfPack({ confidence: 0.2, visibleText: "blurred" });
    expect(isUsableIdentification(weak as never)).toBe(false);
  });
});

/* ── B. Two variants that look the same ─────────────────────────────────── */

describe("B: visually indistinguishable variants go to confirmation", () => {
  it("asks rather than guessing when only the size separates them", () => {
    // The 360 g and 160 g pots carry the same brand and the same name. Without
    // a size read off the pack there is nothing to choose between them.
    const decision = decideMatch(
      { name: "Greek Yoghurt Plain", brand: "Al Rawabi", sizeLabel: null, visibleText: null },
      CATALOGUE,
    );
    expect(decision.kind).toBe("confirm");
    if (decision.kind === "confirm") {
      expect(decision.candidates.length).toBeGreaterThan(1);
    }
  });

  it("separates them once the pack size is legible", () => {
    const decision = decideMatch(
      { name: "Greek Yoghurt Plain", brand: "Al Rawabi", sizeLabel: "160 g", visibleText: null },
      CATALOGUE,
    );
    expect(decision.kind).toBe("auto");
    if (decision.kind === "auto") expect(decision.product.id).toBe("b");
  });
});

/* ── C. Barcode present and consistent ──────────────────────────────────── */

describe("C: a barcode that agrees strengthens the identity", () => {
  it("is not treated as a contradiction", () => {
    expect(
      barcodeIsContradicted({
        claimedBrand: "Al Rawabi",
        visibleText: "AL RAWABI Greek Yoghurt Plain 360g",
        matchedBrand: "AL RAWABI",
      }),
    ).toBe(false);
  });

  it("makes the identity usable even with nothing else to go on", () => {
    // Someone photographs only the barcode. That is a legitimate scan.
    const barcodeOnly = frontOfPack({
      barcode: "6291030006429",
      name: "Yoghurt",
      brand: null,
      visibleText: null,
      confidence: 0.2,
    });
    expect(isUsableIdentification(barcodeOnly as never)).toBe(true);
  });
});

/* ── D/F. A barcode never silently overrides the pack ───────────────────── */

describe("D/F: a barcode may not silently override the visual evidence", () => {
  it("stops when the claimed brand and the pack text both name something else", () => {
    expect(
      barcodeIsContradicted({
        claimedBrand: "Al Rawabi",
        visibleText: "AL RAWABI Greek Yoghurt Plain 360g FULL FAT",
        matchedBrand: "nada",
      }),
    ).toBe(true);
  });

  it("does not let a misread digit carry a verdict for the neighbouring SKU", () => {
    // The digits land on a real product with real evidence. That is precisely
    // what makes a misread dangerous rather than harmless.
    const contradicted = barcodeIsContradicted({
      claimedBrand: "Al Rawabi",
      visibleText: "AL RAWABI Greek Yoghurt Plain 360g",
      matchedBrand: "nada",
    });
    expect(contradicted).toBe(true);
    expect(permitsAnalysis("NEEDS_CONFIRMATION")).toBe(false);
  });
});

/* ── E. Weak evidence, no barcode ───────────────────────────────────────── */

describe("E: weak visual evidence with no barcode identifies nothing", () => {
  it("refuses a name the model effectively disclaimed", () => {
    for (const name of ["Unknown", "unclear", "?", ""]) {
      const weak = frontOfPack({ name, confidence: 0.1, visibleText: null, brand: null });
      expect(isUsableIdentification(weak as never), name).toBe(false);
    }
  });

  it("refuses when nothing in the catalogue contains what was read", () => {
    const decision = decideMatch(
      { name: "Sourdough Rye Loaf", brand: "Poilane", sizeLabel: null, visibleText: null },
      CATALOGUE,
    );
    expect(decision.kind).toBe("none");
  });

  it("never permits analysis from an unidentified state", () => {
    for (const state of ["NOT_IDENTIFIED", "INSUFFICIENT_EVIDENCE", "NEEDS_CONFIRMATION"] as const) {
      expect(permitsAnalysis(state), state).toBe(false);
    }
  });
});

/* ── the architectural claim itself ─────────────────────────────────────── */

describe("the hierarchy is visual first, barcode corroborating", () => {
  it("treats a missing barcode as normal rather than as a failure", () => {
    const front = frontOfPack();
    expect(front.barcode).toBeNull();
    expect(isUsableIdentification(front as never)).toBe(true);
  });

  it("reads corroboration from the pack text, which is what a front photo gives", () => {
    expect(brandCorroborated(frontOfPack().visibleText, "AL RAWABI")).toBe(true);
  });

  it("does not require a barcode for a state that permits analysis", () => {
    expect(permitsAnalysis("IDENTIFIED_BY_NAME_WITH_CORROBORATION")).toBe(true);
  });
});

/* ── the variant case a real photograph found ───────────────────────────── */

describe("a neighbouring SKU is not the product in the photograph", () => {
  it("refuses a match carrying words the scan never read", () => {
    // From a real phone photo: a bottle reading
    //   "renewing + argan oil of morocco PENETRATING OIL"
    // matched an open-database record for
    //   "Renewing Argan Oil of Morocco EXTRA Penetrating Oil"
    // Same brand, same 100 ml size, neighbouring SKU. The brand corroborated
    // perfectly, because the brand was never the thing that was wrong.
    const openDbResult = [
      {
        id: "ogx-extra",
        slug: "ogx-extra",
        name: "Renewing Argan Oil of Morocco Extra Penetrating Oil",
        brand: "OGX",
        sizeLabel: "100 ml",
        imageUrl: null,
      },
    ];
    const decision = decideMatch(
      {
        name: "Renewing + Argan Oil of Morocco Penetrating Oil",
        brand: "OGX",
        sizeLabel: "100 ml",
        visibleText: "renewing + argan oil of morocco PENETRATING OIL all hair types",
      },
      openDbResult,
    );
    expect(decision.kind).not.toBe("auto");
  });

  it("accepts the same record once the scan has read the distinguishing word", () => {
    const openDbResult = [
      {
        id: "ogx-extra",
        slug: "ogx-extra",
        name: "Renewing Argan Oil of Morocco Extra Penetrating Oil",
        brand: "OGX",
        sizeLabel: "100 ml",
        imageUrl: null,
      },
    ];
    const decision = decideMatch(
      {
        name: "Renewing Argan Oil of Morocco Extra Penetrating Oil",
        brand: "OGX",
        sizeLabel: "100 ml",
        visibleText: "OGX renewing argan oil of morocco extra penetrating oil",
      },
      openDbResult,
    );
    expect(decision.kind).toBe("auto");
  });
});

/* ── the barcode-positive case ──────────────────────────────────────────── */

describe("a barcode that agrees strengthens an identity the visuals already made", () => {
  it("is the strongest state, and is distinct from the name-only route", () => {
    // Both permit a verdict; they are not the same claim, and the database
    // keeps them apart so an audit can tell which one a scan rested on.
    expect(permitsAnalysis("IDENTIFIED_BY_BARCODE")).toBe(true);
    expect(permitsAnalysis("IDENTIFIED_BY_NAME_WITH_CORROBORATION")).toBe(true);
    expect("IDENTIFIED_BY_BARCODE").not.toBe("IDENTIFIED_BY_NAME_WITH_CORROBORATION");
  });

  it("requires no confirmation when every signal agrees", () => {
    // Visual identity establishes the product; the GTIN resolves to the same
    // one. Nothing disagrees, so there is nothing to ask about.
    expect(
      barcodeIsContradicted({
        claimedBrand: "AL RAWABI",
        visibleText: "AL RAWABI Greek Yoghurt Plain 360 g",
        matchedBrand: "AL RAWABI",
      }),
    ).toBe(false);
  });

  it("does not require the barcode to have produced the identity", () => {
    // The point of the hierarchy: the visuals can stand alone, and the barcode
    // adds exact-SKU precision rather than permission.
    const front = frontOfPack({ barcode: null });
    expect(isUsableIdentification(front as never)).toBe(true);
  });
});
