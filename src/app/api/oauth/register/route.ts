import { registerClient } from "@/lib/oauth";
import { json, notAdminHost, oauthError, preflight, readLimited } from "@/lib/oauth-http";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** Dynamic client registration (RFC 7591): an MCP client says who it is and where to send people back. Public clients only. */
export async function POST(req: Request) {
  const hidden = await notAdminHost();
  if (hidden) return hidden;
  const gate = await rateLimit("oauth-register", 20, 60);
  if (!gate.allowed) return oauthError("invalid_client_metadata", "Too many registrations. Try again later.", 429, { "Retry-After": String(gate.retryAfter) });

  const text = await readLimited(req, 8_000);
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(text ?? "");
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return oauthError("invalid_client_metadata", "The body must be a JSON object under 8 KB.");
  }
  // Every client here is public and proves itself with PKCE. One that asks for a client secret is registered
  // as public anyway: the response says "none", which the standard lets a server substitute.

  const result = await registerClient(body.client_name, body.redirect_uris);
  if (!result.ok) return oauthError(result.error, result.description);
  return json(
    {
      client_id: result.client.client_id,
      client_name: result.client.client_name,
      redirect_uris: result.client.redirect_uris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: "mcp",
    },
    201,
  );
}

export const OPTIONS = preflight;
