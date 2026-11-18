import { query } from "./db";
import { appTimezone } from "./timezone";
import { randomSlug } from "./validate";
import type { Utm } from "./utm";

export type Domain = {
  id: number;
  host: string;
  root_redirect_url: string | null;
  not_found_url: string | null;
  created_at: Date;
  link_count: number;
  gallery_count: number;
};

export type LinkRow = {
  id: number;
  domain_id: number;
  host: string;
  slug: string;
  destination_url: string;
  title: string | null;
  notes: string | null;
  redirect_code: number;
  created_at: Date;
  updated_at: Date;
  clicks_total: number;
  clicks_7d: number;
} & Utm;

export type CampaignRow = {
  campaign: string;
  links: number;
  clicks_total: number;
  clicks_7d: number;
  clicks_30d: number;
  qr_total: number;
};

export type DayCount = { day: string; n: number };
export type LabelCount = { label: string; n: number };

/* ---------- Domains ---------- */

export async function listDomains(): Promise<Domain[]> {
  return query<Domain>(
    `select d.*, (select count(*)::int from links l where l.domain_id = d.id) as link_count,
            (select count(*)::int from galleries g where g.domain_id = d.id) as gallery_count
       from domains d order by d.host`,
  );
}

export async function findDomain(host: string): Promise<Domain | null> {
  const rows = await query<Domain>(
    `select d.*, 0 as link_count, 0 as gallery_count from domains d where d.host = $1`,
    [host],
  );
  return rows[0] ?? null;
}

export async function createDomain(host: string, rootRedirect: string | null, notFound: string | null): Promise<void> {
  await query(`insert into domains (host, root_redirect_url, not_found_url) values ($1, $2, $3)`, [host, rootRedirect, notFound]);
}

export async function updateDomain(
  id: number,
  rootRedirect: string | null,
  notFound: string | null,
): Promise<void> {
  await query(
    `update domains set root_redirect_url = $2, not_found_url = $3 where id = $1`,
    [id, rootRedirect, notFound],
  );
}

export async function deleteDomain(id: number): Promise<void> {
  await query(`delete from domains where id = $1`, [id]);
}

/* ---------- Links ---------- */

const LINK_SELECT = `
  select l.*, d.host,
    (select count(*)::int from clicks c
       where c.link_id = l.id and c.device <> 'bot') as clicks_total,
    (select count(*)::int from clicks c
       where c.link_id = l.id and c.device <> 'bot'
         and c.clicked_at > now() - interval '7 days') as clicks_7d
  from links l join domains d on d.id = l.domain_id`;

export async function listLinks(search?: string, domainId?: number, campaign?: string): Promise<LinkRow[]> {
  const like = search?.trim() ? `%${search.trim()}%` : null;
  return query<LinkRow>(
    `${LINK_SELECT}
      where ($1::text is null or l.slug ilike $1 or l.title ilike $1 or l.destination_url ilike $1)
        and ($2::int is null or l.domain_id = $2)
        and ($3::text is null or l.utm_campaign = $3)
      order by l.created_at desc
      limit 500`,
    [like, domainId ?? null, campaign ?? null],
  );
}

export async function getLink(id: number): Promise<LinkRow | null> {
  const rows = await query<LinkRow>(`${LINK_SELECT} where l.id = $1`, [id]);
  return rows[0] ?? null;
}

type NewLink = {
  domainId: number;
  slug: string | null;
  destination: string;
  title: string | null;
  notes: string | null;
  redirectCode: number;
  utm: Utm;
};

export class SlugTakenError extends Error {}

export async function createLink(input: NewLink): Promise<number> {
  const attempts = input.slug ? 1 : 8;
  for (let i = 0; i < attempts; i++) {
    const slug = input.slug ?? randomSlug();
    // Links and galleries share the slug space of a domain.
    const gallery = await query(`select 1 from galleries where domain_id = $1 and slug = $2`, [input.domainId, slug]);
    if (gallery.length > 0) {
      if (input.slug) throw new SlugTakenError("That slug is already used by a gallery on this domain.");
      continue;
    }
    const rows = await query<{ id: number }>(
      `insert into links (domain_id, slug, destination_url, title, notes, redirect_code,
                          utm_source, utm_medium, utm_campaign, utm_term, utm_content)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (domain_id, slug) do nothing
       returning id`,
      [
        input.domainId, slug, input.destination, input.title, input.notes, input.redirectCode,
        input.utm.utm_source, input.utm.utm_medium, input.utm.utm_campaign, input.utm.utm_term, input.utm.utm_content,
      ],
    );
    if (rows[0]) return rows[0].id;
  }
  throw new SlugTakenError(input.slug ? "That slug is already in use on this domain." : "Could not generate a free slug.");
}

export async function updateLink(
  id: number,
  fields: { destination: string; title: string | null; notes: string | null; redirectCode: number; utm: Utm },
): Promise<void> {
  await query(
    `update links set destination_url = $2, title = $3, notes = $4, redirect_code = $5,
                      utm_source = $6, utm_medium = $7, utm_campaign = $8, utm_term = $9, utm_content = $10,
                      updated_at = now()
      where id = $1`,
    [
      id, fields.destination, fields.title, fields.notes, fields.redirectCode,
      fields.utm.utm_source, fields.utm.utm_medium, fields.utm.utm_campaign, fields.utm.utm_term, fields.utm.utm_content,
    ],
  );
}

export async function deleteLink(id: number): Promise<void> {
  await query(`delete from links where id = $1`, [id]);
}

