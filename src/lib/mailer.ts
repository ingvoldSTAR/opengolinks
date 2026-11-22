import { decodeJwtPayload } from "./jwt-core";
import { describeMicrosoftError } from "./ms-error";
import { endpoints, microsoft, providerConfigured } from "./providers";

/**
 * Sends email through the Microsoft Graph API as one mailbox (MAIL_FROM), using the same Entra app registration
 * as Microsoft sign-in. The app needs the Mail.Send *application* permission with admin consent; limit it to
 * that one mailbox in Exchange so it cannot send as anyone else. No mailbox password is stored anywhere.
 */
export const mailFrom = (): string => process.env.MAIL_FROM?.trim() ?? "";

export const mailConfigured = (): boolean => providerConfigured("microsoft") && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mailFrom());

let cached: { token: string; expires: number } | null = null;

async function graphToken(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const m = microsoft();
  const res = await fetch(`${endpoints().microsoftLogin}/${encodeURIComponent(m.tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: m.clientId, client_secret: m.clientSecret, scope: "https://graph.microsoft.com/.default" }),
    signal: AbortSignal.timeout(15_000),
    redirect: "error",
  });
  const data = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: string; error_description?: string } | null;
  if (!res.ok || !data?.access_token) {
    const why = describeMicrosoftError(data);
    throw new Error(`Microsoft did not give the app a token${why ? ` (Microsoft said: ${why})` : ""}. Check MICROSOFT_CLIENT_SECRET (the secret's Value, not its ID) and the tenant.`);
  }
  cached = { token: data.access_token, expires: Date.now() + (data.expires_in ?? 3000) * 1000 };
  return cached.token;
}

export type Sent = { ok: true } | { ok: false; reason: string };

/** Sends one email. Never throws, and the reason it returns never contains a secret. */
export async function sendMail(m: { to: string; subject: string; text: string; html: string }): Promise<Sent> {
  if (!mailConfigured()) return { ok: false, reason: "Email is not set up (MAIL_FROM and the Microsoft settings)." };
  try {
    const token = await graphToken();
    const res = await fetch(`${endpoints().microsoftGraph}/v1.0/users/${encodeURIComponent(mailFrom())}/sendMail`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: { subject: m.subject, body: { contentType: "HTML", content: m.html }, toRecipients: [{ emailAddress: { address: m.to } }] },
        saveToSentItems: false,
      }),
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (res.status === 202 || res.ok) return { ok: true };
    const err = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    const detail = [err?.error?.code, err?.error?.message].filter((s) => typeof s === "string").join(": ").slice(0, 200);
    if (res.status === 403 || res.status === 401) {
      // Permissions reach a token only when it is issued, so forget this one: the next attempt asks for a fresh token.
      cached = null;
      // Which permissions the token carries is not secret, and tells "the app lacks the permission" from "the mailbox is off limits".
      const roles = decodeJwtPayload(token)?.roles;
      const hasSend = Array.isArray(roles) && roles.includes("Mail.Send");
      const why = hasSend
        ? `The app's token does include Mail.Send, so something else is denying it: an application access policy that does not include this mailbox, or the mailbox does not exist in Exchange Online.`
        : `The app's token does not include the Mail.Send permission. Check that it is an Application permission (not Delegated) with admin consent granted, and try again in a few minutes: a permission only reaches a token once it is issued.`;
      return { ok: false, reason: `Microsoft refused to send as ${mailFrom()} (${res.status}). ${why}${detail ? ` Microsoft said: ${detail}` : ""}` };
    }
    return { ok: false, reason: `Microsoft returned ${res.status}${detail ? `: ${detail}` : "."}` };
  } catch (e) {
    return { ok: false, reason: e instanceof Error && e.message.startsWith("Microsoft did not") ? e.message : "Could not reach Microsoft to send the email." };
  }
}
