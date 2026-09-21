/**
 * The controlled contradiction, run through the real matcher.
 *
 * This is the one case in the real-world suite that does NOT need a
 * photograph, and should not pretend to be one. Getting a camera to produce a
 * barcode that resolves to the wrong product means either doctoring a pack or
 * waiting for a genuine misread, so the identification is CONSTRUCTED here and
 * fed to the real gatherEvidence — the same function the scan pipeline calls,
 * against the real catalogue.
 *
 * What is real: the matcher, the catalogue, the contradiction rule, the states.
 * What is constructed: the model's answer. That is stated plainly rather than
 * dressed up as a photograph.
 */
import "../lib/load-env";
import { prisma } from "../lib/db";
import { gatherEvidence } from "../lib/pipeline/evidence";
import { permitsAnalysis, type IdentityState } from "../lib/pipeline/identity";

type Case = {
  label: string;
  expect: IdentityState;
  identification: Record<string, unknown>;
};

async function main(): Promise<void> {
  // Two real catalogue products, so the contradiction is between two things
  // that genuinely exist and both carry real evidence. That is what makes a
  // misread dangerous rather than harmless.
  const visual = await prisma.product.findFirst({ where: { brand: { contains: "AL RAWABI" } } });
  const other = await prisma.product.findFirst({
    where: { barcode: { not: null }, NOT: { brand: { contains: "AL RAWABI" } }, category: "yogurt" },
  });

  if (!visual || !other) {
    console.log("Need two yogurt products in the catalogue to build the contradiction.");
    return;
  }

  console.log("# Controlled contradiction (constructed identification, real matcher)\n");
  console.log(`  visual evidence points at : ${visual.brand} — ${visual.name}`);
  console.log(`  barcode resolves to       : ${other.brand} — ${other.name}  [${other.barcode}]\n`);

  const cases: Case[] = [
    {
      label: "barcode disagrees with BOTH the claimed brand and the pack text",
      expect: "NEEDS_CONFIRMATION",
      identification: {
        name: visual.name,
        brand: visual.brand,
        barcode: other.barcode,
        category: visual.category,
        subcategory: visual.subcategory,
        sizeLabel: visual.sizeLabel,
        confidence: 0.95,
        visibleText: `${visual.brand} ${visual.name} ${visual.sizeLabel ?? ""}`,
      },
    },
    {
      label: "no barcode at all, same visual evidence",
      expect: "IDENTIFIED_BY_NAME_WITH_CORROBORATION",
      identification: {
        name: visual.name,
        brand: visual.brand,
        barcode: null,
        category: visual.category,
        subcategory: visual.subcategory,
        sizeLabel: visual.sizeLabel,
        confidence: 0.95,
        visibleText: `${visual.brand} ${visual.name} ${visual.sizeLabel ?? ""}`,
      },
    },
  ];

  let failures = 0;
  for (const c of cases) {
    const result = await gatherEvidence(c.identification as never);
    const state = result.identity?.state ?? "(none)";
    const allowed = state !== "(none)" && permitsAnalysis(state as IdentityState);
    const assessedWrongProduct = result.product?.id === other.id;

    const ok = state === c.expect && !assessedWrongProduct;
    if (!ok) failures += 1;

    console.log(`## ${c.label}`);
    console.log(`   expected state : ${c.expect}`);
    console.log(`   actual state   : ${state}`);
    console.log(`   product        : ${result.product ? `${result.product.brand} — ${result.product.name}` : "(none)"}`);
    console.log(`   verdict allowed: ${allowed ? "YES" : "no"}`);
    console.log(`   assessed the barcode product: ${assessedWrongProduct ? "YES — FAILURE" : "no"}`);
    console.log(`   => ${ok ? "PASS" : "FAIL"}\n`);
  }

  console.log(failures === 0 ? "All controlled contradiction cases behaved correctly." : `${failures} case(s) FAILED.`);
  if (failures > 0) process.exitCode = 1;
}

void main().finally(() => prisma.$disconnect());
