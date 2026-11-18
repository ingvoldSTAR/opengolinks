import { NextResponse, type NextRequest } from "next/server";
import { startSession } from "@/lib/auth";
import { currentHost, currentOrigin, isAdminHost } from "@/lib/host";
import { matchUser } from "@/lib/users";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "opengolinks_oauth_state";

async function fail(message: string) {
  const url = new URL("/admin/login", await currentOrigin());
  url.searchParams.set("error", message);
  const res = NextResponse.redirect(url);
  res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth/github" });
  return res;
}

const ghHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "opengolinks",
});

export async function GET(req: NextRequest) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!isAdminHost(await currentHost()) || !clientId || !clientSecret) {
    return new NextResponse("Not found", { status: 404 });
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expected = req.cookies.get(STATE_COOKIE)?.value;
  if (!code || !state || !expected || state !== expected) {
    return fail("GitHub sign-in expired or was invalid. Try again.");
  }

  try {
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "opengolinks" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${await currentOrigin()}/api/auth/github/callback`,
      }),
    });
    const { access_token: token } = (await tokenRes.json()) as { access_token?: string };
    if (!token) return fail("GitHub did not accept the sign-in. Try again.");

    const [userRes, emailsRes] = await Promise.all([
      fetch("https://api.github.com/user", { headers: ghHeaders(token) }),
      fetch("https://api.github.com/user/emails", { headers: ghHeaders(token) }),
    ]);
    if (!userRes.ok || !emailsRes.ok) return fail("Could not read your GitHub profile.");
    const { login } = (await userRes.json()) as { login: string };
    const emails = (await emailsRes.json()) as { email: string; verified: boolean }[];

    // Only verified addresses count, otherwise anyone could add someone else's email to GitHub.
    const email = await matchUser(
      emails.filter((e) => e.verified).map((e) => e.email),
      login,
    );
    if (!email) return fail("No account for this GitHub user. Ask an admin to add your verified email.");

    await startSession(email);
    const res = NextResponse.redirect(new URL("/admin", await currentOrigin()));
    res.cookies.delete({ name: STATE_COOKIE, path: "/api/auth/github" });
    return res;
  } catch (err) {
    console.error("[auth] github sign-in failed:", err);
    return fail("GitHub sign-in failed. Try again.");
  }
}
