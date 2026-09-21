"use client";

/**
 * Recording a check must take under 30 seconds on a phone, standing in an aisle.
 *
 * What that costs in design:
 *   - The checker's name is remembered in localStorage, so it is typed once ever.
 *   - Price and stock are BOTH optional and one is required: a checker records
 *     what they actually observed. "Didn't look" is the stock default, so the
 *     form never stores an observation nobody made.
 *   - Size defaults to the pack we
 *     track, stock defaults to yes, the date defaults to now.
 *   - The keyboard opens on a numeric pad and the field is focused on open.
 *   - "In stock" is a two-button toggle, not a checkbox: bigger target, no ambiguity.
 *   - The form stays open after saving so a row of shelf-neighbours can be done in
 *     sequence, with the last save confirmed inline.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type PendingListing = {
  listingId: string;
  productName: string;
  productBrand: string | null;
  retailerName: string;
  sizeLabel: string;
  retailerUrl: string | null;
  priceLabel: string | null;
  staleness: string;
};

const CHECKER_KEY = "noura_checker_name";

export function ListingCheckForm({
  listing,
  onDone,
}: {
  listing: PendingListing;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [checkedBy, setCheckedBy] = useState("");
  const [price, setPrice] = useState("");
  const [sizeLabel, setSizeLabel] = useState(listing.sizeLabel);
  const [inStock, setInStock] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      setCheckedBy(window.localStorage.getItem(CHECKER_KEY) ?? "");
    } catch {
      // Private browsing: the field just starts empty.
    }
    priceRef.current?.focus();
  }, []);

  useEffect(() => {
    setSizeLabel(listing.sizeLabel);
    setPrice("");
    setNote("");
    setPhoto(null);
    setState("idle");
    setMessage(null);
    priceRef.current?.focus();
  }, [listing.listingId, listing.sizeLabel]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (state === "saving") return;

    setState("saving");
    setMessage(null);

    try {
      window.localStorage.setItem(CHECKER_KEY, checkedBy);
    } catch {
      // Not important enough to interrupt a check.
    }

    const body = new FormData();
    body.append("listingId", listing.listingId);
    body.append("priceAed", price);
    body.append("sizeLabel", sizeLabel);
    // Empty string means "not observed" — the server reads that as null.
    body.append("inStock", inStock === null ? "" : String(inStock));
    body.append("checkedBy", checkedBy);
    if (listing.retailerUrl) body.append("retailerUrl", listing.retailerUrl);
    if (note) body.append("note", note);
    if (photo) body.append("photo", photo);

    try {
      const response = await fetch("/api/listing-check", { method: "POST", body });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setState("error");
        setMessage(payload.error ?? "That check could not be saved.");
        return;
      }
      setState("saved");
      setMessage(`Saved ${listing.productName} at ${listing.retailerName}.`);
      setPrice("");
      setPhoto(null);
      setNote("");
      router.refresh();
      onDone?.();
      priceRef.current?.focus();
    } catch {
      setState("error");
      setMessage("The request did not reach the server.");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" data-testid="check-form">
      <div className="rounded-xl border border-line bg-paper px-3 py-2.5">
        <p className="text-[14px] font-medium leading-snug">{listing.productName}</p>
        <p className="mt-0.5 text-[12px] text-ink-soft">
          {listing.productBrand ? `${listing.productBrand} · ` : ""}
          {listing.sizeLabel} · {listing.retailerName}
        </p>
        {listing.retailerUrl ? (
          <a
            href={listing.retailerUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 inline-block text-[12px] underline decoration-line underline-offset-2"
          >
            Open the retailer page
          </a>
        ) : null}
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-2.5">
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-ink-soft">Price (AED)</span>
          <input
            ref={priceRef}
            name="priceAed"
            data-testid="price-input"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="12.50"
            className="tnum w-full rounded-xl border border-line bg-card px-3 py-3 text-[17px]"
          />
        </label>

        <div>
          <span className="mb-1 block text-[12px] font-medium text-ink-soft">In stock</span>
          <div className="flex overflow-hidden rounded-xl border border-line">
            <button
              type="button"
              onClick={() => setInStock(null)}
              data-testid="in-stock-unknown"
              aria-pressed={inStock === null}
              className={`px-3 py-3 text-[14px] font-semibold ${
                inStock === null ? "bg-ink/10 text-ink" : "bg-card text-ink-soft"
              }`}
            >
              Didn&rsquo;t look
            </button>
            <button
              type="button"
              onClick={() => setInStock(true)}
              data-testid="in-stock-yes"
              aria-pressed={inStock === true}
              className={`px-4 py-3 text-[14px] font-semibold ${
                inStock === true ? "bg-brand text-white" : "bg-card text-ink-soft"
              }`}
            >
              Yes
            </button>
            <button
              type="button"
              onClick={() => setInStock(false)}
              data-testid="in-stock-no"
              aria-pressed={inStock === false}
              className={`px-4 py-3 text-[14px] font-semibold ${
                inStock === false ? "bg-ink text-paper" : "bg-card text-ink-soft"
              }`}
            >
              No
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-ink-soft">Size on the pack</span>
          <input
            name="sizeLabel"
            value={sizeLabel}
            onChange={(e) => setSizeLabel(e.target.value)}
            className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-[14px]"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[12px] font-medium text-ink-soft">Checked by</span>
          <input
            name="checkedBy"
            data-testid="checked-by-input"
            value={checkedBy}
            onChange={(e) => setCheckedBy(e.target.value)}
            placeholder="Your name"
            required
            className="w-full rounded-xl border border-line bg-card px-3 py-2.5 text-[14px]"
          />
        </label>
      </div>

      <div className="flex items-center gap-2.5">
        <input
          ref={photoRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          onClick={() => photoRef.current?.click()}
          className="rounded-xl border border-line bg-card px-3 py-2.5 text-[13px] font-medium"
        >
          {photo ? "Photo attached ✓" : "Add a photo"}
        </button>
        <input
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2.5 text-[13px]"
        />
      </div>

      <button
        type="submit"
        disabled={state === "saving"}
        data-testid="save-check"
        className="w-full rounded-xl bg-brand px-4 py-3.5 text-[15px] font-semibold text-white disabled:opacity-40"
      >
        {state === "saving" ? "Saving…" : "Save check"}
      </button>

      {message ? (
        <p
          role="status"
          data-testid="check-message"
          className={`rounded-xl px-3 py-2.5 text-[13px] ${
            state === "error"
              ? "border border-warn-line bg-warn-bg text-ink-soft"
              : "border border-brand/30 bg-brand-soft text-brand-deep"
          }`}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
