"use client";

/**
 * What a shopper sees when something genuinely broke.
 *
 * Not a stack trace and not "something went wrong" with no way forward. It says
 * what state the app is in, gives the one action that usually fixes it, and
 * offers the way back — because a person holding a jar in an aisle needs a next
 * step, not an apology.
 *
 * The digest is shown deliberately. It is the only thing that connects what the
 * shopper saw to what the server logged, and it identifies nothing about them.
 */
import { useEffect } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] unhandled error:", error);
  }, [error]);

  return (
    <div className="space-y-4" data-testid="error-page">
      <Card>
        <h1 className="text-[19px] font-semibold tracking-tight">That did not work</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
          Something on our side failed while loading this page. Nothing you did caused it, and
          nothing has been lost — your past scans are still there.
        </p>

        <button
          type="button"
          onClick={reset}
          data-testid="error-retry"
          className="mt-4 w-full rounded-xl bg-ink px-4 py-3.5 text-[15px] font-semibold text-paper"
        >
          Try again
        </button>

        <Link
          href="/scan"
          className="mt-2 block w-full rounded-xl border border-line bg-card px-4 py-3 text-center text-[14px] font-medium"
        >
          Back to scanning
        </Link>

        {error.digest ? (
          <p className="mt-4 text-[11px] text-ink-faint">
            If you report this, the reference is{" "}
            <code className="rounded bg-black/5 px-1 py-0.5">{error.digest}</code>. It identifies
            the error, not you.
          </p>
        ) : null}
      </Card>
    </div>
  );
}
