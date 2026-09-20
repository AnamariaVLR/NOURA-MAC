"use client";

/**
 * Password, one button. Posts to /api/admin-login, which sets the cookie and
 * hands back nothing but an ok — the token never touches page JavaScript.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AdminLoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    const body = new FormData();
    body.set("password", password);

    try {
      const res = await fetch("/api/admin-login", { method: "POST", body });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error ?? "That did not work. Try again.");
        setBusy(false);
        return;
      }
      // A full navigation, not router.push: the cookie has to be present on the
      // next request and a client-side transition can race the Set-Cookie.
      window.location.href = next;
    } catch {
      setError("No connection. Check your signal and try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3" data-testid="admin-login-form">
      <div>
        <label htmlFor="admin-password" className="block text-[12.5px] font-medium">
          Password
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="admin-password"
          className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-3 text-[16px] outline-none focus:border-brand"
        />
      </div>

      {error ? (
        <p role="alert" data-testid="admin-login-error" className="text-[12.5px] text-bad">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={busy || password.length === 0}
        data-testid="admin-login-submit"
        className="w-full rounded-xl bg-ink px-4 py-3.5 text-[15px] font-medium text-paper disabled:opacity-40"
      >
        {busy ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
