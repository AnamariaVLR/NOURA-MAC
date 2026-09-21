/**
 * Where a price came from, and what we are therefore allowed to say about it.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 *
 * Noura may never describe a price in stronger terms than its source supports.
 * A number copied off a retailer's web page is a real fact — it is what that
 * retailer was showing on that date — but it is NOT someone standing in an
 * aisle confirming the pack on the shelf, and the page must not say it is.
 *
 * Before this module existed, freshnessLabel() printed "Verified by hand" for
 * any fresh check regardless of its source, so the first automated price to
 * enter the system would have been announced as hand-verified. That is the
 * precise failure this file prevents.
 *
 * ── The four kinds ──────────────────────────────────────────────────────────
 *
 *   MANUAL_VERIFIED (HAND_VERIFIED)
 *     A person checked the shelf or the page and wrote down what they saw.
 *     Carries verifiedBy. The strongest commerce evidence Noura holds.
 *
 *   RETAILER_PAGE
 *     Read from an official retailer product page, matched to this exact
 *     product. Carries the URL and the retrieval time. No person vouches for
 *     the shelf.
 *
 *   AUTOMATED_RETAILER_FEED (RETAILER_API)
 *     A structured feed or API published by the retailer. Nothing ships that
 *     uses this; the kind exists so that the day one does, it cannot be
 *     silently rendered as a hand check.
 *
 *   UNKNOWN
 *     No evidence recent enough to quote. Not a price.
 */

import type { DataSource } from "../schemas";

export type CommerceSourceKind =
  | "MANUAL_VERIFIED"
  | "RETAILER_PAGE"
  | "AUTOMATED_RETAILER_FEED"
  | "UNKNOWN";

/** Map the stored DataSource to the commerce kind the UI reasons about. */
export function commerceKindOf(source: string | null | undefined): CommerceSourceKind {
  switch (source as DataSource) {
    case "HAND_VERIFIED":
      return "MANUAL_VERIFIED";
    case "RETAILER_PAGE":
      return "RETAILER_PAGE";
    case "RETAILER_API":
      return "AUTOMATED_RETAILER_FEED";
    default:
      // SYNTHETIC, OPEN_DATA, REGULATOR_IMPORT and anything unrecognised are not
      // commerce evidence. Failing closed means a typo hides a price rather than
      // promoting it.
      return "UNKNOWN";
  }
}

/** True only for kinds that may be shown as a price at all. */
export function isQuotableKind(kind: CommerceSourceKind): boolean {
  return kind !== "UNKNOWN";
}

export type PriceProvenance = {
  kind: CommerceSourceKind;
  retailerName: string;
  formattedDate: string;
  checkedBy: string | null;
  isFresh: boolean;
  ageDays: number;
};

/**
 * The sentence printed beside a price. Each kind gets its own wording, and none
 * of them borrows another's authority.
 */
export function priceSentence(p: PriceProvenance): string {
  if (!p.isFresh) {
    // Still shown — it is the last thing we actually know — but never as current.
    return `Price not verified recently — last shown ${p.formattedDate}`;
  }
  switch (p.kind) {
    case "MANUAL_VERIFIED":
      return p.checkedBy
        ? `Price checked by hand on ${p.formattedDate} by ${p.checkedBy}`
        : `Price checked by hand on ${p.formattedDate}`;
    case "RETAILER_PAGE":
      return `Price shown by ${p.retailerName} on ${p.formattedDate}`;
    case "AUTOMATED_RETAILER_FEED":
      return `Price from ${p.retailerName}'s product feed on ${p.formattedDate}`;
    default:
      return "Price not verified yet";
  }
}

/**
 * Availability is a SEPARATE fact from price and gets its own sentence.
 *
 * A retailer page showing a price does not establish that the item is on a
 * shelf, and a shelf check a month old does not establish it is there today.
 * `inStock === null` means nobody recorded it, which is different again from
 * recording that it was out of stock.
 */
export function availabilitySentence(
  inStock: boolean | null,
  p: Pick<PriceProvenance, "kind" | "formattedDate" | "isFresh" | "ageDays">,
): string {
  if (inStock === null) return "Availability not verified recently";
  if (!p.isFresh) {
    return `Last checked ${p.ageDays} day${p.ageDays === 1 ? "" : "s"} ago; current stock not confirmed`;
  }
  if (p.kind === "MANUAL_VERIFIED") {
    return inStock ? `In stock on ${p.formattedDate}` : `Out of stock on ${p.formattedDate}`;
  }
  // A retailer page or feed reports its own stock flag; it is their claim, not
  // an observation of a shelf, and the wording says whose claim it is.
  return inStock
    ? `Listed as available on ${p.formattedDate}`
    : `Listed as unavailable on ${p.formattedDate}`;
}

/** Shown in admin and in the evidence drawer. One short phrase per kind. */
export const COMMERCE_KIND_LABEL: Record<CommerceSourceKind, string> = {
  MANUAL_VERIFIED: "Checked by a person",
  RETAILER_PAGE: "Read from the retailer's product page",
  AUTOMATED_RETAILER_FEED: "From the retailer's product feed",
  UNKNOWN: "No commerce evidence",
};
