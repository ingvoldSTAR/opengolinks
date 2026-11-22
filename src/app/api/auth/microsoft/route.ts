import type { NextRequest } from "next/server";
import { endpoints, microsoft } from "@/lib/providers";
import { startFlow } from "@/lib/signin-flow";

export const dynamic = "force-dynamic";

/** Starts the Microsoft 365 sign-in, for one tenant only (authorization code with PKCE and a nonce). */
export async function GET(req: NextRequest) {
  return startFlow(req, "microsoft", ({ redirectUri, state, challenge, nonce }) => {
    const m = microsoft();
    const url = new URL(`${endpoints().microsoftLogin}/${encodeURIComponent(m.tenant)}/oauth2/v2.0/authorize`);
    url.searchParams.set("client_id", m.clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("scope", "openid profile email");
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("prompt", "select_account");
    return url;
  });
}
