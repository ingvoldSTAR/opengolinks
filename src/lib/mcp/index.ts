import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { APP_NAME, APP_SLUG } from "../brand";
import { registerDomainTools } from "./domains";
import { registerLinkTools } from "./links";
import { registerQrTools } from "./qr";
import type { Ctx } from "./util";

const INSTRUCTIONS = `${APP_NAME} is a self-hosted link shortener for a team's domains: short links, QR codes that count scans apart from clicks, campaign (UTM) reporting, and link-in-bio galleries.

Every link lives on a domain (see list_domains). Admins can also add domains; members cannot. Find a link with search_links before changing it. A printed link or QR code must keep working, so a link's domain and slug never change: change its destination instead. These tools cannot delete anything.

QR colours: before calling set_qr_colours, ask the person whether the colours should apply to every QR code on that domain, and ask again each time colours change. Keep the code dark on a light background so phones can scan it.`;

/** One MCP server per request (stateless), acting for the signed-in person in ctx. */
export function createMcpServer(ctx: Ctx): McpServer {
  const server = new McpServer({ name: APP_SLUG, version: "1.0.0" }, { instructions: INSTRUCTIONS });
  registerLinkTools(server, ctx);
  registerQrTools(server, ctx);
  registerDomainTools(server, ctx);
  return server;
}
