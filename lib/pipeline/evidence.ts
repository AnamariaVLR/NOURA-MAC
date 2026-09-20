/**
 * Stage 3 — evidence retrieval.
 *
 * Order of preference, and why:
 *   1. Barcode against our own catalogue. Exact, instant, already verified.
 *   2. Barcode against Open Food Facts / Open Beauty Facts. Exact, and it lets the
 *      app answer for products we have never seen.
 *   3. Name match against our own catalogue. Containment, then a DECISION:
 *      one separable candidate is matched, anything else is a question for the
 *      shopper (lib/pipeline/match.ts).
 *   4. Name search against the open database. Fuzziest; last resort.
 * If all four miss, we say so. We never assemble a plausible product from nothing.
 */
import type { Product } from "@prisma/client";
import { prisma } from "../db";
import { lookupByBarcode, searchByName, type EvidenceRecord } from "../evidence/openfoodfacts";
import type {
  Identification,
  MatchCandidate,
  MatchSource,
  ProductCategory,
} from "../schemas";
import { decideMatch, type Candidate } from "./match";

export type EvidenceResult = {
  product: Product | null;
  /** How the match was made, shown to the user under "how we found this". */
  method: "barcode-local" | "barcode-open-db" | "name-local" | "name-open-db" | "none";
  note: string | null;
  /** Set when the product was reached without asking. */
  matchSource?: MatchSource;
  /**
   * Options for a "Which one is this?" question. Present when `product` is null
   * and the name matcher found things it could not separate. The pipeline turns
   * this into a scan awaiting confirmation rather than a failure.
   */
  candidates?: MatchCandidate[];
};

/** Turns a matcher candidate into the shape the page and the database hold. */
function toMatchCandidate(candidate: Candidate<Product>): MatchCandidate {
  return {
    productId: candidate.product.id,
    slug: candidate.product.slug,
    name: candidate.product.name,
    brand: candidate.product.brand,
    sizeLabel: candidate.product.sizeLabel,
    imageUrl: candidate.product.imageUrl,
    variant: candidate.unseenTokens,
  };
}

const STOPWORDS = new Set(["the", "a", "of", "and", "with", "original", "classic", "new"]);

export function tokenise(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
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
  subcategory: string | null,
  fallbackSize: string | null,
): Promise<Product> {
  const slug = slugify(
    `${record.brand ?? ""} ${record.name} ${record.barcode ?? ""}`.trim() || record.name,
  );
  const payload = {
    name: record.name,
    brand: record.brand,
    category,
    subcategory,
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
  const { barcode, name, brand, category, subcategory, sizeLabel, visibleText } =
    identification;

  // 1. Barcode, locally.
  if (barcode) {
    const local = await prisma.product.findUnique({ where: { barcode } });
    if (local) {
      return { product: local, method: "barcode-local", matchSource: "BARCODE", note: null };
    }
  }

  // 2. Barcode, open database.
  if (barcode) {
    const record = await lookupByBarcode(barcode, category);
    if (record) {
      const product = await upsertFromOpenDb(record, category, subcategory, sizeLabel);
      return { product, method: "barcode-open-db", matchSource: "BARCODE", note: null };
    }
  }

  // 3. Name, locally — containment, then a decision. See lib/pipeline/match.ts.
  //
  // The search is NOT limited to the model's category. A model that reads a
  // carton as `drink` when the catalogue files it under `milk` would otherwise
  // never see it, and the category is the model's guess while the name is what
  // it actually read.
  const local = await prisma.product.findMany();
  const decision = decideMatch({ name, brand, sizeLabel, visibleText }, local);

  if (decision.kind === "auto") {
    return {
      product: decision.product,
      method: "name-local",
      matchSource: "NAME_AUTO",
      note: "Matched by name because no barcode was readable.",
    };
  }

  if (decision.kind === "confirm") {
    // A tie is a question, never a guess. Nothing is evaluated until it is
    // answered, so no product is returned here.
    return {
      product: null,
      method: "none",
      note: null,
      candidates: decision.candidates.map(toMatchCandidate),
    };
  }

  // 4. Name, open database.
  const record = await searchByName(`${brand ?? ""} ${name}`.trim(), category);
  if (record) {
    const product = await upsertFromOpenDb(record, category, subcategory, sizeLabel);
    return {
      product,
      method: "name-open-db",
      matchSource: "NAME_AUTO",
      note: "Matched by name search, not by barcode. Check the product below is the one in your hand.",
    };
  }

  return {
    product: null,
    method: "none",
    note: "We could not find published evidence for this product. Rather than guess, we are showing you nothing.",
  };
}
