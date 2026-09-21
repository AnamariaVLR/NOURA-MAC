/**
 * Stage 4 — health analysis.
 *
 * evaluateProduct() does the work. The model is offered one job: say the same
 * thing in better English. If it declines, misfires, or drifts off the evidence,
 * we ship the deterministic sentences and the page is no worse.
 */
import type {
  AccreditedBody,
  EvidenceLookup,
  Product,
  ProductCertification,
} from "@prisma/client";
import { uaeConformityLookup } from "../evidence/lookups";
import { callTool } from "../anthropic";
import { MODEL, runMode } from "../config";
import type { CertificationEvidence } from "../health/checks";
import { evaluateProduct, type Evaluation } from "../health/evaluate";
import {
  HEALTH_SYSTEM,
  HEALTH_TOOL,
  allowedCheckKeys,
  healthUserPrompt,
} from "../prompts/health";
import {
  HealthAnalysisResultSchema,
  ModelCheckProseSchema,
  NutritionFactsSchema,
  ProductCategorySchema,
  StringListSchema,
  parseJsonColumn,
  type HealthAnalysisResult,
  type SourceRef,
} from "../schemas";

export type CertificationWithBody = ProductCertification & { body: AccreditedBody | null };

/** A product with everything the checker needs read alongside it. */
export type ProductWithEvidence = Product & {
  certifications: CertificationWithBody[];
  evidenceLookups?: EvidenceLookup[];
};

export function productSource(product: Product): SourceRef {
  return {
    name: product.evidenceSource,
    url: product.evidenceSourceUrl,
    lastVerifiedAt: product.lastVerifiedAt.toISOString(),
  };
}

export function toCertificationEvidence(
  certifications: CertificationWithBody[],
): CertificationEvidence[] {
  return certifications.map((c) => ({
    certificateType: c.certificateType,
    status: (c.status === "expired" || c.status === "suspended" ? c.status : "valid") as
      | "valid"
      | "expired"
      | "suspended",
    rawStatus: c.rawStatus,
    issuedAt: c.issuedAt,
    expiresAt: c.expiresAt,
    matchBasis: c.matchBasis,
    bodyName: c.body?.name ?? null,
    certificateNumber: c.certificateNumber,
    registerBrand: c.registerBrand,
    registerModelNumber: c.registerModelNumber,
    registerProductType: c.registerProductType,
    registerCompany: c.registerCompany,
    sourceKind: c.source,
    source: {
      name: c.sourceName,
      url: c.sourceUrl,
      lastVerifiedAt: c.lastVerifiedAt.toISOString(),
    },
  }));
}

/** Everything the checker needs, read out of the database columns via Zod. */
export function buildEvidenceInput(
  product: Product,
  certifications: CertificationWithBody[],
  evidenceLookups: EvidenceLookup[] = [],
) {
  return {
    // A category we do not recognise falls back to the generic food rule rather
    // than losing the product. `food` applies the universal checks of §3 and says
    // so on the page (C4.11.2), which is the honest outcome for an unknown kind.
    category: ProductCategorySchema.catch("food").parse(product.category),
    subcategory: product.subcategory,
    nutrition: parseJsonColumn(product.nutritionJson, NutritionFactsSchema),
    novaGroup: product.novaGroup,
    additives: parseJsonColumn(product.additivesJson, StringListSchema) ?? [],
    allergens: parseJsonColumn(product.allergensJson, StringListSchema) ?? [],
    ingredientsText: product.ingredientsText,
    certifications: toCertificationEvidence(certifications),
    // Null means the UAE register was never asked, which is UNKNOWN. Asked and
    // empty is NOT FOUND, and the two must not render the same way.
    // The certification check asks one question — UAE conformity — of one
    // register. Other (source, claim) answers live alongside it and are rendered
    // separately; collapsing them here is exactly what the model change forbids.
    certificationLookup: uaeConformityLookup(evidenceLookups),
    evidenceSource: productSource(product),
  };
}

/**
 * Merge model prose onto the deterministic checklist. Anything the model returns
 * for a key we did not send is dropped; a key it omits keeps our wording. The
 * status, the evidence, the source and the verdict are never up to the model.
 */
export function mergeModelProse(
  evaluation: Evaluation,
  raw: unknown,
): { checks: Evaluation["checks"]; used: boolean } {
  const parsed = ModelCheckProseSchema.safeParse(raw);
  if (!parsed.success) return { checks: evaluation.checks, used: false };

  const allowed = new Set(allowedCheckKeys(evaluation));
  const byKey = new Map<string, { claim: string; detail: string }>();
  for (const c of parsed.data.checks) {
    if (allowed.has(c.key)) byKey.set(c.key, { claim: c.claim, detail: c.detail });
  }
  if (byKey.size === 0) return { checks: evaluation.checks, used: false };

  const checks = evaluation.checks.map((check) => {
    const rewritten = byKey.get(check.key);
    return rewritten ? { ...check, claim: rewritten.claim, detail: rewritten.detail } : check;
  });

  return { checks, used: true };
}

export async function analyseProduct(
  product: Product,
  certifications: CertificationWithBody[],
  evidenceLookups: EvidenceLookup[] = [],
): Promise<HealthAnalysisResult> {
  const input = buildEvidenceInput(product, certifications, evidenceLookups);
  const evaluation = evaluateProduct(input);

  let checks = evaluation.checks;
  let model = "deterministic";
  let mode: "live" | "mock" = "mock";

  if (runMode() === "live") {
    const raw = await callTool({
      system: HEALTH_SYSTEM,
      messages: [
        {
          role: "user",
          content: healthUserPrompt({
            productName: product.name,
            brand: product.brand,
            category: input.category,
            evaluation,
          }),
        },
      ],
      tool: HEALTH_TOOL,
      maxTokens: 1500,
    });

    const merged = mergeModelProse(evaluation, raw);
    checks = merged.checks;
    if (merged.used) {
      model = MODEL;
      mode = "live";
    }
  }

  // Final gate: if this does not validate, something upstream is wrong and the
  // user should see an error, not a half-built verdict.
  return HealthAnalysisResultSchema.parse({
    verdict: evaluation.verdict,
    checks,
    unknowns: evaluation.unknowns,
    // Notes are never sent to the model and never rewritten. They quote sources
    // verbatim — a declined threshold, an authorised claim — and a paraphrase of
    // a quotation is not a quotation.
    notes: evaluation.notes,
    model,
    mode,
  });
}
