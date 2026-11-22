# Connecting an AI agent (MCP)

The app has a built-in MCP server, so an AI agent (Claude, or any other MCP client) can create links, change destinations, fetch QR codes, read campaign results and add domains. It runs inside this app at `/api/mcp`, so it deploys with everything else and needs no extra service.

## What it can do

| Tool | What it does | Changes data? |
|---|---|---|
| `list_domains` | Domains, link and gallery counts, redirect settings | no |
| `search_links` | Find links by words, domain or campaign | no |
| `get_link` | One link with 30 days of clicks, QR scans, top referrers, countries, devices | no |
| `list_campaigns` | Campaign totals | no |
| `create_link` | New short link, with UTM values | adds |
| `update_link` | Change destination, title, notes, redirect type, UTM values | changes |
| `get_qr_code` | The QR code as a PNG image or SVG, in the saved colours | no |
| `set_qr_colours` | Save QR colours for one link or gallery, or for the whole domain | changes |
| `list_galleries`, `create_gallery` | Link-in-bio galleries | adds |
| `add_domain` | Add a domain, with the main website as the default redirect, and say what is left to do (admins only) | adds |
| `check_domain_status` | DNS and reachability, so you know when a domain is live | no |

The tools follow the person's role (see [docs/auth.md](docs/auth.md)): members get everything except `add_domain`, which is for admins. **Nothing can delete a link, gallery or domain**, by design: a printed QR code must never break. A link's domain and slug cannot be changed either.

`set_qr_colours` takes an `apply_to_domain` answer, and its description tells the model to ask you first, every time, the same way the admin screen does.

## How signing in works

MCP clients discover and sign in on their own. There is no shared secret to copy.

1. The client calls `/api/mcp`, gets a 401 and reads `/.well-known/oauth-protected-resource/api/mcp`, which points at this app as the authorization server.
2. It reads `/.well-known/oauth-authorization-server`, then registers itself at `/api/oauth/register` (dynamic client registration; public clients only).
3. It opens your browser at `/api/oauth/authorize`. That sends you to `/admin/connect`, asking you to sign in first if you are not. The page names the app, says what it can do and where it will send you back to.
4. You approve. The app sends your browser back to the client with a one-time code (valid for two minutes).
5. The client trades the code and its PKCE verifier at `/api/oauth/token` for an access token (one hour) and a refresh token (30 days, replaced each time it is used).

Every call then runs **as the person who approved**. Access ends if you disconnect the app (Admin, then Connected apps), if the person is removed on the People page, or when the refresh token lapses.

Only people with a named account can approve: someone signed in with the shared password sees a prompt to use another sign-in option. A provider therefore has to be set up first (see [docs/auth.md](docs/auth.md)). Members can connect too, and see only their own connections; admins see everyone's.

## Set it up

Nothing new is needed for the links, QR, gallery and domain tools. After deploying:

1. Make sure `ADMIN_HOSTS` is set and a sign-in option (GitHub, Google or Microsoft 365) works.
2. Open Admin, then Connected apps. It shows the server address, `https://<your admin host>/api/mcp`.
3. Connect an agent. Any AI agent that supports remote MCP servers can use it, not only Claude. It needs only the server address, and the first time it opens a browser window where you sign in and approve. The Connected apps page shows these with copy buttons, using your `APP_NAME` as the server name; client menus and config formats change, so check the client's own MCP documentation if one differs.
   - **Claude (web, desktop, mobile):** Settings, then Connectors, then add a custom connector with the address.
   - **Claude Code:** `claude mcp add --transport http opengolinks https://<your admin host>/api/mcp`, then run `/mcp` and sign in.
   - **Cursor:** in `~/.cursor/mcp.json` (or `.cursor/mcp.json`): `{ "mcpServers": { "opengolinks": { "url": "https://<your admin host>/api/mcp" } } }`
   - **VS Code (Copilot agent mode):** in `.vscode/mcp.json`: `{ "servers": { "opengolinks": { "type": "http", "url": "https://<your admin host>/api/mcp" } } }` (the top-level key is `servers`, not `mcpServers`), or use the command *MCP: Add Server*.
   - **Gemini CLI:** in `~/.gemini/settings.json`: `{ "mcpServers": { "opengolinks": { "httpUrl": "https://<your admin host>/api/mcp" } } }`. Use `httpUrl`, because `url` means the older SSE transport there.
   - **Any other agent:** choose *Streamable HTTP* (sometimes called "HTTP" or "remote") with OAuth and paste the address. An agent that can only run local servers can use a bridge: `npx mcp-remote https://<your admin host>/api/mcp`.
   - **MCP Inspector (good for learning):** `npx @modelcontextprotocol/inspector`, choose the Streamable HTTP transport, paste the address and use the OAuth sign-in. You can see every request and response.

