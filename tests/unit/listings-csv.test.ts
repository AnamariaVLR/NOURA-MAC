/**
 * The CSV round trip.
 *
 * Checks get made in a spreadsheet as often as on a phone, so the file format is
 * part of the product. What matters here: a row somebody filled in survives the
 * trip intact, a row they left blank is skipped rather than treated as an error,
 * and a row that cannot be read is rejected rather than guessed at.
 */
import { describe, expect, it } from "vitest";
import {
  CSV_COLUMNS,
  csvEscape,
  csvToRecords,
  parseCheckedAt,
  parseCsv,
  parseInStock,
  parseRow,
  toCsv,
} from "@/lib/retail/listings-csv";
import { parsePriceAed } from "@/lib/retail/listings-admin";
import { formatAed } from "@/lib/format";

const NOW = new Date("2026-09-19T12:00:00.000Z");

const row = (over: Record<string, string> = {}) => ({
  listing_id: "listing-1",
  product_slug: "al-ain-water-500ml",
  retailer_slug: "carrefour-uae",
  size_label: "500 ml",
  brand: "Al Ain",
  product_name: "Al Ain Bottled Water",
  barcode: "6291100850068",
  price_aed: "1.75",
  in_stock: "yes",
  checked_by: "A. Checker",
  checked_at: "2026-09-18",
  retailer_url: "https://www.carrefouruae.com/p/water",
  note: "",
  ...over,
});

describe("round trip", () => {
  it("survives export and re-import unchanged", () => {
    const original = [row(), row({ listing_id: "listing-2", price_aed: "9.00", note: "top shelf" })];
    const records = csvToRecords(toCsv(original));

    expect(records).toHaveLength(2);
    for (const [index, record] of records.entries()) {
      for (const column of CSV_COLUMNS) {
        expect(record[column]).toBe(original[index][column]);
      }
    }
  });

  it("round-trips the values that break naive CSV writers", () => {
    const awkward = row({
      note: 'Aisle 4, "end cap", 2 for 1',
      checked_by: "O'Brien, A.",
      size_label: "6 x 200 ml",
    });
    const [record] = csvToRecords(toCsv([awkward]));
    expect(record.note).toBe('Aisle 4, "end cap", 2 for 1');
    expect(record.checked_by).toBe("O'Brien, A.");
    expect(record.size_label).toBe("6 x 200 ml");
  });

  it("round-trips through a parsed check without drifting the price", () => {
    const [record] = csvToRecords(toCsv([row({ price_aed: "12.05" })]));
    const outcome = parseRow(record, NOW);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.check.priceFils).toBe(1205);
      expect(formatAed(outcome.check.priceFils ?? 0)).toBe("AED 12.05");
    }
  });

  it("writes a header even with no rows, so an empty export is still a valid file", () => {
    expect(toCsv([]).trim()).toBe(CSV_COLUMNS.join(","));
  });

  it("does not care what order the columns arrive in", () => {
    const text =
      "checked_by,price_aed,listing_id,size_label,in_stock,checked_at\nA,1.75,listing-1,500 ml,yes,2026-09-18\n";
    const [record] = csvToRecords(text);
    expect(parseRow(record, NOW).ok).toBe(true);
  });

  it("tolerates a BOM and CRLF from a spreadsheet", () => {
    const text =
      "﻿listing_id,size_label,price_aed,in_stock,checked_by,checked_at\r\nlisting-1,500 ml,1.75,yes,A,2026-09-18\r\n";
    const records = csvToRecords(text);
    expect(records[0].listing_id).toBe("listing-1");
    expect(parseRow(records[0], NOW).ok).toBe(true);
  });
});

describe("csvEscape", () => {
  it("quotes only what needs quoting", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape("has,comma")).toBe('"has,comma"');
    expect(csvEscape('has"quote')).toBe('"has""quote"');
    expect(csvEscape("has\nnewline")).toBe('"has\nnewline"');
    expect(csvEscape("")).toBe("");
  });
});

