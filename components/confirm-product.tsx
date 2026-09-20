"use client";

/**
 * "Which one is this?" — and its quieter sibling, "Not this product?".
 *
 * Shown when the matcher found products it could not tell apart from what the
 * scan read. Nothing has been evaluated at this point: there is no verdict
 * behind this screen, because a verdict about the wrong variant is worse than
 * no verdict.
 *
 * Each option leads with the thing that distinguishes it — the size, and the
 * words this product has that the scan did not read. That is the actual
 * question being asked, so it should be the biggest thing on the row.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { MatchCandidate } from "@/lib/schemas";

export function ConfirmProduct({
  scanId,
  candidates,
  heading,
  subheading,
}: {
  scanId: string;
  candidates: MatchCandidate[];
  heading: string;
  subheading: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(productId: string) {
    if (busy) return;
    setBusy(productId);
    setError(null);

    const body = new FormData();
    body.set("productId", productId);

    try {
      const res = await fetch(`/api/scan/${scanId}/confirm`, { method: "POST", body });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? "That did not work. Try again.");
        setBusy(null);
        return;
      }
      router.refresh();
    } catch {
      setError("No connection. Check your signal and try again.");
      setBusy(null);
    }
  }

  return (
    <div data-testid="confirm-product">
      <h2 className="text-[17px] font-semibold tracking-tight">{heading}</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{subheading}</p>

      <ul className="mt-3 space-y-2" data-testid="confirm-options">
        {candidates.map((candidate) => (
          <li key={candidate.productId}>
            <button
              type="button"
              onClick={() => choose(candidate.productId)}
              disabled={busy !== null}
              data-testid="confirm-option"
              data-product-id={candidate.productId}
              className="flex w-full items-center gap-3 rounded-xl border border-line bg-card px-3 py-3 text-left active:opacity-90 disabled:opacity-50"
            >
              {candidate.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={candidate.imageUrl}
                  alt=""
                  loading="lazy"
                  className="h-14 w-11 shrink-0 rounded-md border border-line bg-paper object-contain"
                />
              ) : (
                <span
                  aria-hidden
                  className="grid h-14 w-11 shrink-0 place-items-center rounded-md border border-line bg-paper text-[10px] text-ink-ghost"
                >
                  no photo
                </span>
              )}

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{candidate.name}</span>
                <span className="mt-0.5 block text-[12px] text-ink-soft">
                  {candidate.brand ?? "Brand unknown"}
                  {candidate.sizeLabel ? ` · ${candidate.sizeLabel}` : ""}
                </span>
                {candidate.variant.length > 0 ? (
                  <span className="mt-1 block text-[11.5px] text-ink-faint">
                    {candidate.variant.join(" · ")}
                  </span>
                ) : null}
              </span>

              <span aria-hidden className="shrink-0 text-[13px] text-ink-faint">
                {busy === candidate.productId ? "…" : "›"}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {error ? (
        <p role="alert" data-testid="confirm-error" className="mt-3 text-[12.5px] text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The escape hatch on an automatic match. Collapsed by default, because on the
 * common path the match is right and the shopper should not be made to think
 * about it — but always one tap away, because an automatic match is still a
 * guess the app made.
 */
export function NotThisProduct({
  scanId,
  candidates,
}: {
  scanId: string;
  candidates: MatchCandidate[];
}) {
  return (
    <details className="mt-3 rounded-xl border border-line px-3 py-2.5" data-testid="not-this-product">
      <summary className="cursor-pointer text-[12.5px] font-medium">Not this product?</summary>
      <div className="mt-3">
        <ConfirmProduct
          scanId={scanId}
          candidates={candidates}
          heading="Pick the right one"
          subheading="These are the products in the catalogue that match what we read off the pack."
        />
      </div>
    </details>
  );
}
