/**
 * The six stages, in order, with the scan row as the audit trail.
 *
 *   1. capture      (the caller has already written the image to disk)
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
import { analyseProduct, type CertificationWithBody } from "./analyze";
import { gatherEvidence } from "./evidence";
import { identifyProduct } from "./identify";

export type RunResult = { scanId: string; status: "complete" | "failed" };

export async function runPipeline(args: {
  userKey: string;
  imageBase64: string;
  mime: string;
  imagePath: string;
}): Promise<RunResult> {
  const { identification, mode, note } = await identifyProduct({
    base64: args.imageBase64,
    mime: args.mime,
  });

  const evidence = await gatherEvidence(identification);

  if (!evidence.product) {
    const scan = await prisma.scan.create({
      data: {
        userKey: args.userKey,
        imagePath: args.imagePath,
        imageMime: args.mime,
        status: "failed",
        mode,
        identificationJson: JSON.stringify({ ...identification, note, method: evidence.method }),
        error: evidence.note ?? "No published evidence was found for this product.",
      },
    });
    return { scanId: scan.id, status: "failed" };
  }

  const certifications = (await prisma.productCertification.findMany({
    where: { productId: evidence.product.id },
    include: { body: true },
  })) as CertificationWithBody[];

  const analysis = await analyseProduct(evidence.product, certifications);

  const scan = await prisma.scan.create({
    data: {
      userKey: args.userKey,
      imagePath: args.imagePath,
      imageMime: args.mime,
      status: "complete",
      mode,
      identificationJson: JSON.stringify({
        ...identification,
        note: note ?? evidence.note,
        method: evidence.method,
      }),
      productId: evidence.product.id,
      analysis: {
        create: {
          productId: evidence.product.id,
          verdict: analysis.verdict.verdict,
          verdictJson: JSON.stringify(analysis.verdict),
          checksJson: JSON.stringify(analysis.checks),
          unknownsJson: JSON.stringify(analysis.unknowns),
          model: analysis.model,
          mode: analysis.mode,
        },
      },
    },
  });

  return { scanId: scan.id, status: "complete" };
}
