/**
 * RUBRIC.md §5 — Additives.
 *
 * The table is data, so these tests are mostly about the table being what the
 * sources say and about nothing creeping into it uncited.
 */

import { describe, expect, it } from "vitest";
import {
  FLAGGED_ADDITIVES,
  SWEETENERS,
  assessAdditives,
  flagFor,
  isSweetener,
  normaliseAdditiveCode,
} from "../../lib/health/additives";

describe("E-number normalisation", () => {
  it("keeps a letter suffix, which names a distinct substance", () => {
    expect(normaliseAdditiveCode("E150D")).toBe("E150d");
    expect(normaliseAdditiveCode("E960A")).toBe("E960a");
  });

  it("drops a roman-numeral suffix, which names a specification variant", () => {
    expect(normaliseAdditiveCode("E331III")).toBe("E331");
    expect(normaliseAdditiveCode("E331")).toBe("E331");
  });

  it("tolerates the punctuation and spacing open databases use", () => {
    expect(normaliseAdditiveCode(" e-338 ")).toBe("E338");
    expect(normaliseAdditiveCode("E 450")).toBe("E450");
  });

  it("returns a non-E-number unchanged so it simply matches nothing", () => {
    expect(normaliseAdditiveCode("E14XX")).toBe("E14XX");
    expect(flagFor("E14XX")).toBeNull();
    expect(isSweetener("E14XX")).toBe(false);
  });
});

describe("A6 — every flagged row cites a retrieved tier-1 instrument", () => {
  it("has a source, a tier and a verbatim basis on every row", () => {
    expect(FLAGGED_ADDITIVES.length).toBeGreaterThan(0);
    for (const row of FLAGGED_ADDITIVES) {
      expect(row.source).toMatch(/^S\d+ —/);
      expect(row.tier).toBe(1);
      expect(row.basis.length).toBeGreaterThan(20);
      expect(row.rule).toMatch(/^A6\.\d$/);
      expect(row.codes.length).toBeGreaterThan(0);
    }
  });

  it("only cites sources that SOURCES.md records as retrieved", () => {
    const retrieved = new Set(["S16", "S17", "S18", "S19", "S20", "S21", "S22"]);
    for (const row of FLAGGED_ADDITIVES) {
      expect(retrieved.has(row.source.split(" ")[0])).toBe(true);
    }
    // JECFA and IARC were not retrieved (SOURCES §3) and must not appear.
    const all = FLAGGED_ADDITIVES.map((r) => `${r.source} ${r.basis}`).join(" ");
    expect(all).not.toMatch(/JECFA|IARC/i);
  });

  it("A6.1 — the six colours carrying the EU attention warning", () => {
    for (const code of ["E102", "E104", "E110", "E122", "E124", "E129"]) {
      const flag = flagFor(code);
      expect(flag?.rule).toBe("A6.1");
      expect(flag?.effect).toBe("fail");
    }
  });

  it("A6.2 — titanium dioxide fails on EFSA's withdrawn safety conclusion", () => {
    expect(flagFor("E171")?.effect).toBe("fail");
    expect(flagFor("E171")?.basis).toMatch(/no longer be considered safe/);
  });

  it("A6.3 — phosphates fail on the EFSA exposure finding", () => {
    expect(flagFor("E338")?.rule).toBe("A6.3");
    expect(flagFor("E452")?.effect).toBe("fail");
  });

  it("A6.4 — aspartame fails on the phenylalanine warning", () => {
    expect(flagFor("E951")?.effect).toBe("fail");
    expect(flagFor("E962")?.effect).toBe("fail");
  });

  it("A6.5, A6.6 — a flag whose trigger is an unmeasurable concentration is a note", () => {
    for (const code of ["E420", "E421", "E953", "E965", "E966", "E967", "E968", "E958"]) {
      const flag = flagFor(code);
      expect(flag?.effect).toBe("note");
      expect(flag?.unmeasurable).toBeTruthy();
    }
  });
});

describe("§5.5 — the sweetener list", () => {
  it("is the EU authorised list, as retrieved", () => {
    for (const code of ["E950", "E951", "E954", "E955", "E960a", "E969", "E420"]) {
      expect(isSweetener(code)).toBe(true);
    }
    expect(isSweetener("E330")).toBe(false);
    expect(isSweetener("E440")).toBe(false);
  });

  it("cites a retrieved instrument for every entry", () => {
    for (const list of SWEETENERS) {
      expect(list.source).toMatch(/^S2[012] —/);
      expect(list.tier).toBe(1);
    }
  });

  it("records the E 964 gap by simply not claiming it", () => {
    // SOURCES §3: Reg 1049/2012 returned no extractable content.
    expect(isSweetener("E964")).toBe(false);
  });
});

describe("assessAdditives — the classification a check reads", () => {
  it("separates failing flags, note flags and sweeteners", () => {
    const a = assessAdditives(["E330", "E338", "E420", "E960A"]);
    expect(a.failing.map((f) => f.code)).toEqual(["E338"]);
    expect(a.flaggedNotes.map((f) => f.code)).toEqual(["E420"]);
    expect(a.sweeteners).toEqual(["E420", "E960a"]);
  });

  it("finds nothing to fail in a list of ordinary authorised additives", () => {
    // A4: a product does not fail for containing an authorised additive.
    const a = assessAdditives(["E202", "E270", "E330", "E440", "E418", "E300", "E296"]);
    expect(a.failing).toEqual([]);
    expect(a.codes).toHaveLength(7);
  });

  it("canonicalises before matching, so E331III is E331", () => {
    expect(assessAdditives(["E331III"]).codes).toEqual(["E331"]);
  });

  it("returns empty results for an empty list without inventing a pass", () => {
    const a = assessAdditives([]);
    expect(a).toEqual({ codes: [], failing: [], flaggedNotes: [], sweeteners: [] });
  });
});
