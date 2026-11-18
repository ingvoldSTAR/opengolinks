import { UTM_KEYS, cleanUtmValue, type Utm, type UtmKey } from "./utm";
import { parseSlug, parseUrl } from "./validate";

/**
 * Planning for every import source (Rebrandly, CSV). Pure: no network, no database. A source turns what
 * it reads into ImportRecords, and planImport applies the same rules to all of them.
 */

/**
 * Stored in place of a destination when the slug is taken by a gallery rather than a link. It is not a
 * valid http(s) address, so it never equals a real destination. It must not contain a NUL character:
 * Postgres rejects those in query text, which made every import fail on a real database.
 */
export const GALLERY_MARKER = "(gallery)";

/**
 * Postgres rejects NUL characters in text, but the embedded development database accepts them, so a
 * problem here only shows on a real database. Everything imported as text goes through this.
 */
export const stripNul = (s: string): string => s.replace(/\u0000/g, "");

/** One link as a source read it, before any checking. */
export type ImportRecord = {
  host: string;
  slug: string;
  destination: string;
  title: string | null;
  createdAt: string | null;
  /** Saved in the link's notes, to record where it came from. */
  note: string;
  /** Campaign values the source gave explicitly. Null when it gave none, so utm_ values in the destination can be lifted. */
  utm: Partial<Record<UtmKey, string | null>> | null;
  /** Shown after the link in the report, for example "row 12". */
  ref: string | null;
};

export type PlanItem = {
  domainId: number;
  host: string;
  slug: string;
  destination: string;
  title: string | null;
  notes: string;
  createdAt: string | null;
  utm: Utm;
};

export type Skip = { link: string; reason: string };

export type Plan = {
  create: PlanItem[];
  skipped: Skip[];
  /** Links on domains that are not added in this app yet, counted per domain. */
  unknownDomains: Map<string, number>;
  alreadyThere: number;
  utmLifted: number;
};

const EMPTY_UTM: Utm = { utm_source: null, utm_medium: null, utm_campaign: null, utm_term: null, utm_content: null };

/** The destination without its utm_ parameters, and the values they held (lower-cased, as stored). */
function liftUtm(destination: string): { found: boolean; destination: string; utm: Utm } {
  const url = new URL(destination);
  const utm: Utm = { ...EMPTY_UTM };
  let found = false;
  for (const k of UTM_KEYS) {
    const v = cleanUtmValue(url.searchParams.get(k));
    if (v) {
      utm[k] = v;
      found = true;
    }
    url.searchParams.delete(k);
  }
  return { found, destination: found ? url.toString() : destination, utm };
}

export function planImport(
  records: ImportRecord[],
  domains: Map<string, number>, // host -> domain id
  existing: Map<string, string>, // `${domainId}/${slug}` -> destination already stored
  opts: { liftUtm: boolean },
): Plan {
  const plan: Plan = { create: [], skipped: [], unknownDomains: new Map(), alreadyThere: 0, utmLifted: 0 };
  const seen = new Map<string, string>(); // key -> slug as first written, for case collisions

  for (const record of records) {
    const host = stripNul(record.host).trim().toLowerCase();
    const rawSlug = stripNul(record.slug).trim();
    const label = `${host || "(no domain)"}/${rawSlug}${record.ref ? ` (${record.ref})` : ""}`;

    const domainId = domains.get(host);
    if (domainId === undefined) {
      plan.unknownDomains.set(host || "(no domain)", (plan.unknownDomains.get(host || "(no domain)") ?? 0) + 1);
      continue;
    }

    const slug = parseSlug(rawSlug.toLowerCase());
    if (!slug.ok) {
      plan.skipped.push({ link: label, reason: "slug not supported here (letters, numbers, - and _ only, up to 64 characters, and not a reserved word)" });
      continue;
    }

    const dest = parseUrl(stripNul(record.destination));
    if (!dest.ok) {
      plan.skipped.push({ link: label, reason: "destination is not a valid http(s) address" });
      continue;
    }

    const key = `${domainId}/${slug.value}`;
    const earlier = seen.get(key);
    if (earlier !== undefined) {
      plan.skipped.push({
        link: label,
        reason:
          earlier === rawSlug
            ? "same slug as an earlier entry here (the earlier one is used)"
            : `same slug as "${earlier}" here, which only differs by capital letters`,
      });
      continue;
    }
    seen.set(key, rawSlug);

    // Without explicit campaign values, utm_ values in the destination can be moved into the campaign fields.
    const lifted = record.utm ? null : liftUtm(dest.value);

    const stored = existing.get(key);
    if (stored !== undefined) {
      if (stored === GALLERY_MARKER) plan.skipped.push({ link: label, reason: "that slug is already used by a gallery here" });
      // A link imported earlier with its utm_ values moved is stored without them, so that form counts as the same destination.
      else if (stored === dest.value || (lifted?.found && stored === lifted.destination)) plan.alreadyThere++;
      else plan.skipped.push({ link: label, reason: "already exists here with a different destination (left untouched)" });
      continue;
    }

    let destination = dest.value;
    const utm: Utm = { ...EMPTY_UTM };
    if (record.utm) {
      for (const k of UTM_KEYS) utm[k] = cleanUtmValue(stripNul(record.utm[k] ?? ""));
    } else if (opts.liftUtm && lifted?.found) {
      destination = lifted.destination;
      Object.assign(utm, lifted.utm);
      plan.utmLifted++;
    }

    const created = record.createdAt ? new Date(record.createdAt) : null;
    plan.create.push({
      domainId,
      host,
      slug: slug.value,
      destination,
      title: stripNul(record.title ?? "").trim() || null,
      notes: stripNul(record.note),
      createdAt: created && !Number.isNaN(created.getTime()) ? created.toISOString() : null,
      utm,
    });
  }
  return plan;
}
