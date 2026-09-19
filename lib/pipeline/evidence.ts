/**
 * Stage 3 — evidence retrieval.
 *
 * Order of preference, and why:
 *   1. Barcode against our own catalogue. Exact, instant, already verified.
 *   2. Barcode against Open Food Facts / Open Beauty Facts. Exact, and it lets the
 *      app answer for products we have never seen.
 *   3. Name match against our own catalogue. Fuzzy, so it must clear a threshold.
 *   4. Name search against the open database. Fuzziest; last resort.
 * If all four miss, we say so. We never assemble a plausible product from nothing.
 */
import type { Product } from "@prisma/client";
import { prisma } from "../db";
import { lookupByBarcode, searchByName, type EvidenceRecord } from "../evidence/openfoodfacts";
import type { Identification, ProductCategory } from "../schemas";

export type EvidenceResult = {
  product: Product | null;
  /** How the match was made, shown to the user under "how we found this". */
  method: "barcode-local" | "barcode-open-db" | "name-local" | "name-open-db" | "none";
  note: string | null;
};

const STOPWORDS = new Set(["the", "a", "of", "and", "with", "original", "classic", "new"]);

export function tokenise(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

/**
 * Token overlap, weighted so that a brand match counts double. Pure and exported
 * so the threshold can be tested rather than tuned by feel.
 */
export function nameSimilarity(
  query: { name: string; brand: string | null },
  candidate: { name: string; brand: string | null },
): number {
  const queryTokens = new Set(tokenise(query.name));
  const candidateTokens = new Set(tokenise(candidate.name));
  if (queryTokens.size === 0 || candidateTokens.size === 0) return 0;

  let shared = 0;
  for (const token of queryTokens) if (candidateTokens.has(token)) shared += 1;
  const overlap = shared / Math.max(queryTokens.size, candidateTokens.size);

  const brandMatch =
    query.brand && candidate.brand
      ? tokenise(query.brand).some((t) => tokenise(candidate.brand!).includes(t))
      : false;

  return Math.min(1, overlap * (brandMatch ? 1.6 : 1));
}

/** Below this, we would rather say "not found" than show the wrong product. */
export const NAME_MATCH_THRESHOLD = 0.5;

export function pickBestLocalMatch<T extends { name: string; brand: string | null }>(
  query: { name: string; brand: string | null },
  candidates: T[],
): { match: T; score: number } | null {
  let best: { match: T; score: number } | null = null;
  for (const candidate of candidates) {
    const score = nameSimilarity(query, candidate);
    if (!best || score > best.score) best = { match: candidate, score };
  }
  return best && best.score >= NAME_MATCH_THRESHOLD ? best : null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

async function upsertFromOpenDb(
  record: EvidenceRecord,
  category: ProductCategory,
  fallbackSize: string | null,
): Promise<Product> {
  const slug = slugify(
    `${record.brand ?? ""} ${record.name} ${record.barcode ?? ""}`.trim() || record.name,
  );
  const payload = {
    name: record.name,
    brand: record.brand,
    category,
    sizeLabel: record.sizeLabel ?? fallbackSize,
    imageUrl: record.imageUrl,
    ingredientsText: record.ingredientsText,
    nutritionJson: record.nutrition ? JSON.stringify(record.nutrition) : null,
    allergensJson: JSON.stringify(record.allergens),
    additivesJson: JSON.stringify(record.additives),
    novaGroup: record.novaGroup,
    evidenceSource: record.sourceName,
    evidenceSourceKind: "OPEN_DATA",
    evidenceSourceUrl: record.sourceUrl,
    lastVerifiedAt: record.lastVerifiedAt,
  };

  // Barcode is the natural key when we have one; slug otherwise.
  if (record.barcode) {
    const existing = await prisma.product.findUnique({ where: { barcode: record.barcode } });
    if (existing) {
      return prisma.product.update({ where: { id: existing.id }, data: payload });
    }
  }

  return prisma.product.upsert({
    where: { slug },
    update: payload,
    create: { ...payload, slug, barcode: record.barcode },
  });
}

export async function gatherEvidence(identification: Identification): Promise<EvidenceResult> {
  const { barcode, name, brand, category, sizeLabel } = identification;

  // 1. Barcode, locally.
  if (barcode) {
    const local = await prisma.product.findUnique({ where: { barcode } });
    if (local) return { product: local, method: "barcode-local", note: null };
  }

  // 2. Barcode, open database.
  if (barcode) {
    const record = await lookupByBarcode(barcode, category);
    if (record) {
      const product = await upsertFromOpenDb(record, category, sizeLabel);
      return { product, method: "barcode-open-db", note: null };
    }
  }

  // 3. Name, locally.
  const candidates = await prisma.product.findMany({ where: { category } });
  const best = pickBestLocalMatch({ name, brand }, candidates);
  if (best) {
    return {
      product: best.match,
      method: "name-local",
      note: `Matched by name (confidence ${Math.round(best.score * 100)}%) because no barcode was readable.`,
    };
  }

  // 4. Name, open database.
  const record = await searchByName(`${brand ?? ""} ${name}`.trim(), category);
  if (record) {
    const product = await upsertFromOpenDb(record, category, sizeLabel);
    return {
      product,
      method: "name-open-db",
      note: "Matched by name search, not by barcode. Check the product below is the one in your hand.",
    };
  }

  return {
    product: null,
    method: "none",
    note: "We could not find published evidence for this product. Rather than guess, we are showing you nothing.",
  };
}
