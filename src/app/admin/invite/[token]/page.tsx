import { APP_NAME } from "@/lib/brand";
import { appTimezone } from "@/lib/timezone";
import { notFound } from "next/navigation";
import { ProviderButtons } from "@/components/ProviderButtons";
import { currentHost, isAdminHost } from "@/lib/host";
import { findInvitation } from "@/lib/invitations";
import { configuredProviders } from "@/lib/providers";

export const dynamic = "force-dynamic";

const date = (d: Date) => new Date(d).toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: appTimezone() });

/** Where an invitation link lands. Public, but only on the admin host, and it shows nothing without a valid token. */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  if (!isAdminHost(await currentHost())) notFound();
  const { token } = await params;
  const invitation = await findInvitation(token);
  const providers = configuredProviders();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ink px-4 py-12">
      <div className="rise card w-full max-w-sm p-7 sm:p-8">
        <p className="mb-7 text-xl font-bold tracking-tight">{APP_NAME}</p>
        {invitation ? (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight">You are invited</h1>
            <p className="mt-2 text-sm text-ink/80">
              {invitation.invited_by || "An admin"} invited you to {APP_NAME} as {invitation.role === "admin" ? "an admin" : "a member"}.
            </p>
            <p className="mt-3 rounded-lg bg-ground px-3 py-2 text-sm">
              Sign in with the account that uses <span className="font-bold">{invitation.email}</span>. The invitation works once and expires on {date(invitation.expires_at)}.
            </p>
            {providers.length > 0 ? (
              <ProviderButtons providers={providers} invite={token} />
            ) : (
              <p role="alert" className="mt-5 text-sm text-danger-ink">No sign-in method is set up yet. Ask the person who invited you.</p>
            )}
          </>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold tracking-tight">This invitation is no longer valid</h1>
            <p className="mt-2 text-sm text-ink/80">It has expired, was already used, or was replaced by a newer one. Ask an admin to send you a new invitation.</p>
            <a href="/admin/login" className="mt-6 block rounded-lg border border-line bg-white px-4 py-2.5 text-center text-sm font-semibold hover:border-accent hover:text-accent-deep">
              Go to sign in
            </a>
          </>
        )}
      </div>
    </main>
  );
}
