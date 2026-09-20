/**
 * The shared interface layer.
 *
 * Everything here is a server component unless it needs state. Three rules hold
 * the set together:
 *
 *   1. No raw colour, duration or easing — only tokens from globals.css.
 *   2. Colour states describe evidence, never approval (Brand Book §25).
 *   3. Anything that is a statement of fact arrives with its source attached.
 */
import Link from "next/link";
import type { Check, CheckStatus, SourceRef, Verdict } from "@/lib/schemas";
import { formatDate } from "@/lib/format";
import { VERDICT_LABEL } from "@/lib/health/verdict";

/* ---------------------------------------------------------------------------
 * Layout
 * ------------------------------------------------------------------------- */

/**
 * The product column. The scanner is a phone experience first (§37), so its
 * measure is fixed and simply centres on a larger screen rather than sprawling
 * into a second layout nobody designed.
 */
export function Shell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-[560px] px-5 ${className}`}>{children}</div>
  );
}

/** The editorial column. Wider, for reading. */
export function Measure({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`mx-auto w-full max-w-[1120px] px-5 sm:px-8 ${className}`}>{children}</div>;
}

/* ---------------------------------------------------------------------------
 * Type
 * ------------------------------------------------------------------------- */

/** The three-word label that opens a section. */
export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`eyebrow ${className}`}>{children}</p>;
}

/* ---------------------------------------------------------------------------
 * Buttons
 *
 * One component, three weights. `href` renders a link, its absence a button —
 * so a call to action is never a div with a click handler, and every one of
 * them is reachable from the keyboard without being asked to be.
 * ------------------------------------------------------------------------- */

type ButtonTone = "primary" | "secondary" | "quiet";

const BUTTON_TONE: Record<ButtonTone, string> = {
  primary: "bg-ink text-paper border-ink hover:bg-ink/90",
  secondary: "bg-card text-ink border-line hover:border-ink/35",
  quiet: "bg-transparent text-ink-soft border-transparent hover:text-ink",
};

const BUTTON_BASE =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border px-5 " +
  "text-[15px] font-medium tracking-[-0.005em] transition-colors " +
  "duration-[var(--duration-fast)] ease-noura disabled:opacity-40 " +
  "disabled:pointer-events-none";

export function Button({
  children,
  href,
  tone = "primary",
  className = "",
  full = false,
  ...rest
}: {
  children: React.ReactNode;
  href?: string;
  tone?: ButtonTone;
  className?: string;
  full?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const classes = `${BUTTON_BASE} ${BUTTON_TONE[tone]} ${full ? "w-full" : ""} ${className}`;
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={classes} {...rest}>
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * Surfaces
 * ------------------------------------------------------------------------- */

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
      className={`rounded-lg border border-line bg-card p-5 ${className}`}
      data-testid={testId}
    >
      {children}
    </section>
  );
}

export function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        {children}
      </h2>
      {hint ? <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-faint">{hint}</p> : null}
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
    <p className={`text-[11.5px] leading-relaxed text-ink-faint ${className}`} data-testid="source-note">
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
    text: "text-verified",
    border: "border-verified-line",
    bg: "bg-verified-soft",
  },
  acceptable: { text: "text-band-good", border: "border-verified-line", bg: "bg-verified-soft/55" },
  not_recommended: { text: "text-conflict", border: "border-conflict-line", bg: "bg-conflict-soft" },
  could_not_verify: { text: "text-unknown", border: "border-unknown-line", bg: "bg-unknown-soft" },
};

export const VERDICT_TEXT_COLOR: Record<Verdict, string> = {
  good_choice: "text-verified",
  acceptable: "text-band-good",
  not_recommended: "text-conflict",
  could_not_verify: "text-unknown",
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
      className={`rounded-md border ${style.border} ${style.bg} px-4 py-3.5`}
      data-testid="verdict"
      data-verdict={verdict}
    >
      <p
        className={`${
          size === "large" ? "text-[13px]" : "text-[11.5px]"
        } font-semibold uppercase tracking-[0.1em] ${style.text}`}
      >
        {VERDICT_LABEL[verdict]}
      </p>
      <p
        className={`mt-2 leading-snug text-ink ${
          size === "large" ? "text-[16px]" : "text-[13px]"
        }`}
      >
        {reason}
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Evidence indicators
 *
 * Three states, and the third is a word. A greyed tick and a dash both read as
 * a weak pass, and the one thing this list must never do is imply we checked
 * something we did not (§7, §22 principle 4). Shape and text carry the state as
 * well as colour, so it survives being read without one (§38).
 * ------------------------------------------------------------------------- */

const STATUS_MARK: Record<CheckStatus, { className: string; label: string }> = {
  pass: { className: "text-verified", label: "Passed" },
  fail: { className: "text-conflict", label: "Failed" },
  unknown: { className: "text-unknown", label: "Unknown" },
};

export function EvidenceMark({ status, className = "" }: { status: CheckStatus; className?: string }) {
  const mark = STATUS_MARK[status];
  if (status === "unknown") {
    return (
      <span
        aria-hidden
        className={`mt-[3px] shrink-0 text-[9.5px] font-semibold uppercase tracking-[0.1em] ${mark.className} ${className}`}
      >
        unknown
      </span>
    );
  }
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      focusable="false"
      className={`mt-[2px] h-4 w-4 shrink-0 ${mark.className} ${className}`}
    >
      <circle cx="8" cy="8" r="7.1" stroke="currentColor" strokeWidth="1.1" opacity="0.4" />
      {status === "pass" ? (
        <path
          d="M5 8.2 7.1 10.3 11 5.9"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path d="M5.6 5.6 10.4 10.4 M10.4 5.6 5.6 10.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      )}
    </svg>
  );
}

export function CheckRow({ check, highlight = false }: { check: Check; highlight?: boolean }) {
  const mark = STATUS_MARK[check.status];
  return (
    <li
      className={`border-t border-line-soft py-3.5 first:border-0 first:pt-0 ${
        highlight ? "-mx-2 rounded-sm bg-brand-soft/60 px-2" : ""
      }`}
      data-testid="check"
      data-check-key={check.key}
      data-check-status={check.status}
    >
      <div className="flex items-start gap-3">
        <EvidenceMark status={check.status} />
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-medium leading-snug">
            <span className="sr-only">{mark.label}: </span>
            {check.claim}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{check.detail}</p>
          <p className="tnum mt-1.5 text-[11.5px] text-ink-faint">
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
    <p className="tnum text-[12.5px] text-ink-soft" data-testid="check-tally">
      <span className="font-medium text-verified">{passed} passed</span>
      {" · "}
      <span className="font-medium text-conflict">{failed} failed</span>
      {unknown > 0 ? (
        <>
          {" · "}
          <span className="text-unknown">{unknown} unknown</span>
        </>
      ) : null}
    </p>
  );
}

/**
 * Rank for the alternatives list. A numeral, not a medal: these are options
 * ordered by criteria we could check, not a podium (§26).
 */
export function MedalRank({ rank }: { rank: number }) {
  return (
    <span
      className="tnum grid h-7 w-7 shrink-0 place-items-center rounded-full border border-brand-line bg-brand-soft text-[12px] font-semibold text-brand-deep"
      aria-label={`Rank ${rank}`}
      data-testid="medal"
    >
      {rank}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * Badges
 * ------------------------------------------------------------------------- */

type PillTone = "neutral" | "brand" | "warn" | "verified" | "unknown" | "conflict";

const PILL_TONE: Record<PillTone, string> = {
  neutral: "border-line bg-transparent text-ink-faint",
  brand: "border-brand-line bg-brand-soft text-brand-deep",
  warn: "border-attention-line bg-attention-soft text-attention",
  verified: "border-verified-line bg-verified-soft text-verified",
  unknown: "border-unknown-line bg-unknown-soft text-unknown",
  conflict: "border-conflict-line bg-conflict-soft text-conflict",
};

export function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: PillTone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-[3px] text-[11px] font-medium ${PILL_TONE[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * The demo label (§44). Anything on screen that was not produced by a live scan
 * says so, in words, next to itself — a worked example is a fine thing to show
 * and a terrible thing to let somebody mistake for a verification of their own.
 */
export function DemoLabel({ children = "Worked example" }: { children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line bg-paper px-2.5 py-[3px] text-[11px] font-medium text-ink-faint">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-clay" />
      {children}
    </span>
  );
}

/** Fixed text, shown on every screen that shows a verdict. Never edited per product. */
export function Disclaimer({ text }: { text: string }) {
  return (
    <p
      className="rounded-md border border-line bg-paper px-3.5 py-3 text-[11.5px] leading-relaxed text-ink-faint"
      data-testid="disclaimer"
    >
      {text}
    </p>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card className="text-center">
      <p className="font-display text-[22px] leading-tight">{title}</p>
      <p className="mx-auto mt-2.5 max-w-[40ch] text-[13.5px] leading-relaxed text-ink-soft">{body}</p>
    </Card>
  );
}
