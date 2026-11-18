import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "node:crypto";
import { currentHost, isAdminHost } from "./host";
import { userExists } from "./users";

const COOKIE = "go_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

// Used only outside production, where a missing SESSION_SECRET is allowed with a warning at startup.
const DEV_SECRET = "development-only-session-secret-do-not-use";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV !== "production") return DEV_SECRET;
  throw new Error("SESSION_SECRET is not set.");
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHmac("sha256", "cmp").update(a).digest();
  const hb = createHmac("sha256", "cmp").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkPassword(input: string): boolean {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return false;
  return safeEqual(input, pw);
}

/**
 * Cookie value is `<expiry ms>.<sig>` for a password session, or
 * `<expiry ms>.<base64url email>.<sig>` for a user session; the signature covers everything before it.
 */
export async function startSession(email?: string): Promise<void> {
  const expires = String(Date.now() + MAX_AGE_SECONDS * 1000);
  const payload = email ? `${expires}.${Buffer.from(email).toString("base64url")}` : expires;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** Email of the signed-in user, "" for a password session, null when not signed in. */
export async function sessionIdentity(): Promise<string | null> {
  if (!isAdminHost(await currentHost())) return null;
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2 && parts.length !== 3) return null;
  const signature = parts[parts.length - 1];
  const payload = parts.slice(0, -1).join(".");
  if (!safeEqual(signature, sign(payload))) return null;
  if (!(Number(parts[0]) > Date.now())) return null;
  if (parts.length === 2) return "";
  const email = Buffer.from(parts[1], "base64url").toString();
  // Deleting a user row ends their sessions.
  return (await userExists(email)) ? email : null;
}

export async function isAdmin(): Promise<boolean> {
  return (await sessionIdentity()) !== null;
}

/** Call at the top of every admin page and server action. */
export async function requireAdmin(): Promise<void> {
  if (!isAdminHost(await currentHost())) notFound();
  if (!(await isAdmin())) redirect("/admin/login");
}
