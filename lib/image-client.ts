/**
 * Shrinking a photo in the browser, before it is uploaded.
 *
 * A current phone camera produces a 4000px, 4-6 MB JPEG. Nothing downstream reads
 * a label better at 4000px than at 1600px, and on supermarket 4G the difference
 * is the gap between a scan that feels instant and one the shopper abandons. The
 * server resizes again (lib/storage.ts) because a client-side limit is a
 * suggestion; this one exists purely to save the shopper's time and data.
 *
 * Everything here is best-effort. If the browser cannot decode the file, or
 * canvas is unavailable, or the encode fails, the ORIGINAL file is returned and
 * the upload proceeds — an 8 MB upload is slow, a refused scan is useless.
 */

/** Matches MAX_IMAGE_EDGE_PX in lib/config.ts. */
export const CLIENT_MAX_EDGE_PX = 1600;
export const CLIENT_JPEG_QUALITY = 0.82;

/** The size below which shrinking is not worth a decode. */
export const CLIENT_SKIP_BELOW_BYTES = 400 * 1024;

export function targetSize(
  width: number,
  height: number,
  maxEdge = CLIENT_MAX_EDGE_PX,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

export async function shrinkImage(file: File, maxEdge = CLIENT_MAX_EDGE_PX): Promise<File> {
  // A small file is already fine, and a GIF may be animated — re-encoding one to
  // a still JPEG would silently change what the user chose.
  if (file.size <= CLIENT_SKIP_BELOW_BYTES) return file;
  if (file.type === "image/gif") return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;

  try {
    // `imageOrientation: "from-image"` applies the EXIF rotation a phone writes,
    // so a portrait photo does not arrive on its side.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const { width, height } = targetSize(bitmap.width, bitmap.height, maxEdge);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", CLIENT_JPEG_QUALITY),
    );
    if (!blob || blob.size === 0) return file;
    // If the "shrunk" version is somehow larger, keep the original.
    if (blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}
