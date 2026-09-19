/** Records one hand-verified listing check. The other half of /admin/listings. */
import { NextResponse } from "next/server";
import { MAX_UPLOAD_BYTES, adminAllowed } from "@/lib/config";
import { prisma } from "@/lib/db";
import { aedToFils } from "@/lib/format";
import { parsePriceAed, recordCheck } from "@/lib/retail/listings-admin";
import { UploadSchema } from "@/lib/schemas";
import { saveUpload } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!adminAllowed()) {
    return NextResponse.json({ error: "Admin tools are disabled here." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Send the check as form data." }, { status: 400 });
  }

  const text = (key: string): string => {
    const value = form.get(key);
    return typeof value === "string" ? value.trim() : "";
  };

  const listingId = text("listingId");
  if (!listingId) {
    return NextResponse.json({ error: "No listing was selected." }, { status: 400 });
  }

  const listing = await prisma.productListing.findUnique({
    where: { id: listingId },
    include: { product: true, retailer: true },
  });
  if (!listing) {
    return NextResponse.json({ error: "That listing no longer exists." }, { status: 404 });
  }

  const priceAed = parsePriceAed(text("priceAed"));
  if (priceAed === null) {
    return NextResponse.json(
      { error: "Enter the price as a number, for example 12.50." },
      { status: 400 },
    );
  }

  const checkedBy = text("checkedBy");
  if (!checkedBy) {
    return NextResponse.json(
      { error: "Say who made the check, so it can be asked about later." },
      { status: 400 },
    );
  }

  // Default to the listing's tracked size: the common case is that the pack on the
  // shelf is the one we track, and one less field is one less thing to type.
  const sizeLabel = text("sizeLabel") || listing.sizeLabel;
  const inStock = text("inStock") !== "false";
  const retailerUrl = text("retailerUrl") || null;
  const note = text("note") || null;

  const checkedAtRaw = text("checkedAt");
  const checkedAt = checkedAtRaw ? new Date(checkedAtRaw) : new Date();
  if (Number.isNaN(checkedAt.getTime())) {
    return NextResponse.json({ error: "That date could not be read." }, { status: 400 });
  }
  if (checkedAt.getTime() > Date.now() + 60_000) {
    return NextResponse.json({ error: "A check cannot be dated in the future." }, { status: 400 });
  }

  // Optional photo of the shelf or the page.
  let photoPath: string | null = null;
  let photoMime: string | null = null;
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const check = UploadSchema.safeParse({ type: photo.type, size: photo.size });
    if (!check.success) {
      return NextResponse.json(
        { error: check.error.issues[0]?.message ?? "That photo cannot be used." },
        { status: 400 },
      );
    }
    const bytes = Buffer.from(await photo.arrayBuffer());
    if (bytes.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: "Photos must be 8 MB or smaller." }, { status: 413 });
    }
    const saved = await saveUpload(`check-${crypto.randomUUID()}`, bytes, photo.type);
    photoPath = saved.path;
    photoMime = photo.type;
  }

  try {
    const created = await recordCheck({
      listingId,
      priceFils: aedToFils(priceAed),
      sizeLabel,
      inStock,
      checkedBy,
      checkedAt,
      retailerUrl,
      note,
      photoPath,
      photoMime,
    });
    return NextResponse.json(
      { id: created.id, product: listing.product.name, retailer: listing.retailer.name },
      { status: 201 },
    );
  } catch (error) {
    console.error("[api/listing-check] failed:", error);
    return NextResponse.json({ error: "That check could not be saved." }, { status: 500 });
  }
}
