import Link from "next/link";
import { adminsOnly } from "@/lib/gate";
import { mailConfigured, mailFrom } from "@/lib/mailer";
import { signInSettingProblems, configuredProviders, passwordLoginEnabled, providerLabel, type ProviderId } from "@/lib/providers";

export const dynamic = "force-dynamic";

const all: ProviderId[] = ["microsoft", "github", "google"];

function Row({ on, name, note, warn = false }: { on: boolean; name: string; note: string; warn?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden="true" className={`size-1.5 rounded-full ${warn ? "bg-danger" : on ? "bg-ok" : "bg-mute/50"}`} />
      <span className="font-semibold">{name}</span>
      <span className="text-mute">{note}</span>
    </li>
  );
}

/** How the app is set up: sign-in, email and integrations. These come from environment variables, so this page only reports them. */
export default async function SettingsPage() {
  const denied = await adminsOnly();
  if (denied) return denied;
  const providers = configuredProviders();
  const problems = signInSettingProblems();
  const password = passwordLoginEnabled();
  const emailOn = mailConfigured();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight">Settings</h1>
        <p className="mt-1 max-w-2xl text-sm text-mute">
          How sign-in, email and integrations are set up. These come from environment variables, so to change one, edit it in your host's settings (or .env locally) and restart. Setup steps are in docs/auth.md and docs/mcp.md.
        </p>
      </div>

      {problems.length > 0 && (
        <div role="alert" className="rounded-xl bg-danger-tint px-4 py-3 text-sm font-medium text-danger-ink">
          <p className="font-bold">A setting needs fixing:</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="card p-5">
        <h2 className="text-lg font-extrabold">Sign-in options</h2>
        <p className="mt-1 text-sm text-mute">
          People sign in with one of these, using the address they were invited at. Manage who has access on the <Link href="/admin/users" className="text-accent-deep hover:underline">People</Link> page.
        </p>
        <ul className="mt-4 space-y-1.5 text-sm">
          {all.map((p) => (
            <Row key={p} on={providers.includes(p)} name={providerLabel[p]} note={providers.includes(p) ? "on" : "off, not set up"} />
          ))}
          <Row on={!password} warn={password} name="Shared password" note={password ? "still on" : "off"} />
        </ul>
        {password && (
          <p className="mt-3 rounded-lg bg-danger-tint px-3 py-2 text-xs font-medium text-danger-ink">
            The shared password still works and its actions are not tied to a person. Once everyone has signed in with their own account, remove ADMIN_PASSWORD from the environment variables and redeploy to switch it off.
          </p>
        )}
        {providers.length === 0 && <p className="mt-3 text-xs text-mute">No provider is set up, so only the shared password can sign in. See docs/auth.md.</p>}
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-extrabold">Email</h2>
        <ul className="mt-4 space-y-1.5 text-sm">
          <Row on={emailOn} name="Invitation email" note={emailOn ? `on, sent from ${mailFrom()}` : "off, invitations give you a link to share"} />
        </ul>
        <p className="mt-4 text-xs text-mute">
          To connect Claude, see <Link href="/admin/connections" className="text-accent-deep hover:underline">Connected apps</Link>.
        </p>
      </section>
    </div>
  );
}
