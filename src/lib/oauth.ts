import { query } from "./db";
import { checkRedirectUri, cleanClientName, isValidChallenge, randomToken, redirectMatches, sameResource, sha256Hex, verifyPkce } from "./oauth-core";
import { getUser, type Role } from "./users";

/**
 * A small OAuth 2.1 authorization server for the MCP endpoint, so Claude and other MCP clients can sign in
 * as a person (through the app's own GitHub login) instead of holding a shared secret.
 *
 * What it supports: dynamic client registration (public clients only), the authorization code flow with
 * PKCE (S256, required), refresh tokens that rotate, and revoking a connection from the admin.
 * Codes and tokens are random, short-lived where it matters, and stored only as SHA-256 hashes.
 */

export const SCOPE = "mcp";
export const MCP_PATH = "/api/mcp";

const CODE_TTL_SECONDS = 120;
const ACCESS_TTL_SECONDS = 3600;
const REFRESH_TTL_DAYS = 30;
const MAX_CLIENTS = 500;
const MAX_REDIRECT_URIS = 5;

export type OAuthClient = { client_id: string; client_name: string; redirect_uris: string[]; created_at: Date };

type ClientRow = { client_id: string; client_name: string; redirect_uris: string; created_at: Date };

function toClient(r: ClientRow): OAuthClient {
  let uris: string[] = [];
  try {
    const parsed = JSON.parse(r.redirect_uris);
    if (Array.isArray(parsed)) uris = parsed.filter((u): u is string => typeof u === "string");
  } catch {
    // an unreadable list means no redirect is allowed
  }
  return { client_id: r.client_id, client_name: r.client_name, redirect_uris: uris, created_at: r.created_at };
}

/* ---------- Clients ---------- */

export async function getClient(clientId: string): Promise<OAuthClient | null> {
  if (!clientId || clientId.length > 100) return null;
  const rows = await query<ClientRow>(`select client_id, client_name, redirect_uris, created_at from oauth_clients where client_id = $1`, [clientId]);
  return rows[0] ? toClient(rows[0]) : null;
}

export type Registered = { ok: true; client: OAuthClient } | { ok: false; error: "invalid_redirect_uri" | "invalid_client_metadata"; description: string };

/** Dynamic client registration (RFC 7591). Anyone can ask, so the list is capped and old unused entries are dropped. */
export async function registerClient(name: unknown, redirectUris: unknown): Promise<Registered> {
  if (!Array.isArray(redirectUris) || redirectUris.length === 0 || redirectUris.length > MAX_REDIRECT_URIS) {
    return { ok: false, error: "invalid_redirect_uri", description: `Provide between 1 and ${MAX_REDIRECT_URIS} redirect URIs.` };
  }
  const uris: string[] = [];
  for (const raw of redirectUris) {
    const checked = checkRedirectUri(String(raw));
    if (!checked.ok) return { ok: false, error: "invalid_redirect_uri", description: checked.error };
    uris.push(checked.value);
  }

  await query(
    `delete from oauth_clients c
      where c.created_at < now() - interval '7 days'
        and not exists (select 1 from oauth_tokens t where t.client_id = c.client_id)`,
  );
  const [{ n }] = await query<{ n: number }>(`select count(*)::int as n from oauth_clients`);
  if (n >= MAX_CLIENTS) return { ok: false, error: "invalid_client_metadata", description: "Too many registered apps. Try again later." };

  const clientName = cleanClientName(name);
  const clientId = randomToken(18);
  const rows = await query<ClientRow>(
    `insert into oauth_clients (client_id, client_name, redirect_uris) values ($1, $2, $3)
     returning client_id, client_name, redirect_uris, created_at`,
    [clientId, clientName, JSON.stringify(uris)],
  );
  return { ok: true, client: toClient(rows[0]) };
}

/* ---------- Authorization request ---------- */

export type AuthRequest = { client: OAuthClient; redirectUri: string; state: string | null; challenge: string; resource: string | null };

