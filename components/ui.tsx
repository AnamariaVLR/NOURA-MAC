/** Small shared pieces. Server components — no interactivity needed. */
import type { Check, CheckStatus, SourceRef, Verdict } from "@/lib/schemas";
import { formatDate } from "@/lib/format";
import { VERDICT_LABEL } from "@/lib/health/verdict";

export function Card({
  children,
  className = "",
  testId,
}: {
  children: React.ReactNode;
  className?: string;
  /** Lets a test target a whole block rather than guessing at DOM ancestry. */
  testId?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-line bg-card p-4 ${className}`}
      data-testid={testId}
    >
      {children}
    </section>
  );
}

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.07em] text-ink-soft">
        {children}
      </h2>
      {hint ? <p className="mt-1 text-[12px] leading-relaxed text-ink-faint">{hint}</p> : null}
    </div>
  );
}

/**
 * Attribution. Every fact in this app ships with one of these — a source and the
 * date it was last checked — because a health claim without a provenance is just
 * an opinion with a number attached.
 */
export function SourceNote({ source, className = "" }: { source: SourceRef; className?: string }) {
  const label = `${source.name} · last verified ${formatDate(source.lastVerifiedAt)}`;
  return (
    <p className={`text-[11px] leading-relaxed text-ink-faint ${className}`} data-testid="source-note">
      {source.url ? (
        <a
          href={source.url}
          target="_blank"
          rel="noreferrer noopener"
          className="underline decoration-line underline-offset-2 hover:text-ink-soft"
        >
          {label}
        </a>
      ) : (
        label
      )}
    </p>
  );
}

/* ---------------------------------------------------------------------------
 * Verdict
 * ------------------------------------------------------------------------- */

const VERDICT_STYLE: Record<Verdict, { text: string; border: string; bg: string }> = {
  good_choice: {
    text: "text-band-excellent",
    border: "border-band-excellent/35",
    bg: "bg-brand-soft",
  },
  acceptable: { text: "text-band-good", border: "border-band-good/35", bg: "bg-brand-soft/60" },
  not_recommended: { text: "text-band-poor", border: "border-band-poor/35", bg: "bg-warn-bg" },
  could_not_verify: { text: "text-ink-soft", border: "border-line", bg: "bg-card" },
};

export const VERDICT_TEXT_COLOR: Record<Verdict, string> = {
  good_choice: "text-band-excellent",
  acceptable: "text-band-good",
  not_recommended: "text-band-poor",
  could_not_verify: "text-ink-soft",
};

/**
 * The verdict, stated plainly. No dial, no number — the checklist below it is the
 * detail, and a figure between them would only invite the reader to average
 * things the rubric deliberately does not average.
 */
export function VerdictBanner({
  verdict,
  reason,
  size = "large",
}: {
  verdict: Verdict;
  reason: string;
  size?: "large" | "small";
}) {
  const style = VERDICT_STYLE[verdict];
  return (
    <div
      className={`rounded-xl border ${style.border} ${style.bg} px-3.5 py-3`}
      data-testid="verdict"
      data-verdict={verdict}
    >
      <p
        className={`${
          size === "large" ? "text-[17px]" : "text-[13px]"
        } font-semibold leading-tight tracking-tight ${style.text}`}
      >
        {VERDICT_LABEL[verdict]}
      </p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-soft">{reason}</p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Checklist
 * ------------------------------------------------------------------------- */

const STATUS_MARK: Record<CheckStatus, { glyph: string; className: string; label: string }> = {
  pass: { glyph: "✓", className: "text-band-excellent", label: "Passed" },
  fail: { glyph: "✗", className: "text-band-poor", label: "Failed" },
  // A word, not a glyph. A greyed tick or a dash both read as a weak pass, and the
  // one thing this list must never do is imply we checked something we did not.
  unknown: { glyph: "unknown", className: "text-ink-faint", label: "Unknown" },
};

export function CheckRow({ check, highlight = false }: { check: Check; highlight?: boolean }) {
  const mark = STATUS_MARK[check.status];
  return (
    <li
      className={`border-t border-line py-3 first:border-0 first:pt-0 ${
        highlight ? "-mx-2 rounded-lg bg-brand-soft/50 px-2" : ""
      }`}
      data-testid="check"
      data-check-key={check.key}
      data-check-status={check.status}
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className={`shrink-0 pt-px font-semibold ${mark.className} ${
            check.status === "unknown" ? "pt-1 text-[10px] uppercase tracking-[0.08em]" : "text-[15px]"
          }`}
        >
          {mark.glyph}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium leading-snug">
            <span className="sr-only">{mark.label}: </span>
            {check.claim}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">{check.detail}</p>
          <p className="tnum mt-1.5 text-[11px] text-ink-faint">
            {check.evidence.label}: {check.evidence.value}
          </p>
          <SourceNote source={check.source} className="mt-0.5" />
        </div>
      </div>
    </li>
  );
}

/** "3 passed · 4 failed · 1 unknown" — the checklist in one line. */
export function CheckTally({
  passed,
  failed,
  unknown,
}: {
  passed: number;
  failed: number;
  unknown: number;
}) {
  return (
    <p className="tnum text-[12px] text-ink-soft" data-testid="check-tally">
      <span className="font-medium text-band-excellent">{passed} passed</span>
      {" · "}
      <span className="font-medium text-band-poor">{failed} failed</span>
      {unknown > 0 ? (
        <>
          {" · "}
          <span className="text-ink-faint">{unknown} unknown</span>
        </>
      ) : null}
    </p>
  );
}

/** Medal ranks for the alternatives list. */
export const MEDALS = ["🥇", "🥈", "🥉"] as const;

export function MedalRank({ rank }: { rank: number }) {
  const medal = MEDALS[rank - 1];
  return (
    <span
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line bg-paper text-[14px]"
      aria-label={`Rank ${rank}`}
      data-testid="medal"
    >
      {medal ?? rank}
    </span>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "brand" | "warn";
}) {
  const tones = {
    neutral: "border-line text-ink-soft",
    brand: "border-brand/30 bg-brand-soft text-brand-deep",
    warn: "border-warn-line bg-warn-bg text-ink-soft",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-[3px] text-[11px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Fixed text, shown on every screen that shows a verdict. Never edited per product. */
export function Disclaimer({ text }: { text: string }) {
  return (
    <p
      className="rounded-xl border border-warn-line bg-warn-bg px-3 py-2.5 text-[11px] leading-relaxed text-ink-soft"
      data-testid="disclaimer"
    >
      {text}
    </p>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card className="text-center">
      <p className="text-[15px] font-medium">{title}</p>
      <p className="mx-auto mt-2 max-w-[38ch] text-[13px] leading-relaxed text-ink-soft">{body}</p>
    </Card>
  );
}