/* ---------- Redirect path ---------- */

export type Resolved = { id: number; destination_url: string; redirect_code: number } & Utm;

export async function resolveLink(host: string, slug: string): Promise<Resolved | null> {
  const rows = await query<Resolved>(
    `select l.id, l.destination_url, l.redirect_code,
            l.utm_source, l.utm_medium, l.utm_campaign, l.utm_term, l.utm_content
       from links l join domains d on d.id = l.domain_id
      where d.host = $1 and l.slug = $2`,
    [host, slug],
  );
  return rows[0] ?? null;
}

/* ---------- Clicks ---------- */

export function deviceFromUserAgent(ua: string | null): string {
  if (!ua) return "other";
  if (/bot|crawler|spider|preview|slackbot|facebookexternalhit|whatsapp|telegram|linkedinbot|embedly|curl|wget|headless/i.test(ua)) return "bot";
  if (/ipad|tablet/i.test(ua)) return "tablet";
  if (/mobi|iphone|android/i.test(ua)) return "mobile";
  return "desktop";
}

export function referrerHost(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    return new URL(referrer).host.toLowerCase().replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

export async function recordClick(
  linkId: number,
  info: { referrer: string | null; country: string | null; userAgent: string | null; via?: string | null },
): Promise<void> {
  await query(
    `insert into clicks (link_id, referrer, country, device, via) values ($1, $2, $3, $4, $5)`,
    [linkId, referrerHost(info.referrer), info.country, deviceFromUserAgent(info.userAgent), info.via ?? null],
  );
}

/** Clicks that came from scanning a QR code generated by this app (older printed codes carry no marker). */
export async function qrScanCounts(linkId: number): Promise<{ total: number; d7: number }> {
  const rows = await query<{ total: number; d7: number }>(
    `select count(*)::int as total,
            (count(*) filter (where clicked_at > now() - interval '7 days'))::int as d7
       from clicks where link_id = $1 and via = 'qr' and device <> 'bot'`,
    [linkId],
  );
  return rows[0] ?? { total: 0, d7: 0 };
}

export async function clicksByDay(linkId: number, days = 30): Promise<DayCount[]> {
  return query<DayCount>(
    `select to_char(d.day, 'YYYY-MM-DD') as day, coalesce(c.n, 0)::int as n
       from generate_series(
              (date_trunc('day', now() at time zone $3::text) - ($2::int - 1) * interval '1 day'),
              date_trunc('day', now() at time zone $3::text),
              interval '1 day') as d(day)
       left join (
         select date_trunc('day', clicked_at at time zone $3::text) as day, count(*) as n
           from clicks
          where link_id = $1 and device <> 'bot'
          group by 1
       ) c on c.day = d.day
      order by d.day`,
    [linkId, days, appTimezone()],
  );
}

async function topBy(linkId: number, column: "referrer" | "country" | "device", fallback: string): Promise<LabelCount[]> {
  return query<LabelCount>(
    `select coalesce(${column}, $2) as label, count(*)::int as n
       from clicks where link_id = $1 and device <> 'bot'
      group by 1 order by n desc, label limit 6`,
    [linkId, fallback],
  );
}

export const topReferrers = (id: number) => topBy(id, "referrer", "Direct or QR");
export const topCountries = (id: number) => topBy(id, "country", "Unknown");
export const topDevices = (id: number) => topBy(id, "device", "Unknown");


/* ---------- Campaigns ---------- */

export async function listCampaigns(): Promise<CampaignRow[]> {
  return query<CampaignRow>(
    `select l.utm_campaign as campaign,
            count(distinct l.id)::int as links,
            (count(c.id) filter (where c.device <> 'bot'))::int as clicks_total,
            (count(c.id) filter (where c.device <> 'bot' and c.clicked_at > now() - interval '7 days'))::int as clicks_7d,
            (count(c.id) filter (where c.device <> 'bot' and c.clicked_at > now() - interval '30 days'))::int as clicks_30d,
            (count(c.id) filter (where c.device <> 'bot' and c.via = 'qr'))::int as qr_total
       from links l left join clicks c on c.link_id = l.id
      where l.utm_campaign is not null
      group by l.utm_campaign
      order by clicks_30d desc, l.utm_campaign`,
  );
}

export async function campaignClicksByDay(campaign: string, days = 30): Promise<DayCount[]> {
  return query<DayCount>(
    `select to_char(d.day, 'YYYY-MM-DD') as day, coalesce(c.n, 0)::int as n
       from generate_series(
              (date_trunc('day', now() at time zone $3::text) - ($2::int - 1) * interval '1 day'),
              date_trunc('day', now() at time zone $3::text),
              interval '1 day') as d(day)
       left join (
         select date_trunc('day', c.clicked_at at time zone $3::text) as day, count(*) as n
           from clicks c join links l on l.id = c.link_id
          where l.utm_campaign = $1 and c.device <> 'bot'
          group by 1
       ) c on c.day = d.day
      order by d.day`,
    [campaign, days, appTimezone()],
  );
}

/** Clicks in a campaign grouped by "source / medium", for comparing channels. */
export async function campaignChannels(campaign: string): Promise<LabelCount[]> {
  return query<LabelCount>(
    `select coalesce(l.utm_source, '(no source)') || ' / ' || coalesce(l.utm_medium, '(no medium)') as label,
            count(c.id)::int as n
       from links l left join clicks c on c.link_id = l.id and c.device <> 'bot'
      where l.utm_campaign = $1
      group by 1 order by n desc, label`,
    [campaign],
  );
}
