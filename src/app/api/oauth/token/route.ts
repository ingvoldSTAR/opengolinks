import { exchangeCode, refreshTokens } from "@/lib/oauth";
import { sameResource } from "@/lib/oauth-core";
import { json, mcpResource, notAdminHost, oauthError, preflight, readLimited } from "@/lib/oauth-http";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/** Trades an authorization code (with its PKCE verifier) or a refresh token for access tokens. */
export async function POST(req: Request) {
  const hidden = await notAdminHost();
  if (hidden) return hidden;
  const gate = await rateLimit("oauth-token", 60, 15);
  if (!gate.allowed) return oauthError("invalid_request", "Too many requests. Try again later.", 429, { "Retry-After": String(gate.retryAfter) });

  const raw = await readLimited(req, 10_000);
  if (raw === null) return oauthError("invalid_request", "The request body is too large.");
  const form = new URLSearchParams(raw);
  const get = (name: string) => form.get(name) ?? "";

  const grantType = get("grant_type");
  const clientId = get("client_id");
  if (!clientId) return oauthError("invalid_client", "client_id is required.", 401);

  let result;
  if (grantType === "authorization_code") {
    if (!get("code") || !get("redirect_uri") || !get("code_verifier")) {
      return oauthError("invalid_request", "code, redirect_uri and code_verifier are required.");
    }
    if (get("resource") && !sameResource(get("resource"), await mcpResource())) {
      return oauthError("invalid_target", "This server only issues tokens for its own MCP endpoint.");
    }
    result = await exchangeCode({
      code: get("code"),
      clientId,
      redirectUri: get("redirect_uri"),
      verifier: get("code_verifier"),
      resource: get("resource") ? get("resource") : null,
    });
  } else if (grantType === "refresh_token") {
    if (!get("refresh_token")) return oauthError("invalid_request", "refresh_token is required.");
    result = await refreshTokens({ refreshToken: get("refresh_token"), clientId });
  } else {
    return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
  }

  if (!result.ok) return oauthError(result.error, result.description, result.error === "invalid_client" ? 401 : 400);
  return json(result.body);
}

export const OPTIONS = preflight;
