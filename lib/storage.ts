/**
 * Where an image goes, and how it comes back.
 *
 * ── Why this file exists ────────────────────────────────────────────────────
 *
 * Until the pilot, every uploaded image was written to `.data/uploads` on the
 * local filesystem. A serverless deployment has no such thing: the filesystem is
 * read-only apart from /tmp, and /tmp does not survive between invocations. The
 * scan image a shopper sees on their result page would have been written by one
 * lambda and read by another, and would simply not be there.
 *
 * So there are three backends, tried in this order, and the row records which one
 * was used:
 *
 *   1. VERCEL BLOB, when BLOB_READ_WRITE_TOKEN is set. The right answer in
 *      production: the bytes live outside the database and are served from a CDN.
 *   2. THE DATABASE ROW, as a compressed JPEG under MAX_INLINE_BYTES. The
 *      fallback when no blob token exists, so the pilot works on a bare Neon
 *      database with nothing else configured. Postgres handles a 300 KB bytea
 *      without complaint; it is not where you would put a million of them.
 *   3. THE LOCAL FILESYSTEM, for development only.
 *
 * ── The rule that matters most ──────────────────────────────────────────────
 *
 * A photo is evidence about a price check, not the check itself. `store()` returns
 * null rather than throwing, and every caller treats null as "no photo" and
 * carries on. A shelf photo that fails to compress must never cost the operator
 * the thirty seconds they just spent in an aisle.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { MAX_INLINE_IMAGE_BYTES, MAX_IMAGE_EDGE_PX, UPLOAD_DIR, blobToken } from "./config";

export type StoredImage = {
  /** Set when the bytes went to Vercel Blob. */
  blobUrl: string | null;
  /** Set when the bytes are in the row. Always a JPEG under MAX_INLINE_IMAGE_BYTES. */
  bytes: Buffer | null;
  /** Set when the bytes went to the local filesystem. Development only. */
  path: string | null;
  mime: string;
};

export type ImageLocation = {
  blobUrl?: string | null;
  bytes?: Buffer | Uint8Array | null;
  path?: string | null;
  mime?: string | null;
};

function uploadRoot(): string {
  return resolve(process.cwd(), UPLOAD_DIR);
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Shrink an image to at most MAX_IMAGE_EDGE_PX on its longest side and re-encode
 * it as JPEG, stepping the quality down until it fits `maxBytes`.
 *
 * The step-down loop exists because quality and output size are not linearly
 * related and depend on the picture: a busy shelf photo at q80 can be three times
 * the size of a flat label at the same setting. Four attempts is enough to get a
 * 1600px photograph under 300 KB in every case tried; the final fallback drops the
 * edge as well, and if even that misses, the caller gets null and saves the check
 * without a photo.
 */
export async function compressToJpeg(
  input: Buffer,
  maxBytes = MAX_INLINE_IMAGE_BYTES,
  maxEdge = MAX_IMAGE_EDGE_PX,
): Promise<Buffer | null> {
  const attempts: { quality: number; edge: number }[] = [
    { quality: 82, edge: maxEdge },
    { quality: 70, edge: maxEdge },
    { quality: 60, edge: Math.round(maxEdge * 0.75) },
    { quality: 50, edge: Math.round(maxEdge * 0.5) },
  ];

  for (const { quality, edge } of attempts) {
    try {
      const out = await sharp(input)
        .rotate() // honour the EXIF orientation a phone camera writes
        .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer();
      if (out.byteLength <= maxBytes) return out;
    } catch {
      return null; // not a decodable image; the caller carries on without it
    }
  }
  return null;
}

/**
 * Resize an image for the identification model — RUBRIC has nothing to say about
 * this; it is a cost and latency rule.
 *
 * A modern phone photograph is 4000px wide and several megabytes. Nothing in the
 * pipeline reads a label better at 4000px than at 1600px, and the difference is
 * seconds of upload on supermarket 4G and a materially larger bill per scan. The
 * client resizes before uploading; this is the server-side guarantee, because a
 * client-side limit is a suggestion.
 *
 * Returns the original bytes if it cannot decode them: the model may still manage,
 * and refusing the scan would be worse than sending a large file.
 */
export async function resizeForModel(input: Buffer): Promise<{ bytes: Buffer; mime: string }> {
  try {
    const out = await sharp(input)
      .rotate()
      .resize({
        width: MAX_IMAGE_EDGE_PX,
        height: MAX_IMAGE_EDGE_PX,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    return { bytes: out, mime: "image/jpeg" };
  } catch {
    return { bytes: input, mime: "image/jpeg" };
  }
}

/**
 * Put an image somewhere it can be read back. Never throws.
 *
 * `id` is used as the blob path and the local filename, so it must be a value we
 * generated (a cuid), never user input.
 */
export async function store(
  id: string,
  bytes: Buffer,
  mime: string,
  prefix: "scans" | "checks",
): Promise<StoredImage | null> {
  const token = blobToken();

  if (token) {
    try {
      const { put } = await import("@vercel/blob");
      const ext = EXTENSIONS[mime] ?? "jpg";
      const result = await put(`${prefix}/${id}.${ext}`, bytes, {
        access: "public",
        token,
        contentType: mime,
        // The id is already unguessable; a random suffix would only make the URL
        // impossible to reconstruct from the row.
        addRandomSuffix: false,
      });
      return { blobUrl: result.url, bytes: null, path: null, mime };
    } catch {
      // Fall through to the database. A blob outage must not lose the check.
    }
  }

  const compressed = await compressToJpeg(bytes);
  if (compressed) return { blobUrl: null, bytes: compressed, path: null, mime: "image/jpeg" };

  // Development fallback: a real filesystem. Never reached on Vercel, where the
  // write would throw and this returns null.
  try {
    const root = uploadRoot();
    await mkdir(root, { recursive: true });
    const filename = `${id}.${EXTENSIONS[mime] ?? "bin"}`;
    await writeFile(join(root, filename), bytes);
    return { blobUrl: null, bytes: null, path: filename, mime };
  } catch {
    return null;
  }
}

/**
 * Read an image back out of whichever backend holds it.
 *
 * Returns null for a row that records no image at all, and for a blob URL that no
 * longer resolves. The caller answers 404 either way: "not there" and "not yours"
 * must look identical from outside.
 */
export async function load(location: ImageLocation): Promise<{ bytes: Buffer; mime: string } | null> {
  const mime = location.mime ?? "image/jpeg";

  if (location.bytes) {
    return { bytes: Buffer.from(location.bytes), mime };
  }

  if (location.blobUrl) {
    try {
      const res = await fetch(location.blobUrl, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return null;
      return { bytes: Buffer.from(await res.arrayBuffer()), mime };
    } catch {
      return null;
    }
  }

  if (location.path) {
    // The stored path is a filename we generated, never user input; re-check anyway
    // so a bad database row cannot become a path traversal.
    if (!/^[A-Za-z0-9_-]+\.[a-z]{2,5}$/.test(location.path)) return null;
    try {
      return { bytes: await readFile(join(uploadRoot(), location.path)), mime };
    } catch {
      return null;
    }
  }

  return null;
}