describe("parseCsv", () => {
  it("skips blank lines", () => {
    expect(parseCsv("a,b\n1,2\n\n3,4\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("returns nothing for an empty file", () => {
    expect(parseCsv("")).toEqual([]);
    expect(csvToRecords("listing_id,price_aed\n")).toEqual([]);
  });
});

describe("parsePriceAed", () => {
  it("accepts what a person types on a phone", () => {
    expect(parsePriceAed("12.50")).toBe(12.5);
    expect(parsePriceAed("12,50")).toBe(12.5);
    expect(parsePriceAed(" 12 ")).toBe(12);
    expect(parsePriceAed("AED 12.50")).toBe(12.5);
    expect(parsePriceAed("aed 3.05")).toBe(3.05);
  });

  it("rejects anything it would have to guess at", () => {
    for (const bad of ["", "free", "12.505", "1.2.3", "-5", "0", "12 AED", "~12"]) {
      expect(parsePriceAed(bad)).toBeNull();
    }
  });
});

describe("parseInStock", () => {
  it("accepts the words people actually write", () => {
    for (const yes of ["yes", "Y", "TRUE", "1", "in stock"]) expect(parseInStock(yes)).toBe(true);
    for (const no of ["no", "N", "false", "0", "out of stock", "OOS"]) {
      expect(parseInStock(no)).toBe(false);
    }
  });

  it("returns null for anything ambiguous rather than defaulting", () => {
    for (const bad of ["", "maybe", "low stock", "?"]) expect(parseInStock(bad)).toBeNull();
  });
});

describe("parseCheckedAt", () => {
  it("accepts ISO and dd/mm/yyyy", () => {
    expect(parseCheckedAt("2026-09-18", NOW)?.toISOString().slice(0, 10)).toBe("2026-09-18");
    expect(parseCheckedAt("18/09/2026", NOW)?.toISOString().slice(0, 10)).toBe("2026-09-18");
  });

  it("rejects a future date, which would make a stale price look fresh", () => {
    expect(parseCheckedAt("2027-01-01", NOW)).toBeNull();
  });

  it("rejects nonsense rather than guessing", () => {
    for (const bad of ["", "last tuesday", "31/31/2026", "soon"]) {
      expect(parseCheckedAt(bad, NOW)).toBeNull();
    }
  });
});

describe("parseRow", () => {
  it("accepts a filled-in row", () => {
    const outcome = parseRow(row(), NOW);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.check.listingId).toBe("listing-1");
      expect(outcome.check.priceFils).toBe(175);
      expect(outcome.check.inStock).toBe(true);
      expect(outcome.check.checkedBy).toBe("A. Checker");
    }
  });

  it("SKIPS a row with neither price nor availability — nobody checked it", () => {
    const outcome = parseRow(row({ price_aed: "", in_stock: "" }), NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.kind).toBe("skipped");
  });

  it("accepts availability alone — seeing the shelf is an observation", () => {
    const outcome = parseRow(row({ price_aed: "", in_stock: "yes" }), NOW);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.check.priceFils).toBeNull();
      expect(outcome.check.inStock).toBe(true);
    }
  });

  it("accepts a price alone — reading a label is an observation too", () => {
    const outcome = parseRow(row({ price_aed: "12.50", in_stock: "" }), NOW);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.check.priceFils).toBe(1250);
      // Nobody said it was in stock, so we do not say it either.
      expect(outcome.check.inStock).toBeNull();
    }
  });

  it("rejects a priced row with no checker: a price needs an author", () => {
    const outcome = parseRow(row({ checked_by: "" }), NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.kind).toBe("rejected");
      expect(outcome.reason).toMatch(/checked_by/);
    }
  });

  it("rejects an unreadable price rather than importing a wrong one", () => {
    const outcome = parseRow(row({ price_aed: "about 12" }), NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.kind).toBe("rejected");
  });

  it("rejects an ambiguous stock value", () => {
    const outcome = parseRow(row({ in_stock: "low" }), NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toMatch(/in_stock/);
  });

  it("rejects a row with no listing_id", () => {
    const outcome = parseRow(row({ listing_id: "" }), NOW);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.kind).toBe("rejected");
  });

  it("accepts a hand-built row carrying only the key fields", () => {
    // product_slug and retailer_slug are human context, not requirements.
    const outcome = parseRow(
      {
        listing_id: "listing-1",
        size_label: "500 ml",
        price_aed: "1.75",
        in_stock: "yes",
        checked_by: "A",
        checked_at: "2026-09-18",
      },
      NOW,
    );
    expect(outcome.ok).toBe(true);
  });

  it("has no column that could set the source: the importer decides that", () => {
    expect(CSV_COLUMNS).not.toContain("source");
    const outcome = parseRow({ ...row(), source: "RETAILER_API" }, NOW);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) expect(outcome.check).not.toHaveProperty("source");
  });
});
