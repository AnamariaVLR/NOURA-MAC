/**
 * Writes fixtures/product.png — a synthetic placeholder used by the Playwright
 * tests and by anyone demoing the app without a real photo to hand.
 *
 *   npx tsx scripts/make-fixture.ts
 *
 * It is not a photograph of anything. In example mode the image is never read, so a
 * valid PNG of the right shape is all the test needs.
 *
 * Hand-rolled PNG encoder so the repo needs no image dependency.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const WIDTH = 600;
const HEIGHT = 800;

function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

function pixel(x: number, y: number): [number, number, number] {
  // Card-ish placeholder: pale ground, a green band, and a barcode-like block so
  // the fixture is visually obvious as a stand-in rather than a real pack shot.
  if (y > 120 && y < 210) return [15, 111, 77];
  if (y > 560 && y < 680 && x > 90 && x < 510) {
    return (x >> 3) % 2 === 0 ? [13, 22, 19] : [255, 255, 255];
  }
  if (y > 260 && y < 500 && x > 90 && x < 510) return [230, 242, 237];
  return [247, 248, 247];
}

function main() {
  const raw = Buffer.alloc(HEIGHT * (WIDTH * 3 + 1));
  let offset = 0;
  for (let y = 0; y < HEIGHT; y++) {
    raw[offset++] = 0; // filter type: none
    for (let x = 0; x < WIDTH; x++) {
      const [r, g, b] = pixel(x, y);
      raw[offset++] = r;
      raw[offset++] = g;
      raw[offset++] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);

  const dir = resolve(__dirname, "../fixtures");
  mkdirSync(dir, { recursive: true });
  const out = resolve(dir, "product.png");
  writeFileSync(out, png);
  console.log(`wrote ${out} (${png.length} bytes, ${WIDTH}x${HEIGHT})`);
}

main();