Adding a domain end to end then becomes: ask the agent to add it, create the DNS record and attach the domain at your host (the agent lists both steps), and ask the agent to check whether it is live. `check_domain_status` probes from the server, which cannot always reach its own public addresses, so a failure there is not proof: it says so, and the agent should ask you to open the domain in a browser before drawing a conclusion.

## Things to try

- "Create a link on go.example.com to https://example.com/spring with campaign spring-launch, source newsletter, and show me its QR code."
- "Which links got the most clicks in the last week? Which campaign is doing best?"
- "Change the destination of go.example.com/payroll to the new page."
- "Make the QR code for that link dark blue on a transparent background." (It should ask whether to apply that to every code on the domain.)
- "Add go.newbrand.com and tell me what is left to do, then check whether it is live." (Admins only.)

## Security notes

- Codes and tokens are random, stored only as SHA-256 hashes, and a code can be used once. PKCE (S256) is required, so a stolen code is useless without the client's verifier.
- Redirect addresses must be registered and match exactly (a free port is allowed only for localhost). An error in a request is sent back to the client only after its redirect address checks out.
- Approving needs a form posted from this site (Origin check) by a signed-in named user, and the consent and sign-in pages cannot be shown in a frame.
- Registration, token and MCP calls are rate limited, and request bodies are size limited.
- The OAuth and MCP endpoints answer only on the hosts in `ADMIN_HOSTS`, never on a short-link domain.
- **Anything a tool returns is data the model reads**, including link titles, notes and destinations written by colleagues. That is the usual prompt-injection exposure of any MCP server. The tools cannot delete, and every change is attributed to the approving person's connection, but keep it in mind before connecting an app you do not trust.
- A single token authorises everything the tools can do. There are no per-tool permissions yet; the consent page lists them all.
- Refresh tokens rotate, but reuse of an old one is not detected as theft. Disconnect the app if you suspect a leak.

## Troubleshooting

- **The client says it cannot connect or loops on sign-in.** Check that `https://<admin host>/.well-known/oauth-authorization-server` returns JSON. A proxy or firewall rule that blocks `/.well-known/` or `POST /api/oauth/token` breaks sign-in.
- **"The redirect address does not match".** Remove the connection in the client and add it again so it registers fresh.
- **"Sign in with your own account first".** You are signed in with the shared password. Sign in with GitHub, Google or Microsoft instead (you need an account: ask an admin to invite you, or see `ADMIN_EMAILS`).
- **Changes are not showing in the admin.** Reload; the admin page is rendered on request.

## Where the code is

- `src/app/api/mcp/route.ts`: the endpoint (Streamable HTTP, stateless, bearer token required).
- `src/lib/mcp/`: the tools, one file per group, and `index.ts` that assembles the server.
- `src/lib/oauth.ts`, `src/lib/oauth-core.ts`: the OAuth server. The core file has only pure functions (PKCE, redirect rules) and is covered by `tests/oauth-core.test.ts`.
- `src/app/api/oauth/*`, `src/app/.well-known/*`: the OAuth and discovery endpoints.
- `src/app/admin/connect/page.tsx`: the consent screen. `src/app/admin/(protected)/connections/page.tsx`: Connected apps.
- Tables: `oauth_clients`, `oauth_codes`, `oauth_tokens` (created automatically).

Run the unit tests with `npm test` (Node 22.6 or newer).
