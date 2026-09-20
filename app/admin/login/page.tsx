/**
 * The admin sign-in screen.
 *
 * Reachable without a cookie by design — it is the only page under /admin that
 * is. If no ADMIN_PASSWORD is configured it renders a 404-shaped page rather than
 * a form, so the deployment does not advertise a door it has no key for.
 */
import { notFound } from "next/navigation";
import { AdminLoginForm } from "@/components/admin-login-form";
import { Card } from "@/components/ui";
import { adminEnabled } from "@/lib/admin-auth";
import { isAdminRequest } from "@/lib/admin-session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if (!adminEnabled()) notFound();

  const { next } = await searchParams;
  // Only ever redirect within this app. An open redirect on a login page is how
  // a phishing link gets to borrow your domain.
  const destination = next && next.startsWith("/") && !next.startsWith("//") ? next : "/admin/listings";

  if (await isAdminRequest()) redirect(destination);

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-[19px] font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
          Price checks are recorded here. One password, remembered on this phone for 30 days.
        </p>
        <AdminLoginForm next={destination} />
      </Card>
      <p className="px-1 text-[11.5px] leading-relaxed text-ink-faint">
        Signing in stores a cookie that only the server can read. It does not identify you and it
        is not linked to your scan history.
      </p>
    </div>
  );
}