export type AuthRequestResult =
  | { ok: true; request: AuthRequest }
  // `redirectTo` is set when the problem can be reported back to the client; otherwise it is shown to the person.
  | { ok: false; error: string; description: string; redirectTo: string | null };

/** Adds query parameters to a redirect URI (a code, or an error), keeping any it already has. */
export function withParams(redirectUri: string, params: Record<string, string | null | undefined>): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  return url.toString();
}

/**
 * Checks an authorization request. The client and redirect URI are checked first, and a request that fails
 * there is never redirected anywhere, since the address cannot be trusted.
 */
export async function parseAuthRequest(get: (name: string) => string | null | undefined, expectedResource: string): Promise<AuthRequestResult> {
  const nowhere = (error: string, description: string): AuthRequestResult => ({ ok: false, error, description, redirectTo: null });

  const client = await getClient(get("client_id") ?? "");
  if (!client) return nowhere("invalid_client", "This app is not registered. Remove the connection and add it again.");
  const redirectUri = get("redirect_uri") ?? "";
  if (!redirectMatches(client.redirect_uris, redirectUri)) return nowhere("invalid_request", "The redirect address does not match the one this app registered.");

  const state = get("state") || null;
  const fail = (error: string, description: string): AuthRequestResult => ({
    ok: false,
    error,
    description,
    redirectTo: withParams(redirectUri, { error, error_description: description, state }),
  });

  if (state && state.length > 512) return fail("invalid_request", "State is too long.");
  if (get("response_type") !== "code") return fail("unsupported_response_type", "Only response_type=code is supported.");
  const challenge = get("code_challenge") ?? "";
  if (!isValidChallenge(challenge) || get("code_challenge_method") !== "S256") {
    return fail("invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }
  const resource = get("resource") || null;
  if (resource && !sameResource(resource, expectedResource)) return fail("invalid_target", "This server only issues tokens for its own MCP endpoint.");
  const scope = get("scope");
  if (scope && !scope.split(" ").every((s) => s === SCOPE)) return fail("invalid_scope", `The only scope is "${SCOPE}".`);

  return { ok: true, request: { client, redirectUri, state, challenge, resource } };
}

/** Issues the one-time code for an approved request. */
export async function createAuthCode(request: AuthRequest, userEmail: string): Promise<string> {
  await query(`delete from oauth_codes where expires_at < now()`);
  const code = randomToken(32);
  await query(
    `insert into oauth_codes (code_hash, client_id, user_email, redirect_uri, code_challenge, resource, expires_at)
     values ($1, $2, $3, $4, $5, $6, now() + ($7::int * interval '1 second'))`,
    [sha256Hex(code), request.client.client_id, userEmail, request.redirectUri, request.challenge, request.resource, CODE_TTL_SECONDS],
  );
  return code;
}

/* ---------- Tokens ---------- */

export type TokenBody = { access_token: string; token_type: "Bearer"; expires_in: number; refresh_token: string; scope: string };
export type TokenResult = { ok: true; body: TokenBody } | { ok: false; error: string; description: string };

const denied = (description: string): TokenResult => ({ ok: false, error: "invalid_grant", description });

async function issueTokens(grantId: string, clientId: string, userEmail: string): Promise<TokenBody> {
  await query(`delete from oauth_tokens where expires_at < now()`);
  const access = randomToken(32);
  const refresh = randomToken(32);
  await query(
    `insert into oauth_tokens (token_hash, kind, grant_id, client_id, user_email, expires_at)
     values ($1, 'access', $3, $4, $5, now() + ($6::int * interval '1 second')),
            ($2, 'refresh', $3, $4, $5, now() + ($7::int * interval '1 day'))`,
    [sha256Hex(access), sha256Hex(refresh), grantId, clientId, userEmail, ACCESS_TTL_SECONDS, REFRESH_TTL_DAYS],
  );
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_SECONDS, refresh_token: refresh, scope: SCOPE };
}

/** Trades a code for tokens. The code is used up first, so a second attempt with it always fails. */
export async function exchangeCode(p: { code: string; clientId: string; redirectUri: string; verifier: string; resource?: string | null }): Promise<TokenResult> {
  const rows = await query<{ client_id: string; user_email: string; redirect_uri: string; code_challenge: string; resource: string | null; fresh: boolean }>(
    `delete from oauth_codes where code_hash = $1
     returning client_id, user_email, redirect_uri, code_challenge, resource, (expires_at > now()) as fresh`,
    [sha256Hex(p.code)],
  );
  const r = rows[0];
  if (!r || !r.fresh) return denied("The code is invalid or has expired.");
  if (r.client_id !== p.clientId) return denied("The code was issued to a different app.");
  if (r.redirect_uri !== p.redirectUri) return denied("The redirect address does not match the request.");
  if (!verifyPkce(p.verifier, r.code_challenge)) return denied("PKCE verification failed.");
  if (p.resource && r.resource && !sameResource(p.resource, r.resource)) return { ok: false, error: "invalid_target", description: "The resource does not match the request." };
  if (!(await getUser(r.user_email))) return denied("This account no longer exists.");
  return { ok: true, body: await issueTokens(randomToken(16), r.client_id, r.user_email) };
}

/** Trades a refresh token for a new pair. The old refresh token and access tokens stop working. */
export async function refreshTokens(p: { refreshToken: string; clientId: string }): Promise<TokenResult> {
  const rows = await query<{ grant_id: string; client_id: string; user_email: string; fresh: boolean }>(
    `delete from oauth_tokens where token_hash = $1 and kind = 'refresh'
     returning grant_id, client_id, user_email, (expires_at > now()) as fresh`,
    [sha256Hex(p.refreshToken)],
  );
  const r = rows[0];
  if (!r || !r.fresh || r.client_id !== p.clientId) return denied("The refresh token is invalid or has expired.");
  if (!(await getUser(r.user_email))) return denied("This account no longer exists.");
  await query(`delete from oauth_tokens where grant_id = $1`, [r.grant_id]);
  return { ok: true, body: await issueTokens(r.grant_id, r.client_id, r.user_email) };
}

export type TokenInfo = { email: string; clientId: string; grantId: string; role: Role };

/** Who an access token belongs to, or null when it is unknown, expired, revoked or its owner was removed. */
export async function verifyAccessToken(token: string): Promise<TokenInfo | null> {
  if (!token || token.length > 200) return null;
  const hash = sha256Hex(token);
  const rows = await query<{ user_email: string; client_id: string; grant_id: string }>(
    `select user_email, client_id, grant_id from oauth_tokens where token_hash = $1 and kind = 'access' and expires_at > now()`,
    [hash],
  );
  const r = rows[0];
  const user = r ? await getUser(r.user_email) : null;
  if (!r || !user) return null;
  await query(`update oauth_tokens set last_used_at = now() where token_hash = $1 and (last_used_at is null or last_used_at < now() - interval '5 minutes')`, [hash]);
  return { email: r.user_email, clientId: r.client_id, grantId: r.grant_id, role: user.role };
}

/* ---------- Connected apps (admin) ---------- */

export type Grant = { grant_id: string; client_name: string; user_email: string; connected_at: Date; last_used_at: Date | null };

export async function listGrants(email?: string): Promise<Grant[]> {
  return query<Grant>(
    `select t.grant_id, c.client_name, t.user_email, min(t.created_at) as connected_at, max(t.last_used_at) as last_used_at
       from oauth_tokens t join oauth_clients c on c.client_id = t.client_id
      where t.expires_at > now() and ($1::text is null or lower(t.user_email) = lower($1))
      group by t.grant_id, c.client_name, t.user_email
      order by min(t.created_at) desc`,
    [email ?? null],
  );
}

export async function revokeGrant(grantId: string): Promise<void> {
  await query(`delete from oauth_tokens where grant_id = $1`, [grantId]);
}
