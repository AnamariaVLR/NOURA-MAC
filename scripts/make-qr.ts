/**
 * Writes qr.png at the repo root, pointing at the live pilot.
 *
 *   npx tsx scripts/make-qr.ts https://noura.vercel.app
 *
 * Why a PNG in the repo rather than a link in a document: the point of the QR
 * code is to get the pilot onto a phone that is not the phone reading the
 * hand-over notes. It gets printed, or held up on a laptop screen, or dropped
 * into a message. A file is the format that survives all three.
 *
 * Error correction is set to M (~15%). H would survive more damage but makes a
 * denser code, and a denser code is harder for an older phone camera to read
 * across a desk — which is the only condition this will ever be scanned in.
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import QRCode from "qrcode";

const BRAND = "#4a5a43"; // --color-brand-deep: dark enough for reliable contrast
const PAPER = "#ffffff"; // a QR code wants white, not the app's warm paper

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url || !/^https?:\/\//.test(url)) {
    console.error("usage: tsx scripts/make-qr.ts <https://…>");
    process.exitCode = 1;
    return;
  }

  const png = await QRCode.toBuffer(url, {
    type: "png",
    errorCorrectionLevel: "M",
    width: 900,
    margin: 3, // the quiet zone; a code with no margin often will not scan
    color: { dark: BRAND, light: PAPER },
  });

  const out = resolve(process.cwd(), "qr.png");
  writeFileSync(out, png);
  console.log(`qr.png → ${url}  (${(png.byteLength / 1024).toFixed(1)} KB)`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
