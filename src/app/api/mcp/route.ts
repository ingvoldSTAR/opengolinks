import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { currentHost, currentOrigin } from "@/lib/host";
import { createMcpServer } from "@/lib/mcp";
import { SCOPE, verifyAccessToken } from "@/lib/oauth";
import { CORS, notAdminHost, preflight, resourceMetadataUrl } from "@/lib/oauth-http";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const withCors = (res: Response): Response => {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  headers.set("Cache-Control", "no-store");
  return new Response(res.body, { status: res.status, headers });
};

const rpcError = (status: number, message: string, headers: Record<string, string> = {}) =>
  withCors(
    new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message }, id: null }), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    }),
  );

/**
 * The MCP endpoint (Streamable HTTP, stateless). Every call needs a bearer token issued by this app's own
 * OAuth server (see lib/oauth.ts), and runs as the person who approved the connection.
 */
export async function POST(req: Request) {
  const hidden = await notAdminHost();
  if (hidden) return hidden;

  const given = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1]?.trim();
  const info = given ? await verifyAccessToken(given) : null;
  if (!info) {
    const metadata = await resourceMetadataUrl();
    return rpcError(401, "Authentication required. Connect this server from your MCP client and sign in.", {
      "WWW-Authenticate": `Bearer resource_metadata="${metadata}"${given ? ', error="invalid_token"' : ""}`,
    });
  }

  const gate = await rateLimit("mcp", 300, 5, info.grantId);
  if (!gate.allowed) return rpcError(429, "Too many requests. Slow down.", { "Retry-After": String(gate.retryAfter) });

  const server = createMcpServer({ email: info.email, origin: await currentOrigin(), host: await currentHost(), role: info.role });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true, maxRequestBodySize: 256_000 });
  try {
    await server.connect(transport);
    const res = await transport.handleRequest(req, { authInfo: { token: "", clientId: info.clientId, scopes: [SCOPE] } });
    return withCors(res);
  } finally {
    await server.close().catch(() => {});
  }
}

// Stateless and no server-sent streams: there is nothing to GET or DELETE.
const methodNotAllowed = async () => {
  const hidden = await notAdminHost();
  return hidden ?? rpcError(405, "Method not allowed. Send MCP messages with POST.", { Allow: "POST, OPTIONS" });
};
export const GET = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = preflight;
