/**
 * How many products is this photograph about?
 *
 * A camera does not crop to intent. Someone photographing one pot on a shelf
 * captures the four beside it; someone photographing two items to compare them
 * captures the same scene. The image cannot tell those apart, so where more
 * than one product is readable the answer is to ask, not to pick whichever is
 * nearest the middle.
 *
 * A real photograph proved this was needed: two cosmetics lying side by side,
 * both plainly readable, and the identification reported only one of them with
 * no signal that a second existed. It ended safely only because neither was in
 * the catalogue.
 */

import { describe, expect, it } from "vitest";
import {
  SCENE_LABEL,
  SCENE_STATES,
  fingerprint,
  sceneOf,
  scenePermitsAnalysis,
  type SceneMultiplicity,
} from "@/lib/pipeline/identity";

const PRODUCT = {
  id: "p1",
  barcode: "6291030006429",
  brand: "AL RAWABI",
  name: "Greek Yoghurt Plain",
  sizeLabel: "360 g",
};

/* ── 1. One clear product ───────────────────────────────────────────────── */

describe("1: a single clear product proceeds normally", () => {
  it("reads one visible package with nothing else listed as SINGLE_PRODUCT", () => {
    expect(sceneOf({ distinctProductsVisible: 1, otherProducts: [] })).toBe("SINGLE_PRODUCT");
  });

  it("permits analysis", () => {
    expect(scenePermitsAnalysis("SINGLE_PRODUCT")).toBe(true);
  });
});

/* ── 2 & 6. Two clearly visible products ────────────────────────────────── */

describe("2/6: two visible products never silently become one verdict", () => {
  it("reads two readable packages as MULTIPLE_PRODUCTS", () => {
    // The real two-products.jpg: a Lancome liner and a Clinique sunscreen side
    // by side, both legible.
    expect(
      sceneOf({
        distinctProductsVisible: 2,
        otherProducts: [{ name: "UV Solutions mattifying SPF 50", brand: "Clinique" }],
      }),
    ).toBe("MULTIPLE_PRODUCTS");
  });

  it("blocks analysis", () => {
    expect(scenePermitsAnalysis("MULTIPLE_PRODUCTS")).toBe(false);
  });

  it("blocks a shelf photograph too, however many are on it", () => {
    const shelf = sceneOf({
      distinctProductsVisible: 6,
      otherProducts: [
        { name: "Greek Yoghurt Low Fat", brand: "nada" },
        { name: "Laban", brand: "Almarai" },
        { name: "Zabadi", brand: "Almarai" },
      ],
    });
    expect(shelf).toBe("MULTIPLE_PRODUCTS");
    expect(scenePermitsAnalysis(shelf)).toBe(false);
  });
});

/* ── 3. Two variants of one family ──────────────────────────────────────── */

describe("3: two variants of the same product family are still two products", () => {
  it("does not treat a shared brand as a single product", () => {
    // 160 g and 360 g of the same yoghurt. The brand is identical, which is
    // exactly why counting brands rather than packages would be wrong.
    const scene = sceneOf({
      distinctProductsVisible: 2,
      otherProducts: [{ name: "Greek Yoghurt Plain 160 g", brand: "AL RAWABI" }],
    });
    expect(scene).toBe("MULTIPLE_PRODUCTS");
    expect(scenePermitsAnalysis(scene)).toBe(false);
  });
});

/* ── 4. Incidental neighbours ───────────────────────────────────────────── */

describe("4: incidental neighbours do not block the product in hand", () => {
  it("proceeds when nothing else was readable enough to count", () => {
    // Case B is settled at the vision step: the model counts only packages
    // substantially visible, so a pack cropped at the frame edge or blurred in
    // the background never arrives here as a rival. When it reports one, the
    // scene is single and the photo proceeds.
    expect(sceneOf({ distinctProductsVisible: 1, otherProducts: [] })).toBe("SINGLE_PRODUCT");
  });
});

/* ── 5. Only one of several is in the catalogue ─────────────────────────── */

describe("5: being the only catalogued product does not make it the intended one", () => {
  it("is blocked by the scene before any catalogue lookup happens", () => {
    // The gate runs BEFORE matching, so "which of these do we happen to have
    // data for" never becomes the tiebreak. Convenience is not intent.
    const scene = sceneOf({
      distinctProductsVisible: 2,
      otherProducts: [{ name: "Something we have never heard of", brand: null }],
    });
    expect(scenePermitsAnalysis(scene)).toBe(false);
  });
});

/* ── disagreement between the two signals ───────────────────────────────── */

describe("a count that disagrees with the list is itself the finding", () => {
  it("treats 'several, but none listed' as unclear rather than picking one", () => {
    expect(sceneOf({ distinctProductsVisible: 3, otherProducts: [] })).toBe("UNCLEAR_MULTIPLE");
  });

  it("treats 'one, but another listed' as unclear too", () => {
    expect(
      sceneOf({ distinctProductsVisible: 1, otherProducts: [{ name: "Another pack", brand: null }] }),
    ).toBe("UNCLEAR_MULTIPLE");
  });

  it("blocks analysis when unclear", () => {
    expect(scenePermitsAnalysis("UNCLEAR_MULTIPLE")).toBe(false);
  });

  it("defaults a missing or nonsensical count to a single product", () => {
    // A model that says nothing about the scene has told us nothing, and the
    // safe reading of nothing is the ordinary case — an unreadable scene
    // produces no usable identification anyway.
    expect(sceneOf({ distinctProductsVisible: 0, otherProducts: [] })).toBe("SINGLE_PRODUCT");
    expect(sceneOf({ distinctProductsVisible: NaN, otherProducts: [] })).toBe("SINGLE_PRODUCT");
  });
});

/* ── the scene is part of the identity, not context around it ───────────── */

describe("the fingerprint binds the scene to the product", () => {
  it("differs for the same product seen in a different scene", () => {
    // A verdict reached because ONE product was in frame is not the same claim
    // as the same verdict reached while a second sat beside it.
    const single = fingerprint(PRODUCT, "SINGLE_PRODUCT");
    const multiple = fingerprint(PRODUCT, "MULTIPLE_PRODUCTS");
    const unclear = fingerprint(PRODUCT, "UNCLEAR_MULTIPLE");
    expect(new Set([single, multiple, unclear]).size).toBe(3);
  });

  it("is stable for the same product and the same scene", () => {
    expect(fingerprint(PRODUCT, "SINGLE_PRODUCT")).toBe(fingerprint({ ...PRODUCT }, "SINGLE_PRODUCT"));
  });

  it("defaults to the single-product scene so existing callers are unchanged", () => {
    expect(fingerprint(PRODUCT)).toBe(fingerprint(PRODUCT, "SINGLE_PRODUCT"));
  });
});

describe("every scene state is named and readable", () => {
  it("has a label for each", () => {
    for (const state of SCENE_STATES) {
      expect(SCENE_LABEL[state as SceneMultiplicity], state).toBeTruthy();
    }
  });

  it("permits exactly one of them to carry a verdict", () => {
    const permitted = SCENE_STATES.filter((s) => scenePermitsAnalysis(s as SceneMultiplicity));
    expect(permitted).toEqual(["SINGLE_PRODUCT"]);
  });
});
