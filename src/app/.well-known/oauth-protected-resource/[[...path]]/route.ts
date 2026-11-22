import { APP_NAME } from "@/lib/brand";
import { currentOrigin } from "@/lib/host";
import { SCOPE } from "@/lib/oauth";
import { json, mcpResource, notAdminHost, preflight } from "@/lib/oauth-http";

export const dynamic = "force-dynamic";

/** Tells an MCP client which server issues tokens for the MCP endpoint (RFC 9728). Served at the root and at the endpoint's own path. */
export async function GET() {
  const hidden = await notAdminHost();
  if (hidden) return hidden;
  return json({
    resource: await mcpResource(),
    authorization_servers: [await currentOrigin()],
    bearer_methods_supported: ["header"],
    scopes_supported: [SCOPE],
    resource_name: APP_NAME,
  });
}

export const OPTIONS = preflight;
