import { query } from "./db";
import { parseHexColour } from "./validate";

export type QrKind = "link" | "gallery";
/** Where the colours in use come from: this item's own choice, its domain's default, or the built-in black on white. */
export type QrColours = { dark: string; light: string; source: "own" | "domain" | "default" };

const DEFAULT_DARK = "#000000";
const DEFAULT_LIGHT = "#ffffff";
const TABLE: Record<QrKind, "links" | "galleries"> = { link: "links", gallery: "galleries" };

/** A background is a six-digit colour or the word "transparent". */
export function cleanLight(v: string | null | undefined): string {
  return v === "transparent" ? "transparent" : parseHexColour(v ?? null, DEFAULT_LIGHT).toLowerCase();
}
export function cleanDark(v: string | null | undefined): string {
  return parseHexColour(v ?? null, DEFAULT_DARK).toLowerCase();
}

/** The colours to show for one link or gallery: its own if set, otherwise its domain's, otherwise black on white. */
export async function getQrColours(kind: QrKind, id: number): Promise<QrColours> {
  const rows = await query<{ qr_dark: string | null; qr_light: string | null; d_dark: string | null; d_light: string | null }>(
    `select t.qr_dark, t.qr_light, d.qr_dark as d_dark, d.qr_light as d_light
       from ${TABLE[kind]} t join domains d on d.id = t.domain_id where t.id = $1`,
    [id],
  );
  const r = rows[0];
  if (r && (r.qr_dark || r.qr_light)) return { dark: cleanDark(r.qr_dark), light: cleanLight(r.qr_light), source: "own" };
  if (r && (r.d_dark || r.d_light)) return { dark: cleanDark(r.d_dark), light: cleanLight(r.d_light), source: "domain" };
  return { dark: DEFAULT_DARK, light: DEFAULT_LIGHT, source: "default" };
}

/**
 * Saves colours for one link or gallery. With applyToDomain they become the domain's colours and every link
 * and gallery on that domain loses its own choice, all in one statement. Otherwise only this item changes.
 */
export async function saveQrColours(kind: QrKind, id: number, dark: string, light: string, applyToDomain: boolean): Promise<{ host: string } | null> {
  const t = TABLE[kind];
  const found = await query<{ host: string; domain_id: number }>(
    `select d.host, d.id as domain_id from ${t} t join domains d on d.id = t.domain_id where t.id = $1`,
    [id],
  );
  if (!found[0]) return null;
  const { host, domain_id } = found[0];
  if (applyToDomain) {
    await query(
      `with a as (update domains set qr_dark = $2, qr_light = $3 where id = $1),
            b as (update links set qr_dark = null, qr_light = null where domain_id = $1)
       update galleries set qr_dark = null, qr_light = null where domain_id = $1`,
      [domain_id, dark, light],
    );
  } else {
    await query(`update ${t} set qr_dark = $2, qr_light = $3 where id = $1`, [id, dark, light]);
  }
  return { host };
}
