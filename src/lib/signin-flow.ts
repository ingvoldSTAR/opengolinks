import { createHash, randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { startSession } from "./auth";
import { currentHost, currentOrigin, isAdminHost } from "./host";
import { safeNext } from "./nav";
import { providerConfigured, type ProviderId } from "./providers";
import { completeSignIn } from "./signin";

/**
 * The browser side of "Continue with GitHub / Microsoft / Google": a redirect out with a state (and PKCE and a
 * nonce), and a callback that checks them, asks the provider who this is, and starts a session. The cookies that
 * remember a sign-in in progress are short-lived and httpOnly.
 */
const NEXT = "opengolinks_oauth_next";
const INVITE = "opengolinks_oauth_invite";
const cookie = (path: string) => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path, maxAge: 600 });
const stateCookie = (p: ProviderId) => `opengolinks_state_${p}`;
const callbackPath = (p: ProviderId) => `/api/auth/${p}`;

const INVITE_TOKEN = /^[A-Za-z0-9_-]{20,100}$/;

/** 404 unless this is the admin host and the provider is configured. */
export async function guardProvider(p: ProviderId): Promise<NextResponse | null> {
  return isAdminHost(await currentHost()) && providerConfigured(p) ? null : new NextResponse("Not found", { status: 404 });
}

export type FlowStart = { redirectUri: string; state: string; challenge: string; nonce: string };

/** Starts a sign-in: remembers state, PKCE verifier and nonce, plus where to go afterwards and any invitation. */
export async function startFlow(req: NextRequest, p: ProviderId, build: (s: FlowStart) => URL): Promise<NextResponse> {
  const hidden = await guardProvider(p);
  if (hidden) return hidden;
  const origin = await currentOrigin();
  const state = randomBytes(24).toString("hex");
  const verifier = randomBytes(32).toString("base64url");
  const nonce = randomBytes(16).toString("hex");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const res = NextResponse.redirect(build({ redirectUri: `${origin}/api/auth/${p}/callback`, state, challenge, nonce }));
  res.cookies.set(stateCookie(p), `${state}.${verifier}.${nonce}`, cookie(callbackPath(p)));
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  if (next) res.cookies.set(NEXT, next, cookie("/api/auth"));
  const invite = req.nextUrl.searchParams.get("invite");
  if (invite && INVITE_TOKEN.test(invite)) res.cookies.set(INVITE, invite, cookie("/api/auth"));
  return res;
}

export type FlowCallback = { code: string; verifier: string; nonce: string; redirectUri: string };

function clear(res: NextResponse, p: ProviderId): NextResponse {
  res.cookies.delete({ name: stateCookie(p), path: callbackPath(p) });
  res.cookies.delete({ name: NEXT, path: "/api/auth" });
  res.cookies.delete({ name: INVITE, path: "/api/auth" });
  return res;
}

export async function failFlow(p: ProviderId, message: string): Promise<NextResponse> {
  const url = new URL("/admin/login", await currentOrigin());
  url.searchParams.set("error", message);
  return clear(NextResponse.redirect(url), p);
}

/** Checks the callback against what startFlow remembered. Returns the pieces to finish with, or an error response. */
export async function readCallback(req: NextRequest, p: ProviderId): Promise<{ ok: true; cb: FlowCallback } | { ok: false; res: NextResponse }> {
  const hidden = await guardProvider(p);
  if (hidden) return { ok: false, res: hidden };
  if (req.nextUrl.searchParams.get("error")) return { ok: false, res: await failFlow(p, "Sign-in was cancelled or refused.") };
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const [expected, verifier, nonce] = (req.cookies.get(stateCookie(p))?.value ?? "").split(".");
  if (!code || !state || !expected || !verifier || !nonce || state !== expected) {
    return { ok: false, res: await failFlow(p, "Sign-in expired or was invalid. Try again.") };
  }
  return { ok: true, cb: { code, verifier, nonce, redirectUri: `${await currentOrigin()}/api/auth/${p}/callback` } };
}

/** Turns the provider's VERIFIED addresses into a session (accepting an invitation if one was carried through). */
export async function finishFlow(req: NextRequest, p: ProviderId, who: { verifiedEmails: string[]; githubLogin?: string | null }): Promise<NextResponse> {
  const invite = req.cookies.get(INVITE)?.value;
  const result = await completeSignIn({ ...who, inviteToken: invite && INVITE_TOKEN.test(invite) ? invite : null });
  if (!result.ok) return failFlow(p, result.message);
  await startSession(result.email);
  const next = safeNext(req.cookies.get(NEXT)?.value) ?? "/admin";
  return clear(NextResponse.redirect(new URL(next, await currentOrigin())), p);
}
