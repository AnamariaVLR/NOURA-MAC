/**
 * The answer to "Which one is this?".
 *
 * This is where a scan awaiting confirmation becomes a scan with a verdict.
 * Nothing was evaluated before this point: there is no HealthAnalysis row until
 * the shopper has said which product they are holding, because a verdict about
 * the wrong variant is worse than no verdict.
 *
 * Two rules it enforces, both about not trusting the caller:
 *
 *   1. THE SCAN MUST BE THEIRS. Same cookie check as /api/image, same 404 for
 *      "no such scan" and "not your scan".
 *   2. THE PRODUCT MUST HAVE BEEN OFFERED. A productId that was not in the
 *      candidate list this scan recorded is refused, so the endpoint cannot be
 *      used to attach any product in the catalogue to any photo.
 *
 * Re-confirming is allowed and replaces the analysis, because "Not this
 * product?" has to lead somewhere.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { analyseProduct, type CertificationWithBody } from "@/lib/pipeline/analyze";
import { MatchCandidateSchema, parseJsonColumn } from "@/lib/schemas";
import { currentUserKey } from "@/lib/user";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const userKey = await currentUserKey();
  if (!userKey) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const scan = await prisma.scan.findUnique({ where: { id } });
  if (!scan || scan.userKey !== userKey) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let productId = "";
  try {
    const form = await request.formData();
    productId = String(form.get("productId") ?? "").trim();
  } catch {
    return NextResponse.json({ error: "Send the choice as form data." }, { status: 400 });
  }
  if (!productId) {
    return NextResponse.json({ error: "No product was chosen." }, { status: 400 });
  }

  // Rule 2 — only a product this scan actually offered.
  const offered = parseJsonColumn(scan.candidatesJson, z.array(MatchCandidateSchema)) ?? [];
  if (!offered.some((c) => c.productId === productId)) {
    return NextResponse.json(
      { error: "That product was not one of the options for this scan." },
      { status: 400 },
    );
  }

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) {
    return NextResponse.json({ error: "That product no longer exists." }, { status: 404 });
  }

  const certifications = (await prisma.productCertification.findMany({
    where: { productId: product.id },
    include: { body: true },
  })) as CertificationWithBody[];

  const analysis = await analyseProduct(product, certifications);

  // Upsert rather than create: re-confirming after "Not this product?" replaces
  // the previous answer instead of failing on the unique scanId.
  await prisma.healthAnalysis.upsert({
    where: { scanId: scan.id },
    create: {
      scanId: scan.id,
      productId: product.id,
      verdict: analysis.verdict.verdict,
      verdictJson: JSON.stringify(analysis.verdict),
      checksJson: JSON.stringify(analysis.checks),
      unknownsJson: JSON.stringify(analysis.unknowns),
      notesJson: JSON.stringify(analysis.notes),
      model: analysis.model,
      mode: analysis.mode,
    },
    update: {
      productId: product.id,
      verdict: analysis.verdict.verdict,
      verdictJson: JSON.stringify(analysis.verdict),
      checksJson: JSON.stringify(analysis.checks),
      unknownsJson: JSON.stringify(analysis.unknowns),
      notesJson: JSON.stringify(analysis.notes),
      model: analysis.model,
      mode: analysis.mode,
    },
  });

  await prisma.scan.update({
    where: { id: scan.id },
    data: { productId: product.id, status: "complete", matchSource: "USER_CONFIRMED", error: null },
  });

  return NextResponse.json({ id: scan.id, product: product.name }, { status: 200 });
}
