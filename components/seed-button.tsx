"use client";

import { useState } from "react";

type Summary = Record<string, number>;

export function SeedButton({ enabled }: { enabled: boolean }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reseed() {
    setState("working");
    setError(null);
    try {
      const response = await fetch("/api/seed", { method: "POST" });
      const payload = (await response.json()) as { summary?: Summary; error?: string };
      if (!response.ok) {
        setState("error");
        setError(payload.error ?? "Seeding failed.");
        return;
      }
      setSummary(payload.summary ?? null);
      setState("done");
    } catch {
      setState("error");
      setError("The request did not reach the server.");
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={reseed}
        disabled={!enabled || state === "working"}
        data-testid="reseed-button"
        className="w-full rounded-xl bg-brand px-4 py-3 text-[14px] font-semibold text-white disabled:opacity-40"
      >
        {state === "working" ? "Reloading seed data…" : "Reload seed data"}
      </button>

      {!enabled ? (
        <p className="text-[12px] leading-relaxed text-ink-soft">
          Disabled. Run in development, or set{" "}
          <code className="rounded bg-black/5 px-1 py-0.5">ALLOW_SEED_ENDPOINT=1</code>.
        </p>
      ) : null}

      {state === "done" && summary ? (
        <div className="rounded-xl border border-line px-3 py-2.5 text-[12.5px]">
          <p className="font-medium">Seed reloaded</p>
          <ul className="mt-1 space-y-0.5 text-ink-soft">
            {Object.entries(summary).map(([key, value]) => (
              <li key={key} className="tnum">
                {key}: {value}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state === "error" && error ? (
        <p
          role="alert"
          className="rounded-xl border border-warn-line bg-warn-bg px-3 py-2.5 text-[12.5px] text-ink-soft"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
