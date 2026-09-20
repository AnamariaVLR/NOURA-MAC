/** Serves a scan's own image back to its own browser, and to nobody else. */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { load } from "@/lib/storage";
import { currentUserKey } from "@/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const userKey = await currentUserKey();
  if (!userKey) return new NextResponse("Not found", { status: 404 });

  const scan = await prisma.scan.findUnique({ where: { id } });
  // Same 404 for "no such scan" and "not your scan": the difference is not the
  // caller's business.
  if (!scan || scan.userKey !== userKey) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Wherever the bytes went — blob, row or file — load() knows. A missing image
  // is the same 404 as a missing scan.
  const image = await load({
    blobUrl: scan.imageBlobUrl,
    bytes: scan.imageBytes,
    path: scan.imagePath,
    mime: scan.imageMime,
  });
  if (!image) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.mime,
      "Cache-Control": "private, max-age=3600",
      "Content-Length": String(image.bytes.byteLength),
    },
  });
}
