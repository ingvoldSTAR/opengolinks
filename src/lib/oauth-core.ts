// The pure parts of the OAuth server for the MCP endpoint: token hashing, PKCE and redirect URI rules.
// No imports from this app on purpose, so they can be tested on their own (see tests/oauth-core.test.ts).
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const sha256Hex = (value: string): string => createHash("sha256").update(value).digest("hex");

/** An unguessable value for codes, tokens and client ids. */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");

const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;

/** A PKCE challenge is the base64url of a SHA-256 hash, so it is always 43 characters. */
export const isValidChallenge = (c: string): boolean => /^[A-Za-z0-9\-_]{43}$/.test(c);

/** PKCE with S256: the verifier the client holds must hash to the challenge given when the code was issued. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!VERIFIER.test(verifier)) return false;
  const expected = createHash("sha256").update(verifier).digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
// Schemes that must never be a redirect target, whatever the client claims.
const FORBIDDEN_SCHEMES = new Set(["javascript:", "data:", "file:", "vbscript:", "about:", "blob:", "ftp:", "ws:", "wss:", "http:"]);

export type RedirectCheck = { ok: true; value: string } | { ok: false; error: string };

/**
 * Where a client may be sent back to after sign-in: https, plain http only on the local machine (for tools
 * running there), or an app's own scheme such as claude://. No fragments and no embedded credentials.
 */
export function checkRedirectUri(raw: string): RedirectCheck {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 500) return { ok: false, error: "Redirect URI is missing or too long." };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Redirect URI is not a valid URL." };
  }
  if (url.hash) return { ok: false, error: "Redirect URI must not contain a fragment." };
  if (url.username || url.password) return { ok: false, error: "Redirect URI must not contain credentials." };
  if (url.protocol === "https:") return { ok: true, value: raw };
  if (url.protocol === "http:") {
    return LOOPBACK.has(url.hostname)
      ? { ok: true, value: raw }
      : { ok: false, error: "Redirect URI must use https (plain http is only allowed for localhost)." };
  }
  if (FORBIDDEN_SCHEMES.has(url.protocol) || !/^[a-z][a-z0-9+.-]*:$/.test(url.protocol)) {
    return { ok: false, error: "Redirect URI uses a scheme that is not allowed." };
  }
  return { ok: true, value: raw };
}

/**
 * Whether the redirect URI in a request is one the client registered. An exact match, except that a
 * local http address may use a different port each time (RFC 8252), since tools pick a free one.
 */
export function redirectMatches(registered: string[], requested: string): boolean {
  if (registered.includes(requested)) return true;
  let want: URL;
  try {
    want = new URL(requested);
  } catch {
    return false;
  }
  if (want.protocol !== "http:" || !LOOPBACK.has(want.hostname)) return false;
  return registered.some((r) => {
    try {
      const have = new URL(r);
      return have.protocol === "http:" && have.hostname === want.hostname && have.pathname === want.pathname && have.search === want.search;
    } catch {
      return false;
    }
  });
}

/** Whether a client's `resource` names this server's MCP endpoint, ignoring a trailing slash. */
export function sameResource(given: string, expected: string): boolean {
  const trim = (s: string) => s.replace(/\/+$/, "");
  return trim(given) === trim(expected);
}

/** A client's display name comes from whoever registered it, so it is trimmed and stripped of control characters. */
export function cleanClientName(raw: unknown): string {
  const text = typeof raw === "string" ? raw : "";
  const cleaned = text.replace(/[\u0000-\u001f\u007f<>]/g, "").trim().slice(0, 80);
  return cleaned || "Unnamed app";
}
