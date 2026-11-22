import { currentOrigin } from "@/lib/host";
import { SCOPE } from "@/lib/oauth";
import { json, notAdminHost, preflight } from "@/lib/oauth-http";

export const dynamic = "force-dynamic";

/** Describes this app's OAuth endpoints (RFC 8414). */
export async function GET() {
  const hidden = await notAdminHost();
  if (hidden) return hidden;
  const origin = await currentOrigin();
  return json({
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE],
    authorization_response_iss_parameter_supported: true,
  });
}

export const OPTIONS = preflight;
