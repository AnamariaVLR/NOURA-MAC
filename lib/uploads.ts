/**
 * Scan images live on disk, outside the bundle and outside /public, and are served
 * back only through /api/image/[id]. Uploading a file must not publish it at a
 * guessable URL.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { UPLOAD_DIR } from "./config";

function uploadRoot(): string {
  return resolve(process.cwd(), UPLOAD_DIR);
}

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function saveUpload(
  scanId: string,
  bytes: Buffer,
  mime: string,
): Promise<{ path: string }> {
  const root = uploadRoot();
  await mkdir(root, { recursive: true });
  const filename = `${scanId}.${EXTENSIONS[mime] ?? "bin"}`;
  await writeFile(join(root, filename), bytes);
  return { path: filename };
}

export async function readUpload(path: string): Promise<Buffer | null> {
  // The stored path is a filename we generated, never user input; re-check anyway
  // so a bad database row cannot become a path traversal.
  if (!/^[A-Za-z0-9_-]+\.[a-z]{2,5}$/.test(path)) return null;
  try {
    return await readFile(join(uploadRoot(), path));
  } catch {
    return null;
  }
}
