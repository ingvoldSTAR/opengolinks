import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import { findDomain, type Domain, type LinkRow } from "../links";
import { shortUrl } from "../url";
import type { Role } from "../users";
import { UTM_KEYS, withUtm } from "../utm";
import { parseHostInput } from "../validate";

/** Who is calling and where the app lives, for the tools that build links back to the admin. */
export type Ctx = { email: string; origin: string; host: string; role: Role };

export const ok = (data: unknown): CallToolResult => ({ content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }] });
export const fail = (message: string): CallToolResult => ({ isError: true, content: [{ type: "text", text: message }] });

/** Annotations tell the client which tools only read, which add something, and which overwrite existing data. */
export const READS: ToolAnnotations = { readOnlyHint: true, openWorldHint: false };
export const ADDS: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
export const CHANGES: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };
export const EXTERNAL = (a: ToolAnnotations): ToolAnnotations => ({ ...a, openWorldHint: true });

/**
 * Registers a tool whose handler can throw: the error is logged and reported without details, so internals never
 * reach the client.
 */
export function defineTool<S extends z.ZodRawShape>(
  server: McpServer,
  name: string,
  config: { title: string; description: string; inputSchema: S; annotations: ToolAnnotations },
  handler: (args: z.infer<z.ZodObject<S>>) => Promise<CallToolResult>,
): void {
  const wrapped = async (args: z.infer<z.ZodObject<S>>): Promise<CallToolResult> => {
    try {
      return await handler(args);
    } catch (e) {
      console.error(`[mcp] ${name} failed:`, e instanceof Error ? e.message : e);
      return fail("Something went wrong on the server. Try again, and check the server log if it keeps happening.");
    }
  };
  server.registerTool(name, config, wrapped as never);
}

/** A domain from the name a person typed, or null when it is malformed or not added to this app. */
export async function domainByHost(host: string): Promise<Domain | null> {
  const parsed = parseHostInput(host);
  return parsed.ok ? findDomain(parsed.value) : null;
}

export const unknownDomain = (host: string): CallToolResult =>
  fail(`"${host}" is not a domain in this app. Use list_domains to see the domains, or add_domain to add it.`);

export function linkSummary(l: LinkRow, origin: string) {
  const utm = Object.fromEntries(UTM_KEYS.filter((k) => l[k]).map((k) => [k, l[k]]));
  return {
    id: l.id,
    short_url: shortUrl(l.host, l.slug),
    destination_url: l.destination_url,
    final_destination: withUtm(l.destination_url, l),
    title: l.title,
    notes: l.notes,
    redirect_code: l.redirect_code,
    utm,
    clicks_total: l.clicks_total,
    clicks_7d: l.clicks_7d,
    created_at: l.created_at,
    admin_page: `${origin}/admin/links/${l.id}`,
  };
}
