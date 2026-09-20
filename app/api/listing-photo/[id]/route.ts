/** Serves the photo attached to a listing check. Admin-only, like the form. */
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { prisma } from "@/lib/db";
import { load } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await isAdminRequest())) return new NextResponse("Not found", { status: 404 });

  const { id } = await context.params;
  const check = await prisma.listingCheck.findUnique({ where: { id } });
  if (!check) return new NextResponse("Not found", { status: 404 });

  const image = await load({
    blobUrl: check.photoBlobUrl,
    bytes: check.photoBytes,
    path: check.photoPath,
    mime: check.photoMime,
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
