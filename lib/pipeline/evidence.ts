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
import {
  basisPermitsAnalysis,
  brandCorroborated,
  decideMatch,
  identityBasis,
  type IdentityBasis,
  type Candidate,
} from "./match";
import {
  barcodeIsContradicted,
  fingerprint,
  sameBrand,
  type IdentityRecord,
  type IdentityState,
} from "./identity";

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
  /** What the identity rests on. "uncorroborated" may never carry a verdict. */
  identityBasis?: IdentityBasis;
  /** The authoritative identity decision and the signals behind it. */
  identity?: IdentityRecord;
};

/** Build the audit record every scan carries. */
function identityRecord(args: {
  state: IdentityState;
  identification: Identification;
  product: Product | null;
  matchMethod: string;
  reason: string;
  barcodeContradicted?: boolean;
}): IdentityRecord {
  const { identification: id, product } = args;
  return {
    state: args.state,
    fingerprint: product ? fingerprint(product) : null,
    claimedBrand: id.brand ?? null,
    claimedName: id.name ?? null,
    claimedBarcode: id.barcode ?? null,
    confidence: typeof id.confidence === "number" ? id.confidence : null,
    visibleText: id.visibleText ?? null,
    matchedProductId: product?.id ?? null,
    matchedBrand: product?.brand ?? null,
    matchedName: product?.name ?? null,
    matchedBarcode: product?.barcode ?? null,
    matchMethod: args.matchMethod,
    brandAgrees: product ? sameBrand(id.brand, product.brand) : null,
    textCorroborates: product ? brandCorroborated(id.visibleText, product.brand) : null,
    barcodeContradicted: args.barcodeContradicted ?? false,
    reason: args.reason,
  };
}

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

  // VISUAL IDENTITY FIRST, ALWAYS.
  //
  // A barcode lives on the bottom of a pot, the back of a carton, under the
  // shrink-wrap, or nowhere a shopper can photograph while holding a basket.
  // Pointing a camera at the front of a product is the normal case, not a
  // degraded one, so the brand, name, variant and size read off the front are
  // the foundation of identity and the barcode corroborates them.
  //
  // This is resolved BEFORE the barcode rather than as a fallback after it.
  // Computing it either way is what makes the two comparable: previously a
  // barcode short-circuited, so when it resolved to a different product than
  // the visuals did, nobody ever found out.
  const catalogue = await prisma.product.findMany();
  const visual = decideMatch({ name, brand, sizeLabel, visibleText }, catalogue);
  const visualProduct = visual.kind === "auto" ? visual.product : null;

  // 1. Barcode, locally — as corroboration of the above, or as identity in its
  //    own right when there is no visual match to corroborate.
  if (barcode) {
    const local = await prisma.product.findUnique({ where: { barcode } });
    if (local) {
      // The visuals resolved to a DIFFERENT product than the digits did. Both
      // are real products with real evidence; the disagreement is the finding.
      // A misread digit lands on a neighbouring SKU far more easily than a
      // model misreads a brand and a product name and a size together.
      if (visualProduct && visualProduct.id !== local.id) {
        return {
          product: null,
          method: "none",
          identityBasis: "uncorroborated",
          note:
            `The barcode points to ${local.brand ?? "one product"} — ${local.name} — while the ` +
            `pack looks like ${visualProduct.brand ?? "another"} — ${visualProduct.name}. ` +
            "We have not assessed either. Please confirm which one this is.",
          candidates: [
            toMatchCandidate({ product: visualProduct, containment: 1, unseenTokens: [], sizeMatches: true }),
            toMatchCandidate({ product: local, containment: 1, unseenTokens: [], sizeMatches: false }),
          ],
          identity: identityRecord({
            state: "NEEDS_CONFIRMATION",
            identification,
            product: null,
            matchMethod: "barcode-local",
            barcodeContradicted: true,
            reason:
              "The barcode and the visual evidence resolved to two different catalogue products.",
          }),
        };
      }
      // And when there is no visual match to compare against, the weaker
      // check still applies: the claimed brand and the transcribed text both
      // naming something else is enough to stop.
      const contradicted = barcodeIsContradicted({
        claimedBrand: brand,
        visibleText,
        matchedBrand: local.brand,
      });

      if (contradicted) {
        return {
          product: null,
          method: "none",
          identityBasis: "uncorroborated",
          note:
            `The barcode we read points to ${local.brand ?? "another product"}, but the pack ` +
            `appears to say something else. We have not assessed anything — please confirm.`,
          candidates: [toMatchCandidate({ product: local, containment: 1, unseenTokens: [], sizeMatches: false })],
          identity: identityRecord({
            state: "NEEDS_CONFIRMATION",
            identification,
            product: local,
            matchMethod: "barcode-local",
            barcodeContradicted: true,
            reason:
              "A barcode match was contradicted by both the claimed brand and the pack text.",
          }),
        };
      }

      return {
        product: local,
        method: "barcode-local",
        matchSource: "BARCODE",
        note: null,
        identityBasis: "barcode",
        identity: identityRecord({
          state: "IDENTIFIED_BY_BARCODE",
          identification,
          product: local,
          matchMethod: "barcode-local",
          reason: "The transcribed barcode matched a catalogue product.",
        }),
      };
    }
  }

  // 2. Barcode, open database.
  if (barcode) {
    const record = await lookupByBarcode(barcode, category);
    if (record) {
      const product = await upsertFromOpenDb(record, category, subcategory, sizeLabel);
      const contradicted = barcodeIsContradicted({
        claimedBrand: brand,
        visibleText,
        matchedBrand: product.brand,
      });

      if (contradicted) {
        return {
          product: null,
          method: "none",
          identityBasis: "uncorroborated",
          note:
            `The barcode we read points to ${product.brand ?? "another product"}, but the pack ` +
            `appears to say something else. We have not assessed anything — please confirm.`,
          candidates: [toMatchCandidate({ product, containment: 1, unseenTokens: [], sizeMatches: false })],
          identity: identityRecord({
            state: "NEEDS_CONFIRMATION",
            identification,
            product,
            matchMethod: "barcode-open-db",
            barcodeContradicted: true,
            reason:
              "A barcode match was contradicted by both the claimed brand and the pack text.",
          }),
        };
      }

      return {
        product,
        method: "barcode-open-db",
        matchSource: "BARCODE",
        note: null,
        identityBasis: "barcode",
        identity: identityRecord({
          state: "IDENTIFIED_BY_BARCODE",
          identification,
          product,
          matchMethod: "barcode-open-db",
          reason: "The transcribed barcode matched a product in the open database.",
        }),
      };
    }
  }

  // 3. Name, locally — containment, then a decision. See lib/pipeline/match.ts.
  //
  // The search is NOT limited to the model's category. A model that reads a
  // carton as `drink` when the catalogue files it under `milk` would otherwise
  // never see it, and the category is the model's guess while the name is what
  // it actually read.
  const decision = visual;

  if (decision.kind === "auto") {
    const basis = identityBasis({
      barcode,
      visibleText,
      matchedBrand: decision.product.brand,
    });

    // The matcher is satisfied; the IMAGE is not. Nothing the model transcribed
    // off the pack names this brand, so its conclusion is unsupported by its own
    // reading. Ask rather than assert.
    if (!basisPermitsAnalysis(basis)) {
      return {
        product: null,
        method: "none",
        note: null,
        identityBasis: basis,
        candidates: decision.candidates.slice(0, 4).map(toMatchCandidate),
        identity: identityRecord({
          state: "IDENTIFIED_BY_NAME_ONLY",
          identification,
          product: decision.product,
          matchMethod: "name-local",
          reason: "Matched by name, but nothing read off the pack names that brand.",
        }),
      };
    }

    return {
      product: decision.product,
      method: "name-local",
      matchSource: "NAME_AUTO",
      note: "Matched by name because no barcode was readable.",
      identityBasis: basis,
      identity: identityRecord({
        state: "IDENTIFIED_BY_NAME_WITH_CORROBORATION",
        identification,
        product: decision.product,
        matchMethod: "name-local",
        reason: "Matched by name, and the pack text names the same brand.",
      }),
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
      identity: identityRecord({
        state: "NEEDS_CONFIRMATION",
        identification,
        product: null,
        matchMethod: "none",
        reason: "Several products matched and the scan could not separate them.",
      }),
    };
  }

  // 4. Name, open database.
  const record = await searchByName(`${brand ?? ""} ${name}`.trim(), category);
  if (record) {
    // This path had NO guard at all: whatever an open-database name search
    // returned first became the authoritative identity, with a note asking the
    // shopper to check. A note is not a gate. It is how a scan of an
    // unidentifiable image became a verdict about a product called "Momo black".
    const product = await upsertFromOpenDb(record, category, subcategory, sizeLabel);

    // THE SAME VARIANT RULE AS THE LOCAL MATCHER, APPLIED HERE TOO.
    //
    // searchByName returns whatever the open database ranked first, and until
    // now a corroborated brand was enough to accept it. A real photograph broke
    // that: a bottle reading "renewing + argan oil of morocco PENETRATING OIL"
    // matched "Renewing Argan Oil of Morocco EXTRA Penetrating Oil" — same
    // brand, same size, neighbouring SKU. The brand corroborated perfectly,
    // because the brand was never the thing that was wrong.
    //
    // decideMatch already refuses a candidate carrying words the scan did not
    // read, for exactly this reason. Running the open-database result through
    // it means one rule governs both paths instead of the weaker path deciding
    // what the stricter one would have rejected.
    const openDecision = decideMatch({ name, brand, sizeLabel, visibleText }, [product]);
    if (openDecision.kind !== "auto") {
      return {
        product: null,
        method: "none",
        identityBasis: "uncorroborated",
        note:
          `The closest match we found is ${product.brand ?? "a product"} — ${product.name}, ` +
          "which is not quite what the pack says. Please confirm before we assess anything.",
        candidates: [toMatchCandidate({ product, containment: 1, unseenTokens: [], sizeMatches: false })],
        identity: identityRecord({
          state: "NEEDS_CONFIRMATION",
          identification,
          product,
          matchMethod: "name-open-db",
          reason:
            "An open-database name search returned a product carrying words the scan never read.",
        }),
      };
    }

    const basis = identityBasis({ barcode, visibleText, matchedBrand: product.brand });

    if (!basisPermitsAnalysis(basis)) {
      return {
        product: null,
        method: "none",
        identityBasis: basis,
        note:
          "We found a product with a similar name, but nothing we could read on the pack " +
          "confirms it is the same one, so we have not assessed it.",
        candidates: [toMatchCandidate({ product, containment: 1, unseenTokens: [], sizeMatches: false })],
        identity: identityRecord({
          state: "IDENTIFIED_BY_NAME_ONLY",
          identification,
          product,
          matchMethod: "name-open-db",
          reason: "An open-database name search matched, with nothing on the pack to support it.",
        }),
      };
    }

    return {
      product,
      method: "name-open-db",
      matchSource: "NAME_AUTO",
      note: "Matched by name search, not by barcode. Check the product below is the one in your hand.",
      identityBasis: basis,
      identity: identityRecord({
        state: "IDENTIFIED_BY_NAME_WITH_CORROBORATION",
        identification,
        product,
        matchMethod: "name-open-db",
        reason: "Matched by an open-database name search, corroborated by the pack text.",
      }),
    };
  }

  return {
    product: null,
    method: "none",
    note: "We could not find published evidence for this product. Rather than guess, we are showing you nothing.",
    identity: identityRecord({
      state: "INSUFFICIENT_EVIDENCE",
      identification,
      product: null,
      matchMethod: "none",
      reason: "Nothing in the catalogue or the open databases matched this identification.",
    }),
  };
}
