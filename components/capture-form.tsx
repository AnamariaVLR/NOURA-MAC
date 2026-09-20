"use client";

/**
 * Stage 1 — capture.
 *
 * ONE PRIMARY ACTION. The shopper this is for is standing in an aisle holding a
 * jar in one hand, and the only thing they want is the camera. `capture=
 * "environment"` opens the rear camera directly rather than a picker, so Scan is
 * one tap from the home screen to a viewfinder.
 *
 * Everything else is secondary and looks it: choosing a screenshot, for the
 * person at a desk, and pasting one, for the person who just took it. Both are
 * real workflows and neither should compete with the button that matters.
 *
 * The photo is shrunk to 1600px before upload (lib/image-client.ts) because on
 * supermarket 4G the difference between a 5 MB and a 400 KB upload is the
 * difference between a scan that works and a scan that gets abandoned.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { shrinkImage } from "@/lib/image-client";

type Status = "idle" | "ready" | "working" | "error";

const STEPS = [
  "Identifying the product",
  "Gathering published evidence",
  "Working through the checks",
];

export function CaptureForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const accept = useCallback((incoming: File | null | undefined) => {
    if (!incoming) return;
    if (!incoming.type.startsWith("image/")) {
      setStatus("error");
      setMessage("That file is not an image.");
      return;
    }
    setFile(incoming);
    setStatus("ready");
    setMessage(null);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(incoming);
    });
  }, []);

  // Paste a screenshot straight onto the page.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith("image/"),
      );
      if (item) accept(item.getAsFile());
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [accept]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  // Advance the progress copy while the pipeline runs. Cosmetic, but a blank
  // screen during three sequential network calls reads as a hang.
  useEffect(() => {
    if (status !== "working") return;
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1800);
    return () => clearInterval(timer);
  }, [status]);

  async function submit() {
    if (!file) return;
    setStatus("working");
    setStep(0);
    setMessage(null);

    try {
      // Shrink in the browser. Best-effort: shrinkImage returns the original
      // file if anything about the decode or encode fails.
      const upload = await shrinkImage(file);
      const body = new FormData();
      body.append("image", upload);
      const response = await fetch("/api/scan", { method: "POST", body });
      const payload = (await response.json()) as { id?: string; error?: string };

      if (!response.ok || !payload.id) {
        setStatus("error");
        setMessage(payload.error ?? "That scan could not be completed.");
        return;
      }
      router.push(`/result/${payload.id}`);
    } catch {
      setStatus("error");
      setMessage("The request did not reach the server. Check your connection and try again.");
    }
  }

  return (
    <div className="space-y-4">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => accept(e.target.files?.[0])}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="file-input"
        onChange={(e) => accept(e.target.files?.[0])}
      />

      {preview ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="The product you are about to scan"
            className="max-h-64 w-full object-contain"
          />
          <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[12px] text-ink-soft">
            <span className="truncate">{file?.name ?? "Pasted screenshot"}</span>
            <button
              type="button"
              className="shrink-0 underline underline-offset-2"
              onClick={() => {
                setFile(null);
                setPreview(null);
                setStatus("idle");
              }}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-line bg-card px-4 py-8 text-center">
          <p className="text-[15px] font-medium">Photograph the front of the pack</p>
          <p className="mx-auto mt-1.5 max-w-[34ch] text-[13px] leading-relaxed text-ink-soft">
            Include the barcode if you can — it is the only part of a label we can check exactly.
          </p>
        </div>
      )}

      {file ? (
        // Something is loaded: the only thing left to do is run it.
        <button
          type="button"
          disabled={status === "working"}
          onClick={submit}
          data-testid="analyse-button"
          className="w-full rounded-2xl bg-ink px-4 py-5 text-[17px] font-semibold text-paper disabled:opacity-35"
        >
          {status === "working" ? `${STEPS[step]}…` : "Check this product"}
        </button>
      ) : (
        <>
          {/* The primary action, and it is not close. */}
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            data-testid="scan-button"
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-brand px-4 py-6 text-[19px] font-semibold text-white shadow-sm active:opacity-90"
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 8V6a2 2 0 0 1 2-2h2" />
              <path d="M17 4h2a2 2 0 0 1 2 2v2" />
              <path d="M21 16v2a2 2 0 0 1-2 2h-2" />
              <path d="M7 20H5a2 2 0 0 1-2-2v-2" />
              <circle cx="12" cy="12" r="3.2" />
            </svg>
            Scan a product
          </button>

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            data-testid="choose-file"
            className="w-full rounded-xl border border-line bg-card px-4 py-3 text-[14px] font-medium text-ink-soft active:opacity-90"
          >
            Choose a screenshot
          </button>

          <p className="text-center text-[12px] text-ink-faint">or paste one (⌘V)</p>
        </>
      )}

      {message ? (
        <p
          role="alert"
          className="rounded-xl border border-warn-line bg-warn-bg px-3 py-2.5 text-[13px] text-ink-soft"
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
