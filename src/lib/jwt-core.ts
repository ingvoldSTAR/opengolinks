// Reading and checking the ID token Microsoft returns from the token endpoint. No imports from this app.
//
// The token arrives straight from Microsoft over TLS in answer to a request that carried our client secret,
// so its signature is not re-checked here (OpenID Connect Core 3.1.3.7 allows this). What is checked are the
// claims that tie it to *this* sign-in and *this* tenant.

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export type MicrosoftExpect = { tenant: string; clientId: string; nonce: string; now?: number };

/**
 * Accepts the token only for our tenant and app, for the nonce we sent, and while unexpired. Returns the
 * addresses it names. They are trusted only because the tenant is fixed: in a directory you administer,
 * people cannot choose their own UPN or mail address.
 */
export function checkMicrosoftClaims(payload: Record<string, unknown> | null, e: MicrosoftExpect): { ok: true; emails: string[]; name: string | null } | { ok: false; reason: string } {
  if (!payload) return { ok: false, reason: "unreadable token" };
  const tenant = e.tenant.toLowerCase();
  if (String(payload.tid ?? "").toLowerCase() !== tenant) return { ok: false, reason: "wrong tenant" };
  if (payload.aud !== e.clientId) return { ok: false, reason: "wrong audience" };
  if (String(payload.iss ?? "").toLowerCase() !== `https://login.microsoftonline.com/${tenant}/v2.0`) return { ok: false, reason: "wrong issuer" };
  if (!payload.nonce || payload.nonce !== e.nonce) return { ok: false, reason: "wrong nonce" };
  const now = e.now ?? Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now - 60) return { ok: false, reason: "expired token" };
  const emails = [payload.email, payload.preferred_username]
    .filter((v): v is string => typeof v === "string" && v.includes("@"))
    .map((v) => v.trim().toLowerCase());
  if (emails.length === 0) return { ok: false, reason: "no email in token" };
  return { ok: true, emails: [...new Set(emails)], name: typeof payload.name === "string" ? payload.name : null };
}
