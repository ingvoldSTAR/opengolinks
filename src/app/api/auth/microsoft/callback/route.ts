import type { NextRequest } from "next/server";
import { checkMicrosoftClaims, decodeJwtPayload } from "@/lib/jwt-core";
import { describeMicrosoftError } from "@/lib/ms-error";
import { endpoints, microsoft } from "@/lib/providers";
import { failFlow, finishFlow, readCallback } from "@/lib/signin-flow";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const started = await readCallback(req, "microsoft");
  if (!started.ok) return started.res;
  const { code, verifier, nonce, redirectUri } = started.cb;
  const m = microsoft();

  try {
    const tokenRes = await fetch(`${endpoints().microsoftLogin}/${encodeURIComponent(m.tenant)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: m.clientId,
        client_secret: m.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
        scope: "openid profile email",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const reply = (await tokenRes.json().catch(() => ({}))) as { id_token?: string; error?: string; error_description?: string };
    const idToken = reply.id_token;
    if (!idToken) {
      // For whoever reads the server log: Microsoft's own reason, which holds no secret.
      console.error("[auth] microsoft token request failed:", describeMicrosoftError(reply) || tokenRes.status);
      return failFlow("microsoft", "Microsoft did not accept the sign-in. Try again, and ask an admin to check the server log if it keeps happening.");
    }

    // Only people in this one tenant can sign in, so the addresses in the token are the directory's own.
    const claims = checkMicrosoftClaims(decodeJwtPayload(idToken), { tenant: m.tenant, clientId: m.clientId, nonce });
    if (!claims.ok) {
      console.error("[auth] microsoft sign-in refused:", claims.reason);
      return failFlow("microsoft", "Microsoft sign-in could not be checked. Try again, and make sure you use your work account.");
    }
    return finishFlow(req, "microsoft", { verifiedEmails: claims.emails });
  } catch (err) {
    console.error("[auth] microsoft sign-in failed:", err instanceof Error ? err.message : err);
    return failFlow("microsoft", "Microsoft sign-in failed. Try again.");
  }
}
