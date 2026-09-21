/**
 * Commerce provenance — what we may say about a price, given where it came from.
 *
 * The failure this file exists to prevent: presenting a number read off a
 * retailer's web page as though a person had stood in the aisle and confirmed
 * it. Both are evidence. They are not the same evidence, and the wording must
 * not borrow authority across the gap.
 */

import { describe, expect, it } from "vitest";
import {
  COMMERCE_KIND_LABEL,
  availabilitySentence,
  commerceKindOf,
  isQuotableKind,
  priceSentence,
  type CommerceSourceKind,
} from "@/lib/retail/provenance";
import {
  FRESHNESS_DAYS,
  ageInDays,
  daysUntilStale,
  isFreshCheck,
  stalenessOf,
} from "@/lib/retail/freshness";

const DATE = "21 September 2026";
const NOW = new Date("2026-09-21T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

function prov(over: Partial<Parameters<typeof priceSentence>[0]> = {}) {
  return {
    kind: "MANUAL_VERIFIED" as CommerceSourceKind,
    retailerName: "Carrefour UAE",
    formattedDate: DATE,
    checkedBy: "A. Checker",
    isFresh: true,
    ageDays: 1,
    ...over,
  };
}

/* ── source kinds ───────────────────────────────────────────────────────── */

describe("every stored source maps to exactly one commerce kind", () => {
  it("maps the four recognised sources", () => {
    expect(commerceKindOf("HAND_VERIFIED")).toBe("MANUAL_VERIFIED");
    expect(commerceKindOf("RETAILER_PAGE")).toBe("RETAILER_PAGE");
    expect(commerceKindOf("RETAILER_API")).toBe("AUTOMATED_RETAILER_FEED");
  });

  it("fails closed: scaffolding and unrecognised sources are not commerce evidence", () => {
    for (const s of ["SYNTHETIC", "OPEN_DATA", "REGULATOR_IMPORT", "TYPO", "", null, undefined]) {
      expect(commerceKindOf(s as string), String(s)).toBe("UNKNOWN");
    }
    expect(isQuotableKind("UNKNOWN")).toBe(false);
  });

  it("gives every kind a distinct human label", () => {
    const labels = Object.values(COMMERCE_KIND_LABEL);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

/* ── the misattribution guard ───────────────────────────────────────────── */

describe("a price never borrows another source's authority", () => {
  it("says 'checked by hand' ONLY for a manual check", () => {
    expect(priceSentence(prov())).toBe(`Price checked by hand on ${DATE} by A. Checker`);

    for (const kind of ["RETAILER_PAGE", "AUTOMATED_RETAILER_FEED", "UNKNOWN"] as const) {
      const sentence = priceSentence(prov({ kind, checkedBy: null }));
      expect(sentence.toLowerCase(), kind).not.toContain("by hand");
      expect(sentence.toLowerCase(), kind).not.toContain("verified by");
    }
  });

  it("attributes a retailer-page price to the retailer, with the date", () => {
    expect(priceSentence(prov({ kind: "RETAILER_PAGE", checkedBy: null }))).toBe(
      `Price shown by Carrefour UAE on ${DATE}`,
    );
  });

  it("names a feed as a feed", () => {
    expect(priceSentence(prov({ kind: "AUTOMATED_RETAILER_FEED", checkedBy: null }))).toMatch(
      /product feed/i,
    );
  });

  it("never claims a person checked it when no person did", () => {
    const sentence = priceSentence(prov({ kind: "RETAILER_PAGE", checkedBy: null }));
    expect(sentence).not.toMatch(/A\. Checker/);
  });

  it("says a stale price is not recent, whatever its source", () => {
    for (const kind of ["MANUAL_VERIFIED", "RETAILER_PAGE", "AUTOMATED_RETAILER_FEED"] as const) {
      const sentence = priceSentence(prov({ kind, isFresh: false, ageDays: 40 }));
      expect(sentence, kind).toMatch(/not verified recently/i);
      expect(sentence.toLowerCase(), kind).not.toContain("by hand");
    }
  });
});

/* ── price and availability are separate facts ──────────────────────────── */

describe("availability is reported independently of price", () => {
  it("distinguishes 'nobody recorded it' from 'recorded as out of stock'", () => {
    expect(availabilitySentence(null, prov())).toMatch(/not verified recently/i);
    expect(availabilitySentence(false, prov())).toMatch(/out of stock/i);
    expect(availabilitySentence(true, prov())).toMatch(/in stock/i);
  });

  it("does not claim a shelf observation for a retailer's own stock flag", () => {
    const listed = availabilitySentence(true, prov({ kind: "RETAILER_PAGE" }));
    expect(listed).toMatch(/listed as available/i);
    expect(listed.toLowerCase()).not.toContain("in stock on");
  });

  it("says stock is unconfirmed once the check has lapsed, with its age", () => {
    const sentence = availabilitySentence(true, prov({ isFresh: false, ageDays: 40 }));
    expect(sentence).toMatch(/40 days ago/);
    expect(sentence).toMatch(/not confirmed/i);
    expect(sentence.toLowerCase()).not.toMatch(/^in stock/);
  });

  it("uses a singular day at one day old", () => {
    expect(availabilitySentence(true, prov({ isFresh: false, ageDays: 1 }))).toMatch(/1 day ago/);
  });
});

/* ── freshness boundaries ───────────────────────────────────────────────── */

describe("the freshness window has documented, tested boundaries", () => {
  it("is 14 days, as documented in DECISIONS §35", () => {
    expect(FRESHNESS_DAYS).toBe(14);
  });

  it("is fresh on the last day inside the window and stale on the boundary", () => {
    const hand = (d: number) => ({ source: "HAND_VERIFIED", checkedAt: daysAgo(d) });
    expect(isFreshCheck(hand(0), NOW)).toBe(true);
    expect(isFreshCheck(hand(FRESHNESS_DAYS - 1), NOW)).toBe(true);
    // Exactly 14 days old is OUT: the rule is "< FRESHNESS_DAYS".
    expect(isFreshCheck(hand(FRESHNESS_DAYS), NOW)).toBe(false);
    expect(isFreshCheck(hand(FRESHNESS_DAYS + 1), NOW)).toBe(false);
  });

  it("never ages a check up: 13.9 days old is 13 days old", () => {
    const almost = new Date(NOW.getTime() - (13.9 * 24 * 60 * 60 * 1000));
    expect(ageInDays(almost, NOW)).toBe(13);
    expect(isFreshCheck({ source: "HAND_VERIFIED", checkedAt: almost }, NOW)).toBe(true);
  });

  it("treats a future-dated check as zero days old rather than negative", () => {
    const future = new Date(NOW.getTime() + 5 * 24 * 60 * 60 * 1000);
    expect(ageInDays(future, NOW)).toBe(0);
  });

  it("counts down to expiry and stops at zero", () => {
    expect(daysUntilStale(daysAgo(0), NOW)).toBe(FRESHNESS_DAYS);
    expect(daysUntilStale(daysAgo(13), NOW)).toBe(1);
    expect(daysUntilStale(daysAgo(FRESHNESS_DAYS), NOW)).toBe(0);
    expect(daysUntilStale(daysAgo(90), NOW)).toBe(0);
  });

  it("admits a retailer-page check to the window, and still refuses scaffolding", () => {
    expect(isFreshCheck({ source: "RETAILER_PAGE", checkedAt: daysAgo(1) }, NOW)).toBe(true);
    expect(isFreshCheck({ source: "SYNTHETIC", checkedAt: daysAgo(0) }, NOW)).toBe(false);
  });

  it("reports staleness as one of four states, scaffolding included", () => {
    expect(stalenessOf(null, NOW)).toBe("never-checked");
    expect(stalenessOf({ source: "SYNTHETIC", checkedAt: daysAgo(0) }, NOW)).toBe("not-evidence");
    expect(stalenessOf({ source: "HAND_VERIFIED", checkedAt: daysAgo(1) }, NOW)).toBe("fresh");
    expect(stalenessOf({ source: "HAND_VERIFIED", checkedAt: daysAgo(30) }, NOW)).toBe("stale");
  });
});
