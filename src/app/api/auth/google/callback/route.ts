import type { NextRequest } from "next/server";
import { endpoints, google } from "@/lib/providers";
import { failFlow, finishFlow, readCallback } from "@/lib/signin-flow";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const started = await readCallback(req, "google");
  if (!started.ok) return started.res;
  const { code, verifier, redirectUri } = started.cb;
  const g = google();
  const e = endpoints();

  try {
    const tokenRes = await fetch(`${e.googleToken}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id: g.clientId, client_secret: g.clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier }),
      signal: AbortSignal.timeout(15_000),
    });
    const { access_token: token } = (await tokenRes.json()) as { access_token?: string };
    if (!token) return failFlow("google", "Google did not accept the sign-in. Try again.");

    const profileRes = await fetch(`${e.googleApi}/v1/userinfo`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
    if (!profileRes.ok) return failFlow("google", "Could not read your Google profile.");
    const profile = (await profileRes.json()) as { email?: string; email_verified?: boolean | string };
    // Only a verified address counts.
    const verified = profile.email_verified === true || profile.email_verified === "true";
    return finishFlow(req, "google", { verifiedEmails: verified && profile.email ? [profile.email] : [] });
  } catch (err) {
    console.error("[auth] google sign-in failed:", err instanceof Error ? err.message : err);
    return failFlow("google", "Google sign-in failed. Try again.");
  }
}
