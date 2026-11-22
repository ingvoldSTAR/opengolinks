import { query } from "./db";
import { appTimezone } from "./timezone";
import { GALLERY_MARKER } from "./import";
import { randomSlug } from "./validate";
import type { Utm } from "./utm";

export type Domain = {
  id: number;
  host: string;
  root_redirect_url: string | null;
  not_found_url: string | null;
  created_at: Date;
  has_icon: boolean;
  favicon_checked_at: Date | null;
  went_live_at: Date | null;
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
  has_icon: boolean;
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

// Not d.*: the icon bytes stay out of ordinary queries.
const DOMAIN_COLUMNS = `d.id, d.host, d.root_redirect_url, d.not_found_url, d.created_at,
  (d.favicon_data is not null) as has_icon, d.favicon_checked_at, d.went_live_at`;

export async function listDomains(): Promise<Domain[]> {
  return query<Domain>(
    `select ${DOMAIN_COLUMNS}, (select count(*)::int from links l where l.domain_id = d.id) as link_count,
            (select count(*)::int from galleries g where g.domain_id = d.id) as gallery_count
       from domains d
      -- Domains still being set up first (newest first), then the live ones A to Z.
      order by (d.went_live_at is null) desc, (case when d.went_live_at is null then d.created_at end) desc, d.host`,
  );
}

/** Records that a domain has answered as live, so it takes its place in the alphabetical list. */
export async function markDomainLive(id: number): Promise<void> {
  await query(`update domains set went_live_at = now() where id = $1 and went_live_at is null`, [id]);
}

export async function findDomain(host: string): Promise<Domain | null> {
  const rows = await query<Domain>(
    `select ${DOMAIN_COLUMNS}, 0 as link_count, 0 as gallery_count from domains d where d.host = $1`,
    [host],
  );
  return rows[0] ?? null;
}

export async function createDomain(host: string, rootRedirect: string | null, notFound: string | null): Promise<number> {
  const rows = await query<{ id: number }>(
    `insert into domains (host, root_redirect_url, not_found_url) values ($1, $2, $3) returning id`,
    [host, rootRedirect, notFound],
  );
  return rows[0].id;
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
  select l.*, d.host, (d.favicon_data is not null) as has_icon,
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

export async function getLinkByAddress(host: string, slug: string): Promise<LinkRow | null> {
  const rows = await query<LinkRow>(`${LINK_SELECT} where d.host = $1 and l.slug = $2`, [host, slug]);
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
    const host = new URL(referrer).host.toLowerCase().replace(/^www\./, "");
    // A hostname is at most 253 characters (plus a port); anything longer is junk and is not stored.
    return host && host.length <= 260 ? host : null;
  } catch {
    return null;
  }
}

/**
 * The visitor's country from the host's geo header: Vercel's or Cloudflare's. Any client can send these
 * headers when nothing in front of the app strips them, so only a two-letter ISO code is accepted;
 * anything else (including Cloudflare's "XX" for unknown) is stored as no country.
 */
export function countryFromHeaders(h: { get(name: string): string | null }): string | null {
  const value = (h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry") ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(value) && value !== "XX" ? value : null;
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

/* ---------- Import ---------- */

/** "domainId/slug" -> destination, for every stored link. Lets an import skip what is already here. */
export async function existingLinkMap(): Promise<Map<string, string>> {
  const rows = await query<{ domain_id: number; slug: string; destination_url: string }>(
    `select domain_id, slug, destination_url from links
     union all
     select domain_id, slug, $1::text from galleries`,
    [GALLERY_MARKER],
  );
  return new Map(rows.map((r) => [r.domain_id + "/" + r.slug, r.destination_url]));
}

export type ImportRow = {
  domainId: number;
  slug: string;
  destination: string;
  title: string | null;
  notes: string;
  createdAt: string | null;
  utm: Utm;
};

/** Inserts in batches. Existing (domain, slug) pairs are left untouched. Returns how many were created. */
export async function importLinks(rows: ImportRow[]): Promise<number> {
  const CHUNK = 100;
  const COLS = 11;
  let created = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const params: unknown[] = [];
    const tuples = chunk.map((r, row) => {
      params.push(
        r.domainId, r.slug, r.destination, r.title, r.notes, r.createdAt,
        r.utm.utm_source, r.utm.utm_medium, r.utm.utm_campaign, r.utm.utm_term, r.utm.utm_content,
      );
      const p = (n: number) => "$" + (row * COLS + n);
      const list = Array.from({ length: COLS }, (_, k) => p(k + 1));
      list[5] = "coalesce(" + p(6) + "::timestamptz, now())";
      return "(" + list.join(", ") + ")";
    });
    const inserted = await query<{ id: number }>(
      `insert into links (domain_id, slug, destination_url, title, notes, created_at,
                          utm_source, utm_medium, utm_campaign, utm_term, utm_content)
       values ` + tuples.join(", ") + `
       on conflict (domain_id, slug) do nothing
       returning id`,
      params,
    );
    created += inserted.length;
  }
  return created;
}

/** Clicks per day for the last 7 days (oldest first) for each given link, for the small trend in the table. */
export async function weeklyTrends(linkIds: number[]): Promise<Map<number, number[]>> {
  const result = new Map<number, number[]>();
  if (linkIds.length === 0) return result;
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    days.push(new Date(Date.now() - i * 86_400_000).toLocaleDateString("en-CA", { timeZone: appTimezone() }));
  }
  const rows = await query<{ link_id: number; day: string; n: number }>(
    `select link_id, to_char(date_trunc('day', clicked_at at time zone $2::text), 'YYYY-MM-DD') as day, count(*)::int as n
       from clicks
      where link_id = any($1::int[]) and device <> 'bot' and clicked_at > now() - interval '8 days'
      group by 1, 2`,
    [linkIds, appTimezone()],
  );
  for (const id of linkIds) result.set(id, days.map(() => 0));
  for (const r of rows) {
    const i = days.indexOf(r.day);
    if (i >= 0) result.get(Number(r.link_id))![i] = Number(r.n);
  }
  return result;
}

/* ---------- Domain icons ---------- */

export async function saveFavicon(id: number, icon: { data: Buffer; type: string } | null): Promise<void> {
  await query(
    `update domains set favicon_data = coalesce($2, favicon_data), favicon_type = coalesce($3, favicon_type), favicon_checked_at = now() where id = $1`,
    [id, icon?.data ?? null, icon?.type ?? null],
  );
}

export async function getFavicon(id: number): Promise<{ data: Buffer; type: string; version: number } | null> {
  const rows = await query<{ favicon_data: Buffer | null; favicon_type: string | null; v: number }>(
    `select favicon_data, favicon_type, extract(epoch from favicon_checked_at)::bigint as v from domains where id = $1`,
    [id],
  );
  const r = rows[0];
  if (!r?.favicon_data || !r.favicon_type) return null;
  return { data: Buffer.from(r.favicon_data), type: r.favicon_type, version: Number(r.v) };
}
