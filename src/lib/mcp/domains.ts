import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { cnameTarget, inspectDomain, type DomainCheck, type DomainStatus } from "../domainStatus";
import { addDomainWithDefaults } from "../domainSetup";
import { SlugTakenError, listDomains, markDomainLive } from "../links";
import { createGallery, listGalleries } from "../galleries";
import { shortUrl } from "../url";
import { parseSlug, randomSlug } from "../validate";
import { ADDS, EXTERNAL, READS, defineTool, domainByHost, fail, ok, unknownDomain, type Ctx } from "./util";

const STATUS_TEXT: Record<DomainStatus, string> = {
  live: "live: the domain reaches this app",
  "dns-missing": "no DNS answer yet",
  "needs-connect": "DNS answers, but this server could not confirm the domain reaches the app. That does not always mean visitors cannot: a server often cannot reach its own public addresses. Open the domain in a browser to be sure",
  unchecked: "not checked (a local address)",
};

/** What a status means. */
function meaning(status: DomainStatus, check?: DomainCheck): string {
  if (status === "needs-connect" && check?.addresses.length) {
    return "This server could not confirm the domain reaches the app, but that proves little: a server often cannot reach its own public addresses, and with an ALIAS or flattened CNAME record the addresses it sees can differ from what visitors get. Ask the person to open the domain in a browser. Only if it fails there too, check at the hosting provider that the domain is still attached to this app and that its certificate is valid";
  }
  if (status === "dns-missing") return "no DNS answer yet: a DNS record (usually a CNAME) must point the domain at this app, and the domain must be attached to the app at the hosting provider";
  return STATUS_TEXT[status];
}

/** The steps still to do for a newly added domain. */
export function nextSteps(host: string, cname: string): string[] {
  const name = host.split(".").length > 2 ? host.split(".")[0] : "@";
  return [
    `At the DNS provider for this domain, create a CNAME record: name "${name}", value "${cname}". (A domain with no subdomain usually needs an ALIAS or ANAME record instead, or use a subdomain such as go.)`,
    "At the hosting provider, attach the domain to this app (often called a custom domain, alias or parked domain) so requests reach the app and it gets a certificate. The README's deployment guide has the steps for common hosts.",
    "Run check_domain_status to see when it is live.",
  ];
}

export function registerDomainTools(server: McpServer, ctx: Ctx): void {
  defineTool(
    server,
    "list_domains",
    {
      title: "List domains",
      description: "The domains this app serves short links and galleries on, with how many of each, and where visitors go when there is no matching short link.",
      inputSchema: {},
      annotations: READS,
    },
    async () => {
      const rows = await listDomains();
      return ok(
        rows.map((d) => ({
          id: d.id,
          host: d.host,
          links: d.link_count,
          galleries: d.gallery_count,
          live_since: d.went_live_at,
          visitors_to_the_root_go_to: d.root_redirect_url,
          visitors_with_a_wrong_link_go_to: d.not_found_url,
        })),
      );
    },
  );

  // Adding a domain is for admins; members can still list domains and check their status.
  if (ctx.role === "admin") {
    defineTool(
      server,
      "add_domain",
      {
        title: "Add a domain",
        description:
          "Adds a domain to the app. Visitors with no valid short link are sent to the main website (go.example.com goes to example.com), and the brand icon is fetched from it. It does not change DNS or hosting: the result lists what is left to do (a DNS record at the DNS provider, then attaching the domain to the app at the hosting provider). check_domain_status shows when it is live.",
        inputSchema: { host: z.string().max(253).describe("Just the domain, such as go.example.com. Use a subdomain.") },
        annotations: ADDS,
      },
      async ({ host }) => {
        const added = await addDomainWithDefaults(host);
        if (!added.ok) return fail(added.error);
        return ok({
          added: added.host,
          visitors_with_no_valid_link_go_to: added.home ?? "a 404 page (it is already the main domain)",
          next_steps: nextSteps(added.host, cnameTarget(ctx.host)),
        });
      },
    );
  }

  defineTool(
    server,
    "check_domain_status",
    {
      title: "Check whether a domain is live",
      description: "Looks up the domain's DNS and tries to reach the domain FROM THE SERVER, to say whether it is live and what is left to do. A failure here does not always mean visitors cannot reach it (the server often cannot reach its own public addresses), so ask the person to open the domain in a browser before concluding anything. Give a domain, or leave it out to check every domain.",
      inputSchema: { host: z.string().max(253).optional().describe("One domain. Leave out to check all of them.") },
      annotations: EXTERNAL(READS),
    },
    async ({ host }) => {
      const all = await listDomains();
      const chosen = host ? all.filter((d) => d.host === host.trim().toLowerCase()) : all;
      if (host && chosen.length === 0) return unknownDomain(host);
      const results = await Promise.all(
        chosen.map(async (d) => {
          const check = await inspectDomain(d.host, { fresh: true });
          const status = check.status;
          if (status === "live" || status === "unchecked") await markDomainLive(d.id);
          return {
            host: d.host,
            status,
            meaning: meaning(status, check),
            what_was_seen: check.addresses.map((a) => `${a.ip}: ${a.reason}`),
          };
        }),
      );
      return ok(results);
    },
  );

  defineTool(
    server,
    "list_galleries",
    {
      title: "List galleries",
      description: "Link-in-bio gallery pages, with their address, whether they are published, and views and clicks.",
      inputSchema: {},
      annotations: READS,
    },
    async () => {
      const rows = await listGalleries();
      return ok(
        rows.map((g) => ({
          id: g.id,
          title: g.title,
          url: shortUrl(g.host, g.slug),
          published: g.published,
          items: g.item_count,
          views: g.views_total,
          clicks: g.clicks_total,
          admin_page: `${ctx.origin}/admin/galleries/${g.id}`,
        })),
      );
    },
  );

  defineTool(
    server,
    "create_gallery",
    {
      title: "Create a gallery",
      description: "Creates an empty link-in-bio gallery on a domain. It is published straight away, like one made in the admin, so it is visible at its address while still empty. Add its buttons, images and theme in the admin page returned here.",
      inputSchema: {
        domain: z.string().max(253).describe("The domain to create it on. See list_domains."),
        title: z.string().min(1).max(80),
        slug: z.string().max(64).optional().describe("The path after the domain. Random when left out."),
      },
      annotations: ADDS,
    },
    async ({ domain, title, slug }) => {
      const d = await domainByHost(domain);
      if (!d) return unknownDomain(domain);
      let chosen = randomSlug();
      if (slug) {
        const parsed = parseSlug(slug);
        if (!parsed.ok) return fail(parsed.error);
        chosen = parsed.value;
      }
      try {
        const id = await createGallery({ domainId: d.id, slug: chosen, title: title.trim() });
        return ok({ id, url: shortUrl(d.host, chosen), admin_page: `${ctx.origin}/admin/galleries/${id}` });
      } catch (e) {
        if (e instanceof SlugTakenError) return fail(e.message);
        throw e;
      }
    },
  );
}
