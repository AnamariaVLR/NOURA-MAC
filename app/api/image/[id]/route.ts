/** Serves a scan's own image back to its own browser, and to nobody else. */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/uploads";
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
  if (!scan || scan.userKey !== userKey || !scan.imagePath) {
    return new NextResponse("Not found", { status: 404 });
  }

  const bytes = await readUpload(scan.imagePath);
  if (!bytes) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": scan.imageMime ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
      "Content-Length": String(bytes.byteLength),
    },
  });
}
