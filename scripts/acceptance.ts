/**
 * Real journeys, through the running application.
 *
 * Seeds a scan awaiting confirmation for each pilot product, confirms it over
 * HTTP exactly as the browser would, fetches the result page, and records WHAT
 * A PERSON SEES at each stage. Nothing here calls an internal function: the
 * point is to test the product, and the two worst defects this project has had
 * both passed every unit test and failed on a real page.
 */
import "../lib/load-env";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/db";

const BASE = process.env.ACCEPTANCE_BASE ?? "http://127.0.0.1:3210";

const PILOT = [
  "activia-", "nada-", "lacnor-milk", "almarai--0655",
  "kelloggs-special-k-500g", "spinneysfood-peri-peri-hummus", "waitrose-fig-plum-and-cranberry-wheat-biscuit",
  "keto-real-moketo", "koala-picks-peanut-butter-cookies",
  "mai-dubai-water-500ml", "al-ain-al-ain-pure-natural-bottled-water", "evian-evian-mineral-water",
  "borges-extra-virgin-olive-oil-1l", "coca-cola-330ml",
];

function textOf(htmlSource: string): string {
  const stripped = htmlSource
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, "\n");
  return stripped
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&ldquo;|&rdquo;/g, '"').replace(/&mdash;/g, "—");
}

function firstMatch(body: string, pattern: RegExp): string | null {
  for (const line of textOf(body).split("\n").map((l) => l.trim()).filter(Boolean)) {
    if (pattern.test(line)) return line;
  }
  return null;
}

async function run(slug: string): Promise<void> {
  const product = await prisma.product.findFirst({ where: { slug } });
  if (!product) {
    console.log(`\n### ${slug}\n   NOT IN CATALOGUE`);
    return;
  }

  const userKey = randomUUID();
  const scan = await prisma.scan.create({
    data: {
      userKey,
      status: "needs_confirmation",
      mode: "mock",
      identificationJson: JSON.stringify({
        name: product.name, brand: product.brand, barcode: product.barcode,
        category: product.category, subcategory: product.subcategory,
        sizeLabel: product.sizeLabel, confidence: 0.7, visibleText: product.brand ?? "",
        method: "none",
      }),
      candidatesJson: JSON.stringify([{
        productId: product.id, slug: product.slug, name: product.name, brand: product.brand,
        sizeLabel: product.sizeLabel, imageUrl: product.imageUrl, variant: [],
      }]),
    },
  });

  const cookie = `noura_user=${userKey}`;
  const form = new URLSearchParams({ productId: product.id });
  const confirm = await fetch(`${BASE}/api/scan/${scan.id}/confirm`, {
    method: "POST",
    headers: { cookie, "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });

  console.log(`\n### ${product.brand ?? "?"} — ${product.name}`);
  console.log(`   slug ${slug} · barcode ${product.barcode}`);
  if (!confirm.ok) {
    console.log(`   CONFIRM FAILED ${confirm.status}: ${(await confirm.text()).slice(0, 140)}`);
    return;
  }

  const page = await fetch(`${BASE}/result/${scan.id}`, { headers: { cookie } });
  const body = await page.text();
  console.log(`   result page ${page.status}`);

  const report: [string, RegExp][] = [
    ["IDENTIFIED   ", /__NAME__/],
    ["PROVENANCE   ", /Matched by barcode|You confirmed|read off the pack/i],
    ["VERDICT      ", /^(GOOD CHOICE|ACCEPTABLE|NOT RECOMMENDED|COULD NOT VERIFY)$/],
    ["WHY          ", /checks passed|could not be checked|Contains|above the line|Nothing about/i],
    ["CERTIFICATION", /^UAE conformity/i],
    ["ALTERNATIVES ", /comparable product|Suggested because|nothing else of this kind/i],
    ["PRICE        ", /Price checked by hand|Price shown by|No price has been checked|Price not verified/i],
    ["AVAILABILITY ", /in stock on|Listed as|not confirmed|Availability not verified/i],
  ];
  // The name as the page actually renders it, from its own test id.
  const nameMatch = body.match(/data-testid="product-name"[^>]*>([^<]{1,90})/);
  console.log(`   IDENTIFIED    ${nameMatch ? nameMatch[1] : "— (absent)"}`);

  for (const [label, pattern] of report) {
    if (label.trim() === "IDENTIFIED") continue;
    const hit = firstMatch(body, pattern);
    console.log(`   ${label} ${hit ? hit.slice(0, 92) : "— (absent)"}`);
  }
}

async function main(): Promise<void> {
  console.log(`# Acceptance journeys against ${BASE}`);
  for (const slug of PILOT) await run(slug);
}

void main().finally(() => prisma.$disconnect());
