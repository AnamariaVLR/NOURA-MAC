/**
 * The six stages, in order, with the scan row as the audit trail.
 *
 *   1. capture      (the caller has already stored the image; lib/storage.ts
 *                    decides whether that meant a blob, a row or a file)
 *   2. identify     lib/pipeline/identify.ts
 *   3. evidence     lib/pipeline/evidence.ts
 *   4. analyse      lib/pipeline/analyze.ts
 *   5. UAE search   lib/retail/search.ts          (run when the result page renders)
 *   6. alternatives lib/recommend/alternatives.ts (likewise)
 *
 * Stages 5 and 6 are deliberately left to render time: they are cheap, they have
 * no model call, and a price should reflect the moment the page is opened rather
 * than the moment the photo was taken.
 */
import { prisma } from "../db";
import type { Identification } from "../schemas";
import { analyseProduct, type CertificationWithBody } from "./analyze";
import { gatherEvidence } from "./evidence";
import { identifyProduct } from "./identify";
import {
  assertSameIdentity,
  permitsAnalysis,
  type IdentityRecord,
  type IdentityState,
} from "./identity";

export type RunResult = {
  scanId: string;
  status: "complete" | "needs_confirmation" | "failed";
};

/**
 * Records a product the catalogue does not have, so /admin/missing can show it.
 *
 * Fingerprinted on brand + name, so the same product scanned by five people is
 * one row with timesSeen 5 rather than five rows. Failing here must never fail
 * the scan: the shopper's page does not depend on the queue.
 */
async function queueMissingProduct(
  identification: Identification,
  scanId: string | null,
): Promise<void> {
  const fingerprint = `${identification.brand ?? ""}|${identification.name}`
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (fingerprint === "|" || fingerprint.length < 2) return;

  try {
    await prisma.missingProduct.upsert({
      where: { fingerprint },
      create: {
        fingerprint,
        name: identification.name,
        brand: identification.brand,
        sizeLabel: identification.sizeLabel,
        category: identification.category,
        subcategory: identification.subcategory,
        visibleText: identification.visibleText,
        lastScanId: scanId,
      },
      update: { timesSeen: { increment: 1 }, lastScanId: scanId },
    });
  } catch (error) {
    console.error("[pipeline] could not queue missing product:", error);
  }
}

export type StoredImageRef = {
  imagePath?: string | null;
  imageMime?: string | null;
  imageBlobUrl?: string | null;
  imageBytes?: Buffer | null;
};

/** The identity columns, written identically on every scan row. */
function identityColumns(identity: IdentityRecord | undefined, fallback: IdentityState) {
  return {
    identityState: identity?.state ?? fallback,
    identityJson: identity ? JSON.stringify(identity) : null,
    identityFingerprint: identity?.fingerprint ?? null,
  };
}

