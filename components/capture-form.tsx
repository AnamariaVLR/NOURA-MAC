"use client";

/**
 * Stage 1 — capture. Three ways in, because a person in an aisle and a person at a
 * desk reach for different things:
 *   - the phone camera (`capture="environment"` opens the rear camera directly)
 *   - a file from the device
 *   - a screenshot pasted from the clipboard
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

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
      const body = new FormData();
      body.append("image", file);
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

      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          className="rounded-xl bg-brand px-4 py-3 text-[14px] font-semibold text-white active:opacity-90"
        >
          Take a photo
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="rounded-xl border border-line bg-card px-4 py-3 text-[14px] font-semibold text-ink active:opacity-90"
        >
          Choose a file
        </button>
      </div>

      <p className="text-center text-[12px] text-ink-faint">or paste a screenshot (⌘V)</p>

      <button
        type="button"
        disabled={!file || status === "working"}
        onClick={submit}
        data-testid="analyse-button"
        className="w-full rounded-xl bg-ink px-4 py-3.5 text-[15px] font-semibold text-paper disabled:opacity-35"
      >
        {status === "working" ? `${STEPS[step]}…` : "Check this product"}
      </button>

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
