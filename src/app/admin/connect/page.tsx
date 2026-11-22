import { APP_NAME } from "@/lib/brand";
import { notFound, redirect } from "next/navigation";
import { sessionUser } from "@/lib/auth";
import { currentHost, isAdminHost } from "@/lib/host";
import { parseAuthRequest } from "@/lib/oauth";
import { ProviderButtons } from "@/components/ProviderButtons";
import { configuredProviders } from "@/lib/providers";
import { mcpResource } from "@/lib/oauth-http";

export const dynamic = "force-dynamic";

const KEYS = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource"] as const;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ink px-4 py-12">
      <div className="rise card w-full max-w-md p-7 sm:p-8">
        <p className="mb-7 text-xl font-bold tracking-tight">{APP_NAME}</p>
        {children}
      </div>
    </main>
  );
}

/** Where the app will be sent back to, in words a person can check. */
function destination(uri: string): string {
  try {
    const url = new URL(uri);
    return url.protocol === "https:" || url.protocol === "http:" ? url.host : `the ${url.protocol.replace(":", "")} app on this computer`;
  } catch {
    return "an unknown address";
  }
}

/** The consent step of connecting an MCP client (Claude, for example) to this app. */
export default async function ConnectPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!isAdminHost(await currentHost())) notFound();

  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const key of KEYS) {
    const v = raw[key];
    if (typeof v === "string") params.set(key, v);
  }

  const user = await sessionUser();
  const email = user?.email ?? null;
  const admin = user?.role === "admin";
  if (email === null) redirect(`/admin/login?next=${encodeURIComponent(`/admin/connect?${params.toString()}`)}`);

  const result = await parseAuthRequest((n) => params.get(n), await mcpResource());
  if (!result.ok) {
    if (result.redirectTo) redirect(result.redirectTo);
    return (
      <Shell>
        <h1 className="text-2xl font-extrabold tracking-tight">Cannot connect this app</h1>
        <p role="alert" className="mt-3 text-sm text-danger-ink">{result.description}</p>
      </Shell>
    );
  }
  const { request } = result;

  if (email === "") {
    const back = `/admin/connect?${params.toString()}`;
    return (
      <Shell>
        <h1 className="text-2xl font-extrabold tracking-tight">Sign in with your own account first</h1>
        <p className="mt-3 text-sm text-ink/80">
          You are signed in with the shared password. Apps can only be connected by a named person, so each connection can be traced and removed.
        </p>
        <ProviderButtons providers={configuredProviders()} next={back} />
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-2xl font-extrabold tracking-tight">Connect {request.client.client_name}?</h1>
      <p className="mt-1 text-sm text-mute">Signed in as {email}.</p>

      <div className="mt-5 rounded-xl bg-ground p-4 text-sm">
        <p className="font-bold">It will be able to:</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink/80">
          <li>See your links, clicks, QR scans and campaigns</li>
          <li>Create links and change their destination, title and campaign tags</li>
          <li>Get QR codes and change their saved colours</li>
          <li>Create galleries{admin ? ", add domains" : ""} and check whether domains are live</li>
        </ul>
        <p className="mt-3 font-bold">It will not be able to delete links, galleries or domains.</p>
      </div>

      <p className="mt-4 text-xs text-mute">
        After you approve, you are sent back to <span className="font-semibold text-ink">{destination(request.redirectUri)}</span>. Only continue if you started this connection yourself. You can remove it any time under Connected apps.
      </p>

      <form method="post" action="/api/oauth/authorize" className="mt-6 flex flex-wrap gap-3">
        {KEYS.map((key) => (params.get(key) !== null ? <input key={key} type="hidden" name={key} value={params.get(key) ?? ""} /> : null))}
        <button name="decision" value="approve" className="rounded-lg bg-accent px-5 py-2.5 text-sm font-extrabold italic text-white transition-colors hover:bg-accent-deep">
          Approve
        </button>
        <button name="decision" value="deny" className="rounded-lg border border-line bg-white px-5 py-2.5 text-sm font-semibold transition-colors hover:border-accent hover:text-accent-deep">
          Cancel
        </button>
      </form>
    </Shell>
  );
}