export async function runPipeline(args: {
  userKey: string;
  imageBase64: string;
  mime: string;
  /** Wherever lib/storage.ts put the photo. Any or all of the fields may be null. */
  image: StoredImageRef;
}): Promise<RunResult> {
  const { identification, mode, note } = await identifyProduct({
    base64: args.imageBase64,
    mime: args.mime,
  });

  // A live identification that could not be made is a FAILED scan, not a scan of
  // whatever the fixture happens to be. See lib/pipeline/identify.ts.
  if (!identification) {
    const scan = await prisma.scan.create({
      data: {
        userKey: args.userKey,
        imagePath: args.image.imagePath ?? null,
        imageBlobUrl: args.image.imageBlobUrl ?? null,
        imageBytes: args.image.imageBytes ? new Uint8Array(args.image.imageBytes) : null,
        imageMime: args.image.imageMime ?? args.mime,
        status: "failed",
        mode,
        identificationMode: "failed",
        identificationProvenance: "none",
        ...identityColumns(undefined, "NOT_IDENTIFIED"),
        identificationJson: JSON.stringify({ note, method: "none" }),
        error:
          note ??
          "We could not read a product from that photo. Try again with the front of the pack in frame.",
      },
    });
    return { scanId: scan.id, status: "failed" };
  }

  const evidence = await gatherEvidence(identification);

  const image = {
    imagePath: args.image.imagePath ?? null,
    imageBlobUrl: args.image.imageBlobUrl ?? null,
    imageBytes: args.image.imageBytes ? new Uint8Array(args.image.imageBytes) : null,
    imageMime: args.image.imageMime ?? args.mime,
  };
  const identificationJson = JSON.stringify({
    ...identification,
    note: note ?? evidence.note,
    method: evidence.method,
  });

  // A TIE IS A QUESTION. The matcher found products it could not separate, so
  // the scan stops here: no HealthAnalysis row is created, because a verdict
  // about the wrong variant is worse than no verdict. /result/[id] renders the
  // question and /api/scan/[id]/confirm finishes the job.
  if (!evidence.product && evidence.candidates && evidence.candidates.length > 0) {
    const scan = await prisma.scan.create({
      data: {
        userKey: args.userKey,
        ...image,
        status: "needs_confirmation",
        mode,
        // Read, but not separable. No analysis exists until the user answers.
        identificationMode: "uncertain",
        identificationProvenance: mode === "mock" ? "fixture" : "image_model",
        ...identityColumns(evidence.identity, "NEEDS_CONFIRMATION"),
        identificationJson,
        candidatesJson: JSON.stringify(evidence.candidates),
      },
    });
    return { scanId: scan.id, status: "needs_confirmation" };
  }

  if (!evidence.product) {
    const scan = await prisma.scan.create({
      data: {
        userKey: args.userKey,
        ...image,
        status: "failed",
        mode,
        identificationMode: "failed",
        identificationProvenance: "none",
        ...identityColumns(evidence.identity, "INSUFFICIENT_EVIDENCE"),
        identificationJson,
        error: evidence.note ?? "No published evidence was found for this product.",
      },
    });
    // The pilot's most useful output is a list of what it could not identify.
    await queueMissingProduct(identification, scan.id);
    return { scanId: scan.id, status: "failed" };
  }

  // ── THE IDENTITY GATE ──────────────────────────────────────────────────
  //
  // One decision, made once, consumed by everything after it. Each stage
  // re-checks the fingerprint of the product it is about to work on, so that
  // "evidence for product A, nutrition for product B" cannot happen quietly:
  // it throws instead.
  const expected = evidence.identity?.fingerprint ?? null;

  if (evidence.identity && !permitsAnalysis(evidence.identity.state)) {
    // Belt and braces. gatherEvidence already returns product: null for these
    // states, so reaching here means a future edit broke that contract.
    throw new Error(
      `Refusing to analyse: identity state ${evidence.identity.state} does not permit it.`,
    );
  }

  assertSameIdentity("evidence retrieval", expected, evidence.product);

  const certifications = (await prisma.productCertification.findMany({
    where: { productId: evidence.product.id },
    include: { body: true },
  })) as CertificationWithBody[];
  const evidenceLookups = await prisma.evidenceLookup.findMany({
    where: { productId: evidence.product.id },
  });

  assertSameIdentity("analysis", expected, evidence.product);
  const analysis = await analyseProduct(evidence.product, certifications, evidenceLookups);

  const scan = await prisma.scan.create({
    data: {
      userKey: args.userKey,
      ...image,
      status: "complete",
      mode,
      // The one place a scan acquires a verdict. The mode says how it got the
      // identity that verdict is about; a "mock" here can only have come from
      // an explicitly requested fixture, because fixtureAllowed() is the only
      // door and it opens on NOURA_FORCE_MOCK alone.
      identificationMode: mode === "mock" ? "mock" : "live",
      identificationProvenance:
        mode === "mock" ? "fixture" : evidence.matchSource === "BARCODE" ? "barcode" : "image_model",
      ...identityColumns(evidence.identity, "IDENTIFIED_BY_BARCODE"),
      identificationJson,
      matchSource: evidence.matchSource ?? null,
      candidatesJson: evidence.candidates ? JSON.stringify(evidence.candidates) : null,
      productId: evidence.product.id,
      analysis: {
        create: {
          productId: evidence.product.id,
          verdict: analysis.verdict.verdict,
          verdictJson: JSON.stringify(analysis.verdict),
          checksJson: JSON.stringify(analysis.checks),
          unknownsJson: JSON.stringify(analysis.unknowns),
          notesJson: JSON.stringify(analysis.notes),
          model: analysis.model,
          mode: analysis.mode,
        },
      },
    },
  });

  return { scanId: scan.id, status: "complete" };
}
