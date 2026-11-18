import { query } from "./db";
import { appTimezone } from "./timezone";
import type { ButtonStyle, GalleryRow, ItemKind, ItemRow } from "./gallery-render";
import { SlugTakenError, deviceFromUserAgent, referrerHost, type DayCount } from "./links";

export type GalleryListRow = GalleryRow & { item_count: number; views_total: number; clicks_total: number };

const SELECT = `select g.*, d.host from galleries g join domains d on d.id = g.domain_id`;

/* ---------- Galleries ---------- */

export async function listGalleries(): Promise<GalleryListRow[]> {
  return query<GalleryListRow>(
    `select g.*, d.host,
            (select count(*)::int from gallery_items i where i.gallery_id = g.id) as item_count,
            (select count(*)::int from gallery_events e where e.gallery_id = g.id and e.kind = 'view' and e.device <> 'bot') as views_total,
            (select count(*)::int from gallery_events e where e.gallery_id = g.id and e.kind = 'click' and e.device <> 'bot') as clicks_total
       from galleries g join domains d on d.id = g.domain_id
      order by g.created_at desc`,
  );
}

export async function getGallery(id: number): Promise<GalleryRow | null> {
  const rows = await query<GalleryRow>(`${SELECT} where g.id = $1`, [id]);
  return rows[0] ?? null;
}

/** The gallery at host/slug, for the public page. */
export async function findGallery(host: string, slug: string): Promise<GalleryRow | null> {
  const rows = await query<GalleryRow>(`${SELECT} where d.host = $1 and g.slug = $2`, [host, slug]);
  return rows[0] ?? null;
}

export async function createGallery(input: { domainId: number; slug: string; title: string }): Promise<number> {
  const clash = await query(`select 1 from links where domain_id = $1 and slug = $2`, [input.domainId, input.slug]);
  if (clash.length > 0) throw new SlugTakenError("That slug is already used by a link on this domain.");
  const rows = await query<{ id: number }>(
    `insert into galleries (domain_id, slug, title) values ($1, $2, $3)
     on conflict (domain_id, slug) do nothing returning id`,
    [input.domainId, input.slug, input.title],
  );
  if (!rows[0]) throw new SlugTakenError("That slug is already used by a gallery on this domain.");
  return rows[0].id;
}

export type GalleryFields = {
  title: string;
  bio: string | null;
  avatar: string | null;
  bg_color: string;
  text_color: string;
  button_color: string;
  button_text_color: string;
  button_style: ButtonStyle;
  footer: string | null;
  published: boolean;
};

export async function updateGallery(id: number, f: GalleryFields): Promise<void> {
  await query(
    `update galleries set title = $2, bio = $3, avatar = $4, bg_color = $5, text_color = $6, button_color = $7,
                          button_text_color = $8, button_style = $9, footer = $10, published = $11, updated_at = now()
      where id = $1`,
    [id, f.title, f.bio, f.avatar, f.bg_color, f.text_color, f.button_color, f.button_text_color, f.button_style, f.footer, f.published],
  );
}

export async function deleteGallery(id: number): Promise<void> {
  await query(`delete from galleries where id = $1`, [id]);
}

/** Touch the page so the admin preview and caches see a change made to its items. */
async function touch(galleryId: number): Promise<void> {
  await query(`update galleries set updated_at = now() where id = $1`, [galleryId]);
}

/* ---------- Items ---------- */

export async function listItems(galleryId: number): Promise<ItemRow[]> {
  return query<ItemRow>(`select * from gallery_items where gallery_id = $1 order by position, id`, [galleryId]);
}

export async function getItem(id: number): Promise<ItemRow | null> {
  const rows = await query<ItemRow>(`select * from gallery_items where id = $1`, [id]);
  return rows[0] ?? null;
}

export type ItemFields = { kind: ItemKind; label: string | null; url: string | null; image: string | null; network: string | null };

export async function addItem(galleryId: number, f: ItemFields): Promise<void> {
  await query(
    `insert into gallery_items (gallery_id, position, kind, label, url, image, network)
     values ($1, coalesce((select max(position) from gallery_items where gallery_id = $1), 0) + 1, $2, $3, $4, $5, $6)`,
    [galleryId, f.kind, f.label, f.url, f.image, f.network],
  );
  await touch(galleryId);
}

