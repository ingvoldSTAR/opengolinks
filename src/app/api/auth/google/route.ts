import type { NextRequest } from "next/server";
import { endpoints, google } from "@/lib/providers";
import { startFlow } from "@/lib/signin-flow";

export const dynamic = "force-dynamic";

/** Starts the Google sign-in (authorization code with PKCE). */
export async function GET(req: NextRequest) {
  return startFlow(req, "google", ({ redirectUri, state, challenge }) => {
    const url = new URL(`${endpoints().googleAuth}/o/oauth2/v2/auth`);
    url.searchParams.set("client_id", google().clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("prompt", "select_account");
    return url;
  });
}
