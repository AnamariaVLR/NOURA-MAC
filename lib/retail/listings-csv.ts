/**
 * The CSV round trip: export the queue, fill it in wherever is convenient, import
 * it back.
 *
 * Checking prices is field work. Somebody with a phone in an aisle wants
 * /admin/listings; somebody working through a retailer's website at a desk wants a
 * spreadsheet. Both must end up at the same place — a ListingCheck with an author
 * and a date — so the parsing and validation live here, shared by both scripts.
 *
 * The format is deliberately boring: one row per listing, the identifying columns
 * pre-filled by the exporter, three columns for a person to type into.
 */

import { ListingCheckCsvRowSchema, type ListingCheckCsvRow } from "../schemas";
import { aedToFils } from "../format";
import { parsePriceAed } from "./listings-admin";

export const CSV_COLUMNS = [
  "listing_id",
  "product_slug",
  "retailer_slug",
  "size_label",
  "price_aed",
  "in_stock",
  "checked_by",
  "checked_at",
  "retailer_url",
  "note",
] as const;

/* ---------------------------------------------------------------------------
 * Writing
 * ------------------------------------------------------------------------- */

/** Quotes a field only when it needs it, so the file stays readable by eye. */
export function csvEscape(value: string): string {
  if (value === "") return "";
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function toCsv(rows: Array<Record<string, string>>): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((column) => csvEscape(row[column] ?? "")).join(","));
  }
  return `${lines.join("\n")}\n`;
}

/* ---------------------------------------------------------------------------
 * Reading
 * ------------------------------------------------------------------------- */

/** Minimal RFC-4180 reader: quoted fields, doubled quotes, embedded newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  // A BOM from Excel would otherwise become part of the first column name.
  const input = text.replace(/^﻿/, "");

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/** Header-keyed records, so column order in the file does not matter. */
export function csvToRecords(text: string): Array<Record<string, string>> {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    header.forEach((column, index) => {
      record[column] = (row[index] ?? "").trim();
    });
    return record;
  });
}

/* ---------------------------------------------------------------------------
 * Validating one row into a check
 * ------------------------------------------------------------------------- */

export type ParsedCheck = {
  listingId: string;
  priceFils: number;
  sizeLabel: string;
  inStock: boolean;
  checkedBy: string;
  checkedAt: Date;
  retailerUrl: string | null;
  note: string | null;
};

export type RowOutcome =
  | { ok: true; check: ParsedCheck }
  /** Left blank on purpose — nobody checked this one. Not an error. */
  | { ok: false; kind: "skipped"; reason: string }
  | { ok: false; kind: "rejected"; reason: string };

const TRUE_WORDS = new Set(["true", "yes", "y", "1", "in stock", "instock"]);
const FALSE_WORDS = new Set(["false", "no", "n", "0", "out of stock", "oos"]);

export function parseInStock(raw: string): boolean | null {
  const value = raw.trim().toLowerCase();
  if (TRUE_WORDS.has(value)) return true;
  if (FALSE_WORDS.has(value)) return false;
  return null;
}

/**
 * Accepts an ISO date, a date-time, or the dd/mm/yyyy a UAE spreadsheet produces.
 * Ambiguous formats are rejected rather than guessed: a wrong date silently makes a
 * stale price look fresh.
 */
export function parseCheckedAt(raw: string, now: Date = new Date()): Date | null {
  const value = raw.trim();
  if (!value) return null;

  const dmy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = dmy ? `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}` : value;

  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  // A minute of slack for clock skew; beyond that a future date is an error.
  if (parsed.getTime() > now.getTime() + 60_000) return null;
  return parsed;
}

/**
 * Turns one CSV record into a check, or explains why it will not.
 *
 * A row with no price is SKIPPED, not rejected: the exporter writes one line per
 * listing and a person fills in the ones they actually checked. Blank means
 * "not checked", which is the normal case and must not look like a failure.
 */
export function parseRow(record: Record<string, string>, now: Date = new Date()): RowOutcome {
  const shaped = ListingCheckCsvRowSchema.safeParse({
    listing_id: record.listing_id ?? "",
    product_slug: record.product_slug ?? "",
    retailer_slug: record.retailer_slug ?? "",
    size_label: record.size_label ?? "",
    price_aed: record.price_aed || "-",
    in_stock: record.in_stock || "-",
    checked_by: record.checked_by || "-",
    checked_at: record.checked_at || "-",
    retailer_url: record.retailer_url ?? "",
    note: record.note ?? "",
  });

  if (!shaped.success) {
    const missing = shaped.error.issues.map((i) => i.path.join(".")).join(", ");
    return { ok: false, kind: "rejected", reason: `missing or empty: ${missing || "listing_id"}` };
  }
  const row: ListingCheckCsvRow = shaped.data;

  if (!record.price_aed?.trim()) {
    return { ok: false, kind: "skipped", reason: "no price filled in" };
  }

  const priceAed = parsePriceAed(row.price_aed);
  if (priceAed === null) {
    return { ok: false, kind: "rejected", reason: `price "${row.price_aed}" is not a number` };
  }

  const inStock = parseInStock(row.in_stock);
  if (inStock === null) {
    return { ok: false, kind: "rejected", reason: `in_stock "${row.in_stock}" is not yes or no` };
  }

  const checkedBy = record.checked_by?.trim() ?? "";
  if (!checkedBy) {
    return { ok: false, kind: "rejected", reason: "checked_by is empty" };
  }

  const checkedAt = parseCheckedAt(row.checked_at, now);
  if (checkedAt === null) {
    return {
      ok: false,
      kind: "rejected",
      reason: `checked_at "${row.checked_at}" is not a usable past date`,
    };
  }

  return {
    ok: true,
    check: {
      listingId: row.listing_id,
      priceFils: aedToFils(priceAed),
      sizeLabel: record.size_label?.trim() || row.size_label,
      inStock,
      checkedBy,
      checkedAt,
      retailerUrl: record.retailer_url?.trim() || null,
      note: record.note?.trim() || null,
    },
  };
}

export type ImportReport = {
  imported: number;
  skipped: number;
  rejected: number;
  unknownListing: number;
  problems: string[];
};