export async function updateItem(id: number, f: Omit<ItemFields, "kind">): Promise<void> {
  const rows = await query<{ gallery_id: number }>(
    `update gallery_items set label = $2, url = $3, image = $4, network = $5 where id = $1 returning gallery_id`,
    [id, f.label, f.url, f.image, f.network],
  );
  if (rows[0]) await touch(rows[0].gallery_id);
}

export async function setItemHidden(id: number, hidden: boolean): Promise<void> {
  const rows = await query<{ gallery_id: number }>(`update gallery_items set hidden = $2 where id = $1 returning gallery_id`, [id, hidden]);
  if (rows[0]) await touch(rows[0].gallery_id);
}

export async function deleteItem(id: number): Promise<void> {
  const rows = await query<{ gallery_id: number }>(`delete from gallery_items where id = $1 returning gallery_id`, [id]);
  if (rows[0]) await touch(rows[0].gallery_id);
}

/** Swap an item with its neighbour above (-1) or below (+1), then renumber so positions stay tidy. */
export async function moveItem(id: number, direction: -1 | 1): Promise<void> {
  const item = await getItem(id);
  if (!item) return;
  const ids = (await listItems(item.gallery_id)).map((i) => i.id);
  const from = ids.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ids.length) return;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  await query(
    `update gallery_items set position = t.ord
       from unnest($1::int[]) with ordinality as t(id, ord)
      where gallery_items.id = t.id`,
    [ids],
  );
  await touch(item.gallery_id);
}

/* ---------- Public page: events ---------- */

export type EventInfo = { referrer: string | null; country: string | null; userAgent: string | null; via: string | null };

export async function recordGalleryEvent(galleryId: number, itemId: number | null, info: EventInfo): Promise<void> {
  await query(
    `insert into gallery_events (gallery_id, item_id, kind, referrer, country, device, via)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [galleryId, itemId, itemId === null ? "view" : "click", referrerHost(info.referrer), info.country, deviceFromUserAgent(info.userAgent), info.via],
  );
}

/** The item behind /slug/<id>, only if it belongs to that gallery and can be followed. */
export async function findClickableItem(galleryId: number, itemId: number): Promise<ItemRow | null> {
  const rows = await query<ItemRow>(
    `select * from gallery_items where id = $1 and gallery_id = $2 and hidden = false and url is not null`,
    [itemId, galleryId],
  );
  return rows[0] ?? null;
}

/* ---------- Statistics ---------- */

export type GalleryStats = { views_total: number; views_7d: number; qr_views: number; clicks_total: number; clicks_7d: number };

export async function galleryStats(id: number): Promise<GalleryStats> {
  const rows = await query<GalleryStats>(
    `select (count(*) filter (where kind = 'view'))::int as views_total,
            (count(*) filter (where kind = 'view' and occurred_at > now() - interval '7 days'))::int as views_7d,
            (count(*) filter (where kind = 'view' and via = 'qr'))::int as qr_views,
            (count(*) filter (where kind = 'click'))::int as clicks_total,
            (count(*) filter (where kind = 'click' and occurred_at > now() - interval '7 days'))::int as clicks_7d
       from gallery_events where gallery_id = $1 and device <> 'bot'`,
    [id],
  );
  return rows[0] ?? { views_total: 0, views_7d: 0, qr_views: 0, clicks_total: 0, clicks_7d: 0 };
}

export async function galleryViewsByDay(id: number, days = 30): Promise<DayCount[]> {
  return query<DayCount>(
    `select to_char(d.day, 'YYYY-MM-DD') as day, coalesce(c.n, 0)::int as n
       from generate_series(
              (date_trunc('day', now() at time zone $3::text) - ($2::int - 1) * interval '1 day'),
              date_trunc('day', now() at time zone $3::text),
              interval '1 day') as d(day)
       left join (
         select date_trunc('day', occurred_at at time zone $3::text) as day, count(*) as n
           from gallery_events
          where gallery_id = $1 and kind = 'view' and device <> 'bot'
          group by 1
       ) c on c.day = d.day
      order by d.day`,
    [id, days, appTimezone()],
  );
}

export type ItemClicks = { item_id: number | null; total: number; d7: number };

/** Clicks per button. A null item_id groups clicks on buttons that have since been deleted. */
export async function itemClickCounts(galleryId: number): Promise<ItemClicks[]> {
  return query<ItemClicks>(
    `select item_id, count(*)::int as total,
            (count(*) filter (where occurred_at > now() - interval '7 days'))::int as d7
       from gallery_events
      where gallery_id = $1 and kind = 'click' and device <> 'bot'
      group by item_id`,
    [galleryId],
  );
}
