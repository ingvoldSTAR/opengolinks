import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { currentHost, currentOrigin, isAdminHost } from "@/lib/host";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "opengolinks_oauth_state"; // keep in sync with callback/route.ts

/** Starts the GitHub sign-in: sets a state cookie and redirects to GitHub. */
export async function GET() {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!isAdminHost(await currentHost()) || !clientId || !process.env.GITHUB_CLIENT_SECRET) {
    return new NextResponse("Not found", { status: 404 });
  }

  const origin = await currentOrigin();
  const state = randomBytes(24).toString("hex");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${origin}/api/auth/github/callback`);
  url.searchParams.set("scope", "user:email");
  url.searchParams.set("state", state);

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/github",
    maxAge: 600,
  });
  return res;
}
