/** Serves the photo attached to a listing check. Admin-only, like the form. */
import { NextResponse } from "next/server";
import { adminAllowed } from "@/lib/config";
import { prisma } from "@/lib/db";
import { readUpload } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!adminAllowed()) return new NextResponse("Not found", { status: 404 });

  const { id } = await context.params;
  const check = await prisma.listingCheck.findUnique({ where: { id } });
  if (!check?.photoPath) return new NextResponse("Not found", { status: 404 });

  const bytes = await readUpload(check.photoPath);
  if (!bytes) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": check.photoMime ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
      "Content-Length": String(bytes.byteLength),
    },
  });
}
