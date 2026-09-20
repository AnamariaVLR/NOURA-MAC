/** Records one hand-verified listing check. The other half of /admin/listings. */
import { NextResponse } from "next/server";
import { isAdminRequest } from "@/lib/admin-session";
import { MAX_UPLOAD_BYTES } from "@/lib/config";
import { prisma } from "@/lib/db";
import { aedToFils } from "@/lib/format";
import { parsePriceAed, recordCheck } from "@/lib/retail/listings-admin";
import { UploadSchema } from "@/lib/schemas";
import { store } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  // The middleware already refused an unauthenticated request; this is the
  // second lock, so a matcher change can never silently open the form.
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Sign in to /admin first." }, { status: 401 });
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
  //
  // NOTHING IN THIS BLOCK CAN FAIL THE SUBMISSION. A photo is evidence about a
  // check, not the check itself, and the operator is standing in an aisle. A
  // file that is the wrong type, too big, undecodable, or that the blob store
  // refuses is dropped silently and the check is saved without it. The response
  // says whether the photo made it, so the form can mention it.
  let stored: Awaited<ReturnType<typeof store>> = null;
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0 && photo.size <= MAX_UPLOAD_BYTES) {
    if (UploadSchema.safeParse({ type: photo.type, size: photo.size }).success) {
      try {
        const bytes = Buffer.from(await photo.arrayBuffer());
        stored = await store(`check-${crypto.randomUUID()}`, bytes, photo.type, "checks");
      } catch (error) {
        console.error("[api/listing-check] photo dropped:", error);
      }
    }
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
      photoPath: stored?.path ?? null,
      photoMime: stored?.mime ?? null,
      photoBlobUrl: stored?.blobUrl ?? null,
      photoBytes: stored?.bytes ?? null,
    });
    return NextResponse.json(
      {
        id: created.id,
        product: listing.product.name,
        retailer: listing.retailer.name,
        photoSaved: stored !== null,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[api/listing-check] failed:", error);
    return NextResponse.json({ error: "That check could not be saved." }, { status: 500 });
  }
}
