import { appTimezone } from "@/lib/timezone";
import { CopyButton } from "@/components/CopyButton";
import { ActionForm, ConfirmButton } from "@/components/forms";
import { sessionUser } from "@/lib/auth";
import { APP_NAME, APP_SLUG } from "@/lib/brand";
import { currentOrigin } from "@/lib/host";
import { MCP_PATH, listGrants } from "@/lib/oauth";
import { revokeGrantAction } from "../../actions";

export const dynamic = "force-dynamic";

const when = (d: Date | null) => (d ? new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: appTimezone() }) : "Never");


/** A copyable block of text: a command or a config snippet. */
function Snippet({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-2 rounded-md bg-ground">
      <div className="flex items-center justify-between gap-3 px-3 pt-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-mute">{label}</span>
        <CopyButton value={value} />
      </div>
      <pre className="overflow-x-auto px-3 pb-3 pt-1 font-mono text-[13px] leading-relaxed">{value}</pre>
    </div>
  );
}

function Client({ name, open = false, children }: { name: string; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="border-t border-line py-3 first:border-t-0">
      <summary className="text-sm font-bold">{name}</summary>
      <div className="mt-2 space-y-2 pl-5 text-sm text-ink/80">{children}</div>
    </details>
  );
}

function Example({ ask, tools, result }: { ask: string; tools: string[]; result: string }) {
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-mute">You ask</div>
      <p className="mt-1 text-sm font-semibold">&ldquo;{ask}&rdquo;</p>
      <div className="mt-3 text-[11px] font-medium uppercase tracking-wide text-mute">The agent uses</div>
      <p className="mt-1 flex flex-wrap gap-1.5">
        {tools.map((t) => (
          <span key={t} className="rounded-md bg-ground px-2 py-1 font-mono text-xs">{t}</span>
        ))}
      </p>
      <div className="mt-3 text-[11px] font-medium uppercase tracking-wide text-mute">You get</div>
      <p className="mt-1 text-sm text-ink/80">{result}</p>
    </div>
  );
}

