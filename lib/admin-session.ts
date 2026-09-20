/**
 * Reading the admin cookie inside a server component or route handler.
 *
 * Separate from lib/admin-auth.ts because that file is pure — it can be unit
 * tested with no request in scope — and this one needs next/headers. Keeping the
 * crypto testable was worth one extra file.
 */
import { cookies } from "next/headers";
import { ADMIN_COOKIE, adminEnabled, tokenIsValid } from "./admin-auth";

/** Is this request carrying a valid, unexpired admin cookie? */
export async function isAdminRequest(): Promise<boolean> {
  if (!adminEnabled()) return false;
  const store = await cookies();
  return tokenIsValid(store.get(ADMIN_COOKIE)?.value);
}
