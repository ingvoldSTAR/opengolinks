import type { NextRequest } from "next/server";
import { endpoints, github } from "@/lib/providers";
import { failFlow, finishFlow, readCallback } from "@/lib/signin-flow";

export const dynamic = "force-dynamic";

const ghHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "opengolinks",
});

export async function GET(req: NextRequest) {
  const started = await readCallback(req, "github");
  if (!started.ok) return started.res;
  const { code, redirectUri } = started.cb;
  const g = github();
  const e = endpoints();

  try {
    const tokenRes = await fetch(`${e.githubWeb}/login/oauth/access_token`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "opengolinks" },
      body: JSON.stringify({ client_id: g.clientId, client_secret: g.clientSecret, code, redirect_uri: redirectUri }),
      signal: AbortSignal.timeout(15_000),
    });
    const { access_token: token } = (await tokenRes.json()) as { access_token?: string };
    if (!token) return failFlow("github", "GitHub did not accept the sign-in. Try again.");

    const [userRes, emailsRes] = await Promise.all([
      fetch(`${e.githubApi}/user`, { headers: ghHeaders(token), signal: AbortSignal.timeout(15_000) }),
      fetch(`${e.githubApi}/user/emails`, { headers: ghHeaders(token), signal: AbortSignal.timeout(15_000) }),
    ]);
    if (!userRes.ok || !emailsRes.ok) return failFlow("github", "Could not read your GitHub profile.");
    const { login } = (await userRes.json()) as { login: string };
    const emails = (await emailsRes.json()) as { email: string; verified: boolean }[];

    // Only verified addresses count, otherwise anyone could add someone else's email to GitHub.
    return finishFlow(req, "github", { verifiedEmails: emails.filter((m) => m.verified).map((m) => m.email), githubLogin: login });
  } catch (err) {
    console.error("[auth] github sign-in failed:", err instanceof Error ? err.message : err);
    return failFlow("github", "GitHub sign-in failed. Try again.");
  }
}
