/**
 * Run every image in fixtures/real/ through the real application and print the
 * identity audit table.
 *
 *   npm run identify:batch
 *
 * Each image is posted to the running server's /api/scan, exactly as the
 * browser posts it. Nothing is stubbed and nothing is substituted: if an image
 * fails to identify, that is the result, and it is reported as the result.
 *
 * The table is the point. A per-image narrative is easy to read charitably;
 * a row that says "verdict allowed: YES" next to "correct: NO" is not.
 */
import "../lib/load-env";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import { prisma } from "../lib/db";

const BASE = process.env.IDENTIFY_BASE ?? "http://127.0.0.1:3000";
const DIR = "fixtures/real";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

type Row = {
  file: string;
  read: string;
  barcode: string;
  match: string;
  state: string;
  verdictAllowed: string;
  ran: string;
};

function cell(value: unknown, width = 0): string {
  const s = value === null || value === undefined || value === "" ? "—" : String(value);
  return width ? s.slice(0, width) : s;
}

async function one(file: string): Promise<Row | null> {
  const path = join(DIR, file);
  const mime = MIME[extname(file).toLowerCase()];
  if (!mime) return null;

  const bytes = readFileSync(path);
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(bytes)], { type: mime }), file);

  const started = Date.now();
  const res = await fetch(`${BASE}/api/scan`, { method: "POST", body: form });
  const took = ((Date.now() - started) / 1000).toFixed(1);
  const body = (await res.json()) as { id?: string; error?: string };

  console.log(`\n${"=".repeat(78)}\n## ${file}  (${(bytes.byteLength / 1024).toFixed(0)} KB, ${took}s)`);
  if (!body.id) {
    console.log(`   no scan created: ${body.error ?? res.status}`);
    return { file, read: "—", barcode: "—", match: "—", state: "NO SCAN", verdictAllowed: "no", ran: "—" };
  }

  const scan = await prisma.scan.findUnique({
    where: { id: body.id },
    include: { product: true, analysis: true },
  });
  if (!scan) return null;

  const ident = JSON.parse(scan.identificationJson) as Record<string, unknown>;
  const identity = scan.identityJson
    ? (JSON.parse(scan.identityJson) as Record<string, unknown>)
    : null;
  const candidates = scan.candidatesJson
    ? (JSON.parse(scan.candidatesJson) as { name: string; brand: string | null }[])
    : [];

  console.log("   WHAT THE MODEL READ");
  console.log(`     brand        : ${cell(ident.brand)}`);
  console.log(`     name         : ${cell(ident.name)}`);
  console.log(`     variant/size : ${cell(ident.sizeLabel)}  category ${cell(ident.category)}/${cell(ident.subcategory)}`);
  console.log(`     barcode      : ${cell(ident.barcode)}`);
  console.log(`     confidence   : ${cell(ident.confidence)}`);
  console.log(`     visible text : ${cell(ident.visibleText, 150)}`);

  console.log("   IDENTITY");
  console.log(`     state        : ${scan.identityState}`);
  console.log(`     mode         : ${scan.identificationMode}   provenance ${scan.identificationProvenance}`);
  console.log(`     match method : ${cell(ident.method)}`);
  console.log(`     fingerprint  : ${cell(scan.identityFingerprint)}`);
  if (identity) {
    console.log(`     brandAgrees  : ${cell(identity.brandAgrees)}   textCorroborates ${cell(identity.textCorroborates)}`);
    console.log(`     barcodeContradicted : ${cell(identity.barcodeContradicted)}`);
    console.log(`     reason       : ${cell(identity.reason)}`);
  }

  console.log("   RESULT");
  console.log(`     product      : ${scan.product ? `${scan.product.brand ?? "?"} — ${scan.product.name}  (${scan.product.sizeLabel ?? "?"}, ${cell(scan.product.barcode)})` : "(none)"}`);
  console.log(`     analysis ran : ${scan.analysis ? "YES" : "no"}`);
  if (candidates.length > 0) {
    console.log(`     asked about  : ${candidates.map((c) => `${c.brand ?? "?"} — ${c.name}`).join(" | ")}`);
  }

  return {
    file,
    read: `${cell(ident.brand)} / ${cell(ident.name, 26)} / ${cell(ident.sizeLabel)}`,
    barcode: ident.barcode ? "yes" : "no",
    match: scan.product ? `${scan.product.brand ?? "?"} — ${scan.product.name}`.slice(0, 34) : "(none)",
    state: scan.identityState,
    verdictAllowed: scan.analysis ? "YES" : "no",
    ran: scan.analysis ? "evidence+analysis" : candidates.length ? "stopped: asked" : "stopped",
  };
}

async function main(): Promise<void> {
  if (!existsSync(DIR)) {
    console.error(`No ${DIR} directory.`);
    return;
  }
  const files = readdirSync(DIR)
    .filter((f) => MIME[extname(f).toLowerCase()])
    .sort();

  if (files.length === 0) {
    console.log(`No images in ${DIR}. Put photographs there and run this again.`);
    return;
  }

  console.log(`# Identity audit — ${files.length} image(s) against ${BASE}`);
  const rows: Row[] = [];
  for (const f of files) {
    const row = await one(f);
    if (row) rows.push(row);
  }

  console.log(`\n${"=".repeat(78)}\n# AUDIT TABLE\n`);
  console.log(
    "| Image | Model read (brand / name / size) | Barcode | Catalogue match | Identity state | Verdict allowed? |",
  );
  console.log("|---|---|---|---|---|---|");
  for (const r of rows) {
    console.log(
      `| ${r.file} | ${r.read} | ${r.barcode} | ${r.match} | ${r.state} | ${r.verdictAllowed} |`,
    );
  }
  console.log("\nThe last column is the one that matters. A YES beside a catalogue match that");
  console.log("is not the product in the photograph is a failure, however plausible it looks.");
}

void main().finally(() => prisma.$disconnect());
