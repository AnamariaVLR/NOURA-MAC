/** Money is stored as an integer number of fils (1/100 AED). Format, never compute, here. */
export function formatAed(priceFils: number): string {
  if (!Number.isFinite(priceFils)) return "unknown";
  const sign = priceFils < 0 ? "-" : "";
  const abs = Math.abs(Math.round(priceFils));
  return `${sign}AED ${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function aedToFils(aed: number): number {
  return Math.round(aed * 100);
}

/** "12 March 2026" — unambiguous for a UAE audience, no US/EU month-day confusion. */
export function formatDate(value: Date | string): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "unknown";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** Price per 100 g/ml, so a 250 g pack can be compared with a 1 kg one. */
export function unitPriceFils(priceFils: number, sizeLabel: string): number | null {
  const grams = parseSizeToBase(sizeLabel);
  if (grams === null || grams <= 0) return null;
  return Math.round((priceFils / grams) * 100);
}

/** Parse "500 ml", "1.5 L", "250g", "6 x 200 ml" into a base unit (g or ml). */
export function parseSizeToBase(sizeLabel: string): number | null {
  const s = sizeLabel.toLowerCase().replace(/,/g, "");
  const multi = s.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(kg|g|l|ml)/);
  if (multi) {
    const count = Number(multi[1]);
    const each = Number(multi[2]);
    return count * each * unitFactor(multi[3]);
  }
  const single = s.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml)\b/);
  if (single) return Number(single[1]) * unitFactor(single[2]);
  return null;
}

function unitFactor(unit: string): number {
  switch (unit) {
    case "kg":
    case "l":
      return 1000;
    default:
      return 1;
  }
}

export function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}
