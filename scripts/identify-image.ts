/**
 * Run ONE real image through the live identification path and report everything.
 *
 *   npm run identify -- fixtures/real/your-photo.jpg
 *
 * This is the validation harness. It does not seed, stub, or substitute: it
 * posts the file you name to the running server's real /api/scan endpoint, the
 * same one the browser posts to, and then reads back what the database actually
 * recorded. Identification is reported BEFORE anything downstream, because if
 * the identity is wrong nothing after it is worth looking at.
 */
import "../lib/load-env";
import { readFileSync, existsSync } from "node:fs";
import { basename, extname } from "node:path";
import { prisma } from "../lib/db";

const BASE = process.env.IDENTIFY_BASE ?? "http://127.0.0.1:3000";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".gif": "image/gif",
};

function line(label: string, value: unknown): void {
  console.log(`  ${label.padEnd(26)} ${value === null || value === undefined ? "—" : String(value)}`);
}

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: npm run identify -- path/to/image.jpg");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(path)) {
    console.error(`No such file: ${path}`);
    process.exitCode = 1;
    return;
  }

  const mime = MIME[extname(path).toLowerCase()];
  if (!mime) {
    console.error(`Unsupported file type: ${extname(path)}. Use jpg, png, webp or gif.`);
    process.exitCode = 1;
    return;
  }

  const bytes = readFileSync(path);
  console.log(`\n# ${basename(path)} — ${(bytes.byteLength / 1024).toFixed(0)} KB, ${mime}`);
  console.log(`# posting to ${BASE}/api/scan\n`);

  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(bytes)], { type: mime }), basename(path));

  const started = Date.now();
  const res = await fetch(`${BASE}/api/scan`, { method: "POST", body: form });
  const took = ((Date.now() - started) / 1000).toFixed(1);
  const body = (await res.json()) as { id?: string; status?: string; error?: string };

  console.log(`HTTP ${res.status} in ${took}s — ${JSON.stringify(body)}\n`);
  if (!body.id) {
    console.log("No scan was created. Nothing further to report.");
    return;
  }

  const scan = await prisma.scan.findUnique({
    where: { id: body.id },
    include: { product: true, analysis: true },
  });
  if (!scan) return;

  const identification = JSON.parse(scan.identificationJson) as Record<string, unknown>;

  console.log("## 1. WHAT THE MODEL READ");
  line("name", identification.name);
  line("brand", identification.brand);
  line("barcode", identification.barcode);
  line("category", identification.category);
  line("subcategory", identification.subcategory);
  line("size", identification.sizeLabel);
  line("confidence", identification.confidence);
  line("visible text", JSON.stringify(identification.visibleText ?? null).slice(0, 120));

  console.log("\n## 2. WHAT NOURA DID WITH IT");
  line("scan status", scan.status);
  line("identificationMode", scan.identificationMode);
  line("identificationProvenance", scan.identificationProvenance);
  line("match method", identification.method);
  line("matchSource", scan.matchSource);
  line("note", identification.note);
  line("error", scan.error);

  console.log("\n## 3. CATALOGUE MATCH");
  if (scan.product) {
    line("product", `${scan.product.brand ?? "?"} — ${scan.product.name}`);
    line("barcode", scan.product.barcode);
    line("size", scan.product.sizeLabel);
    line("category", `${scan.product.category}/${scan.product.subcategory ?? "-"}`);
    line("evidence source", scan.product.evidenceSource);
  } else {
    line("product", "(none — nothing was matched)");
  }

  console.log("\n## 4. ANALYSIS");
  if (scan.analysis) {
    const verdict = JSON.parse(scan.analysis.verdictJson) as { verdict: string; reason?: string };
    line("verdict", verdict.verdict);
    line("reason", verdict.reason);
    console.log("\n  ⚠️  An analysis exists. It is ONLY valid if section 3 names the product");
    console.log("      that is actually in the image. If it does not, that is a FAILURE.");
  } else {
    line("analysis", "(none — no verdict was produced)");
    console.log("\n  Nothing downstream ran, which is correct whenever identity is not established.");
  }

  const candidates = scan.candidatesJson
    ? (JSON.parse(scan.candidatesJson) as { name: string; brand: string | null }[])
    : [];
  if (candidates.length > 0) {
    console.log("\n## 5. CANDIDATES OFFERED FOR CONFIRMATION");
    for (const c of candidates) console.log(`   - ${c.brand ?? "?"} — ${c.name}`);
  }

  console.log(`\nResult page: ${BASE}/result/${scan.id}\n`);
}

void main().finally(() => prisma.$disconnect());
