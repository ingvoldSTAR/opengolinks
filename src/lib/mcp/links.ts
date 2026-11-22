import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  SlugTakenError,
  clicksByDay,
  createLink,
  getLink,
  getLinkByAddress,
  listCampaigns,
  listLinks,
  qrScanCounts,
  topCountries,
  topDevices,
  topReferrers,
  updateLink,
} from "../links";
import { UTM_KEYS, cleanUtmValue, type Utm } from "../utm";
import { parseHostInput, parseSlug, parseUrl } from "../validate";
import { ADDS, CHANGES, READS, defineTool, domainByHost, fail, linkSummary, ok, unknownDomain, type Ctx } from "./util";

const utmShape = {
  utm_source: z.string().max(100).nullable().optional().describe("Where the visit comes from, such as newsletter or linkedin."),
  utm_medium: z.string().max(100).nullable().optional().describe("The channel, such as email, social, paid-social, qr or print."),
  utm_campaign: z.string().max(100).nullable().optional().describe("The initiative this link belongs to. Links sharing a campaign are reported together."),
  utm_term: z.string().max(100).nullable().optional().describe("Paid search keyword."),
  utm_content: z.string().max(100).nullable().optional().describe("Tells two versions apart, such as banner or text-link."),
};

export function registerLinkTools(server: McpServer, ctx: Ctx): void {
  defineTool(
    server,
    "search_links",
    {
      title: "Search links",
      description:
        "Find short links by words in the slug, title or destination, optionally limited to one domain or one campaign. Returns the newest first, with clicks. Use it to find a link before reading or changing it.",
      inputSchema: {
        query: z.string().max(200).optional().describe("Words to look for in the slug, title or destination."),
        domain: z.string().max(253).optional().describe("Only links on this domain, for example go.example.com."),
        campaign: z.string().max(100).optional().describe("Only links with this exact utm_campaign."),
        limit: z.number().int().min(1).max(100).default(25).describe("How many to return."),
      },
      annotations: READS,
    },
    async ({ query, domain, campaign, limit }) => {
      let domainId: number | undefined;
      if (domain) {
        const d = await domainByHost(domain);
        if (!d) return unknownDomain(domain);
        domainId = d.id;
      }
      const rows = await listLinks(query, domainId, campaign);
      return ok({ count: rows.length, shown: Math.min(rows.length, limit), links: rows.slice(0, limit).map((l) => linkSummary(l, ctx.origin)) });
    },
  );

  defineTool(
    server,
    "get_link",
    {
      title: "Get a link with its statistics",
      description:
        "One link with its settings and results: clicks per day for 30 days, QR scans, and the top referrers, countries and devices. Give the id, or the domain and slug.",
      inputSchema: {
        id: z.number().int().positive().optional().describe("The link's id."),
        domain: z.string().max(253).optional().describe("The link's domain, with slug."),
        slug: z.string().max(64).optional().describe("The link's slug, with domain."),
      },
      annotations: READS,
    },
    async ({ id, domain, slug }) => {
      let link = null;
      if (id) link = await getLink(id);
      else if (domain && slug) {
        const host = parseHostInput(domain);
        link = host.ok ? await getLinkByAddress(host.value, slug.trim().toLowerCase()) : null;
      } else return fail("Give either id, or both domain and slug.");
      if (!link) return fail("No such link.");
      const [days, referrers, countries, devices, scans] = await Promise.all([
        clicksByDay(link.id),
        topReferrers(link.id),
        topCountries(link.id),
        topDevices(link.id),
        qrScanCounts(link.id),
      ]);
      return ok({
        ...linkSummary(link, ctx.origin),
        qr_scans: scans,
        clicks_by_day_last_30_days: days,
        top_referrers: referrers,
        top_countries: countries,
        top_devices: devices,
        note: "Bots and link preview crawlers are not counted. Days follow the app's time zone.",
      });
    },
  );

  defineTool(
    server,
    "list_campaigns",
    {
      title: "List campaigns",
      description: "Campaign totals: for every utm_campaign, how many links it has and its clicks in total, over 7 and 30 days, and QR scans.",
      inputSchema: {},
      annotations: READS,
    },
    async () => ok(await listCampaigns()),
  );

  defineTool(
    server,
    "create_link",
    {
      title: "Create a short link",
      description:
        "Creates a short link on one of the app's domains. Leave the slug out for a random one. UTM values are added to the destination when someone follows the link, so a printed link or QR code never needs to change. Returns the short URL; use get_qr_code for its QR code.",
      inputSchema: {
        domain: z.string().max(253).describe("The domain to create it on, for example go.example.com. See list_domains."),
        destination: z.string().max(2000).describe("The full address visitors are sent to, starting with https://."),
        slug: z.string().max(64).optional().describe("The path after the domain: letters, numbers, hyphens and underscores. Random when left out."),
        title: z.string().max(200).optional().describe("A label for finding the link later."),
        notes: z.string().max(2000).optional(),
        redirect_code: z.union([z.literal(301), z.literal(302)]).default(302).describe("302 (default) can be changed at any time. 301 is cached by browsers."),
        ...utmShape,
      },
      annotations: ADDS,
    },
    async (a) => {
      const domain = await domainByHost(a.domain);
      if (!domain) return unknownDomain(a.domain);
      const dest = parseUrl(a.destination);
      if (!dest.ok) return fail(dest.error);
      let slug: string | null = null;
      if (a.slug) {
        const parsed = parseSlug(a.slug);
        if (!parsed.ok) return fail(parsed.error);
        slug = parsed.value;
      }
      const utm = Object.fromEntries(UTM_KEYS.map((k) => [k, cleanUtmValue(a[k])])) as Utm;
      let id: number;
      try {
        id = await createLink({ domainId: domain.id, slug, destination: dest.value, title: a.title?.trim() || null, notes: a.notes?.trim() || null, redirectCode: a.redirect_code, utm });
      } catch (e) {
        if (e instanceof SlugTakenError) return fail(e.message);
        throw e;
      }
      const link = await getLink(id);
      return ok({ created: link ? linkSummary(link, ctx.origin) : { id } });
    },
  );

  defineTool(
    server,
    "update_link",
    {
      title: "Change a link",
      description:
        "Changes a link's destination, title, notes, redirect type or UTM values. Only the fields you give are changed; pass null to clear a title, note or UTM value. The domain and slug cannot change, so printed QR codes keep working. This takes effect immediately for everyone who follows the link.",
      inputSchema: {
        id: z.number().int().positive().describe("The link's id. Find it with search_links."),
        destination: z.string().max(2000).optional(),
        title: z.string().max(200).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
        redirect_code: z.union([z.literal(301), z.literal(302)]).optional(),
        ...utmShape,
      },
      annotations: CHANGES,
    },
    async (a) => {
      const current = await getLink(a.id);
      if (!current) return fail("No such link.");
      let destination = current.destination_url;
      if (a.destination !== undefined) {
        const dest = parseUrl(a.destination);
        if (!dest.ok) return fail(dest.error);
        destination = dest.value;
      }
      const utm = Object.fromEntries(UTM_KEYS.map((k) => [k, a[k] === undefined ? current[k] : cleanUtmValue(a[k])])) as Utm;
      const changed =
        a.destination !== undefined || a.title !== undefined || a.notes !== undefined || a.redirect_code !== undefined || UTM_KEYS.some((k) => a[k] !== undefined);
      if (!changed) return fail("Nothing to change. Give at least one field.");
      await updateLink(a.id, {
        destination,
        title: a.title === undefined ? current.title : a.title?.trim() || null,
        notes: a.notes === undefined ? current.notes : a.notes?.trim() || null,
        redirectCode: a.redirect_code ?? (current.redirect_code === 301 ? 301 : 302),
        utm,
      });
      const link = await getLink(a.id);
      return ok({ updated: link ? linkSummary(link, ctx.origin) : { id: a.id } });
    },
  );
}
