import { NextResponse } from "next/server";
import { currentHost, currentOrigin, isAdminHost } from "./host";
import { MCP_PATH } from "./oauth";

/**
 * Clients call these endpoints from other origins, some from a browser. They carry no cookies: callers prove
 * who they are with a bearer token, a PKCE verifier or a one-time code, so allowing any origin is safe.
 */
export const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};

export const preflight = () => new NextResponse(null, { status: 204, headers: CORS });

/** The OAuth and MCP endpoints exist only on the admin host, never on a short-link domain. */
export async function notAdminHost(): Promise<NextResponse | null> {
  return isAdminHost(await currentHost()) ? null : new NextResponse("Not found", { status: 404 });
}

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store", ...extra } });
}

export const oauthError = (error: string, description: string, status = 400, extra: Record<string, string> = {}) =>
  json({ error, error_description: description }, status, extra);

export async function mcpResource(): Promise<string> {
  return `${await currentOrigin()}${MCP_PATH}`;
}

/** Where a client learns how to sign in, as named in the WWW-Authenticate header of a 401 (RFC 9728). */
export async function resourceMetadataUrl(): Promise<string> {
  return `${await currentOrigin()}/.well-known/oauth-protected-resource${MCP_PATH}`;
}

/** Reads a request body as text, refusing anything over `max` bytes. */
export async function readLimited(req: Request, max: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > max) return null;
  const text = await req.text();
  return text.length > max ? null : text;
}