export default async function ConnectionsPage() {
  const user = await sessionUser();
  const admin = user?.role === "admin";
  // Everyone sees their own connections; admins see everyone's.
  const [origin, grants] = await Promise.all([currentOrigin(), listGrants(admin ? undefined : user?.email ?? "")]);
  const address = `${origin}${MCP_PATH}`;
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight">Connected apps</h1>
        <p className="mt-1 text-sm text-mute">
          Let Claude, or another app that speaks MCP, work with your links, QR codes, galleries and domains. Each connection acts as the person who approved it, with the same permissions.
        </p>
      </div>

      <section className="card p-5">
        <h2 className="text-lg font-extrabold">Connect an app</h2>
        <p className="mt-1 text-sm text-mute">Give the app this server address. It then asks you to sign in with your work account and approve.</p>
        <div className="mt-4 flex items-center justify-between gap-3 rounded-md bg-ground px-3 py-2">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-mute">Server address</div>
            <div className="truncate font-mono text-sm">{address}</div>
          </div>
          <CopyButton value={address} />
        </div>
        <p className="mt-4 text-sm text-ink/80">
          Any AI agent that supports <span className="font-semibold">remote MCP servers</span> can use it, not only Claude. The first time, it opens a browser window where you sign in with your work account and approve. Setup for a few common agents is below.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-extrabold">Add it to your AI agent</h2>
        <p className="mt-1 text-sm text-mute">
          All of them need only the server address above. The menus and config formats of these tools change from time to time, so if one differs, check that tool&apos;s own MCP documentation and give it the same address.
        </p>
        <div className="mt-3">
          <Client name="Claude (web, desktop and mobile)" open>
            <p>Open Settings, then Connectors, and add a custom connector. Give it a name such as {APP_NAME}, paste the server address, then sign in and approve when asked.</p>
          </Client>
          <Client name="Claude Code">
            <Snippet label="Run in a terminal" value={`claude mcp add --transport http ${APP_SLUG} ${address}`} />
            <p>Then run <span className="font-mono text-[13px]">/mcp</span> inside Claude Code, choose {APP_SLUG} and sign in.</p>
          </Client>
          <Client name="Cursor">
            <p>Add this to <span className="font-mono text-[13px]">~/.cursor/mcp.json</span> (or <span className="font-mono text-[13px]">.cursor/mcp.json</span> in a project), then sign in when Cursor asks.</p>
            <Snippet label="mcp.json" value={JSON.stringify({ mcpServers: { [APP_SLUG]: { url: address } } }, null, 2)} />
          </Client>
          <Client name="VS Code (Copilot agent mode)">
            <p>Add this to <span className="font-mono text-[13px]">.vscode/mcp.json</span>, or use the command <span className="font-semibold">MCP: Add Server</span> and choose HTTP. VS Code uses <span className="font-mono text-[13px]">servers</span> as the top-level key.</p>
            <Snippet label=".vscode/mcp.json" value={JSON.stringify({ servers: { [APP_SLUG]: { type: "http", url: address } } }, null, 2)} />
          </Client>
          <Client name="Gemini CLI">
            <p>Add this to <span className="font-mono text-[13px]">~/.gemini/settings.json</span>. Use <span className="font-mono text-[13px]">httpUrl</span>, not <span className="font-mono text-[13px]">url</span>, which Gemini CLI treats as the older SSE transport.</p>
            <Snippet label="settings.json" value={JSON.stringify({ mcpServers: { [APP_SLUG]: { httpUrl: address } } }, null, 2)} />
          </Client>
          <Client name="Any other agent">
            <p>Look for &ldquo;add an MCP server&rdquo; or &ldquo;connector&rdquo; and choose <span className="font-semibold">Streamable HTTP</span> (sometimes just &ldquo;HTTP&rdquo; or &ldquo;remote&rdquo;) with OAuth sign-in. Paste the server address and nothing else.</p>
            <p>If an agent can only run <em>local</em> servers, a small bridge can connect it:</p>
            <Snippet label="Command that starts the bridge" value={`npx mcp-remote ${address}`} />
            <p>To look at every request and reply while you learn how MCP works, use the official inspector: <span className="font-mono text-[13px]">npx @modelcontextprotocol/inspector</span>.</p>
          </Client>
        </div>
        <p className="mt-3 text-xs text-mute">
          The agent acts as you. {admin ? "As an admin you also get the tool for adding domains." : "As a member you get the link, QR code, gallery and campaign tools; adding domains is for admins."} It can never delete a link, gallery or domain.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="text-lg font-extrabold">What you can ask</h2>
        <p className="mt-1 text-sm text-mute">Just say what you want in plain words. The agent picks the right tools, and shows you what it did.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Example
            ask="Create a link on go.example.com to https://example.com/spring for the spring-launch campaign, from the newsletter, and show me its QR code."
            tools={["create_link", "get_qr_code"]}
            result="The short URL, already tagged with the campaign and source, and the QR code as an image you can save. Printed copies never need to change, because UTM values are added when someone follows the link."
          />
          <Example
            ask="Which links got the most clicks this week, and which campaign is doing best?"
            tools={["search_links", "list_campaigns", "get_link"]}
            result="A ranked list with clicks for 7 days and in total, QR scans counted apart from clicks, and the best campaign. Ask a follow-up about any single link for its daily clicks, top referrers, countries and devices."
          />
        </div>
        <ul className="mt-5 list-disc space-y-1.5 pl-5 text-sm text-ink/80">
          <li>&ldquo;Change where go.example.com/payroll goes to the new page.&rdquo; The domain and slug stay fixed, so printed QR codes keep working.</li>
          <li>&ldquo;Make that QR code dark blue on a transparent background.&rdquo; It asks whether the colours should apply to every QR code on the domain before saving.</li>
          <li>&ldquo;Create a gallery called Spring Event on go.example.com.&rdquo;</li>
          {admin && <li>&ldquo;Add go.newbrand.com, tell me what is left to do, then park it and check whether it is live.&rdquo; Admins only.</li>}
        </ul>
        <p className="mt-4 text-xs text-mute">
          Things the agent reads, such as link titles and notes, are written by people, so treat an unfamiliar agent with the same care as any tool that can edit your links.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-extrabold">{admin ? "All connections" : "Your connections"}</h2>
        {grants.length === 0 ? (
          <p className="rounded-lg border border-dashed border-ink/20 p-6 text-center text-sm text-mute">No apps are connected.</p>
        ) : (
          <div className="card divide-y divide-line">
            {grants.map((g) => (
              <div key={g.grant_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="font-bold">{g.client_name}</div>
                  <div className="text-xs text-mute">
                    Approved by {g.user_email} on {when(g.connected_at)}. Last used: {when(g.last_used_at)}.
                  </div>
                </div>
                <ActionForm action={revokeGrantAction}>
                  <input type="hidden" name="grant_id" value={g.grant_id} />
                  <ConfirmButton message={`Disconnect ${g.client_name}? It will stop working straight away.`}>Disconnect</ConfirmButton>
                </ActionForm>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
