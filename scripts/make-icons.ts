/**
 * Every icon the app serves, generated from public/brand/mark.svg.
 *
 * Run with `npm run icons`. The PNGs are committed, because a build should not
 * depend on sharp being able to rasterise SVG on whatever machine runs it, and
 * because a missing icon is invisible until someone tries to install the app.
 *
 * The sizes, and why each exists:
 *
 *   192   the PWA minimum an Android launcher will accept
 *   512   the size Android uses for the splash screen
 *   512   maskable — a separate drawing, not the same file tagged differently.
 *         Android crops a maskable icon to the launcher's shape and guarantees
 *         only the central 80%, so the mark is drawn smaller and the tile runs
 *         edge to edge. Reusing the standard icon here clips the check.
 *   180   apple-touch-icon. iOS ignores the manifest for this and reads the
 *         <link> tag, does not honour transparency, and applies its own corner
 *         radius — so this one is flattened onto the brand colour.
 *   32    favicon, for the browser tab before anyone installs anything.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";

const BRAND = "#6f8067";
const ROOT = resolve(process.cwd(), "public");

type Job = { source: string; size: number; out: string; flatten?: boolean };

const JOBS: Job[] = [
  { source: "brand/mark.svg", size: 192, out: "icons/icon-192.png" },
  { source: "brand/mark.svg", size: 512, out: "icons/icon-512.png" },
  { source: "brand/mark-maskable.svg", size: 512, out: "icons/icon-maskable-512.png" },
  { source: "brand/mark.svg", size: 180, out: "icons/apple-touch-icon-180.png", flatten: true },
  { source: "brand/mark.svg", size: 32, out: "icons/favicon-32.png" },
];

async function main(): Promise<void> {
  await mkdir(resolve(ROOT, "icons"), { recursive: true });

  for (const job of JOBS) {
    const svg = readFileSync(resolve(ROOT, job.source));
    let pipeline = sharp(svg, { density: 384 }).resize(job.size, job.size, { fit: "contain" });
    if (job.flatten) pipeline = pipeline.flatten({ background: BRAND });

    const png = await pipeline.png({ compressionLevel: 9 }).toBuffer();
    await writeFile(resolve(ROOT, job.out), png);
    console.log(`${job.out.padEnd(34)} ${job.size}×${job.size}  ${(png.byteLength / 1024).toFixed(1)} KB`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
