/**
 * The pilot set: products chosen to test Noura honestly, not to flatter it.
 *
 * Selection is by what each product can DEMONSTRATE, not by how well it scores.
 * The set must contain, deliberately, cases where Noura has little to say —
 * a product with no certification record, and a product with no defensible
 * alternative — because those are the answers a trustworthy system has to give
 * well, and they are the ones a flattering demo would leave out.
 */
import "../lib/load-env";
import { prisma } from "../lib/db";
import { findVerifiedAlternatives } from "../lib/recommend/alternatives";
import { certificationFor } from "../lib/health/checks";
import { buildEvidenceInput } from "../lib/pipeline/analyze";
import { pricePriority } from "../lib/retail/priority";

type Row = {
  slug: string;
  name: string;
  brand: string | null;
  category: string;
  certification: string;
  alternatives: number;
  recommendedTo: number;
  listings: number;
  hasIngredients: boolean;
  role: string;
};

async function main(): Promise<void> {
  const products = await prisma.product.findMany({
    include: {
      certifications: { include: { body: true } },
      evidenceLookups: true,
      listings: true,
    },
  });

  const { rows: priority } = await pricePriority(60);
  const weight = new Map(priority.map((p) => [p.slug, p.recommendedTo]));

  const rows: Row[] = [];
  for (const p of products) {
    const input = buildEvidenceInput(p as never, p.certifications as never, p.evidenceLookups);
    const state = certificationFor(input).state;
    const result = await findVerifiedAlternatives({ productId: p.id, limit: 3 });
    rows.push({
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      category: p.category,
      certification: state,
      alternatives: result.alternatives.length,
      recommendedTo: weight.get(p.slug) ?? 0,
      listings: p.listings.length,
      hasIngredients: Boolean(p.ingredientsText),
      role: "",
    });
  }

  const pick = (label: string, predicate: (r: Row) => boolean, n: number, chosen: Set<string>) => {
    const out = rows
      .filter((r) => !chosen.has(r.slug) && predicate(r))
      // Within a required role, prefer the product that unlocks the most.
      .sort((a, b) => b.recommendedTo - a.recommendedTo || b.alternatives - a.alternatives)
      .slice(0, n);
    for (const r of out) {
      r.role = label;
      chosen.add(r.slug);
    }
    return out;
  };

  const chosen = new Set<string>();
  const set: Row[] = [
    // The five cases §2 requires, each filled by the strongest candidate for it.
    ...pick("exact certification verified", (r) => r.certification === "VERIFIED" && r.listings > 0, 4, chosen),
    ...pick("brand-level evidence only", (r) => r.certification === "BRAND_LEVEL_ONLY" && r.listings > 0, 3, chosen),
    ...pick("no record in MOIAT", (r) => r.certification === "NOT_FOUND" && r.listings > 0, 3, chosen),
    ...pick("meaningful alternatives", (r) => r.alternatives >= 2, 3, chosen),
    ...pick("no defensible alternative", (r) => r.alternatives === 0 && r.listings > 0, 3, chosen),
    // Then whatever unlocks the most recommendation slots.
    ...pick("highest recommendation weight", (r) => r.recommendedTo > 0, 4, chosen),
  ];

  console.log(`# Pilot set — ${set.length} products\n`);
  console.log("Each row says what it is here to demonstrate.\n");
  for (const r of set) {
    console.log(
      `  ${r.role.padEnd(30)} ${(r.brand ?? "?").slice(0, 16).padEnd(16)} ` +
        `${r.name.slice(0, 32).padEnd(32)} cert=${r.certification.padEnd(17)} ` +
        `alts=${r.alternatives} rec=${r.recommendedTo} listings=${r.listings}`,
    );
  }

  const bySlug = new Map(set.map((r) => [r.slug, r]));
  console.log("\n## Coverage of the required cases");
  const need: [string, (r: Row) => boolean][] = [
    ["exact certification verification", (r) => r.certification === "VERIFIED"],
    ["brand-level evidence", (r) => r.certification === "BRAND_LEVEL_ONLY"],
    ["certification NOT_FOUND / UNKNOWN", (r) => r.certification === "NOT_FOUND" || r.certification === "UNKNOWN"],
    ["meaningful verified alternatives", (r) => r.alternatives >= 1],
    ["no defensible alternative", (r) => r.alternatives === 0],
  ];
  for (const [label, predicate] of need) {
    const hit = [...bySlug.values()].filter(predicate).length;
    console.log(`  ${hit > 0 ? "OK " : "MISSING"}  ${label}: ${hit} product(s)`);
  }

  console.log("\n## Slugs, for the commerce export");
  console.log(set.map((r) => r.slug).join("\n"));
}

void main().finally(() => prisma.$disconnect());
