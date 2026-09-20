/**
 * What a shopper sees with no signal.
 *
 * Supermarkets have bad reception, so this page is not an edge case — it is a
 * screen this app will show regularly, in the exact place it is meant to be
 * useful. It has to say three things: that Noura knows it is offline, that
 * nothing is broken, and what will still work.
 *
 * It is static, cached by the service worker, and renders with no data.
 */
import Link from "next/link";
import { Card } from "@/components/ui";

export const metadata = { title: "No connection — Noura" };

export default function OfflinePage() {
  return (
    <div className="space-y-4" data-testid="offline-page">
      <Card>
        <h1 className="text-[19px] font-semibold tracking-tight">No connection</h1>
        <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
          Noura is open, but your phone cannot reach the internet. Supermarket aisles are good at
          this. Nothing has gone wrong and nothing has been lost.
        </p>

        <div className="mt-4 rounded-xl border border-line bg-paper px-3 py-3">
          <p className="text-[12.5px] font-medium">What you can do now</p>
          <ul className="mt-2 space-y-1.5 text-[12.5px] leading-relaxed text-ink-soft">
            <li>
              <span className="font-medium text-ink">Take the photo anyway.</span> Keep it in your
              camera roll and check it from Noura when you have signal — the label does not change.
            </li>
            <li>
              <span className="font-medium text-ink">Walk toward the entrance.</span> Reception is
              usually better at the front of the shop and outside it.
            </li>
          </ul>
        </div>

        <p className="mt-4 text-[12.5px] leading-relaxed text-ink-faint">
          Noura deliberately does not keep old results on your phone. A verdict and a price are only
          worth showing with the date they were checked, and a saved copy would quietly show you
          yesterday&rsquo;s.
        </p>

        <Link
          href="/"
          className="mt-4 block w-full rounded-xl bg-ink px-4 py-3.5 text-center text-[15px] font-semibold text-paper"
        >
          Try again
        </Link>
      </Card>
    </div>
  );
}
