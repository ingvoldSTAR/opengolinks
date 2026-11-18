import type { ImportRecord } from "./import";

/* ---------- Fetching ---------- */

export type RbLink = {
  id: string;
  title?: string | null;
  slashtag?: string | null;
  destination?: string | null;
  createdAt?: string | null;
  clicks?: number | null;
  domain?: { fullName?: string | null } | null;
};

/** Test-only override (REBRANDLY_API_BASE), so tests can point at a local fake of the API. Leave it unset otherwise. */
const base = () => process.env.REBRANDLY_API_BASE?.trim() || "https://api.rebrandly.com";

export class RebrandlyError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_LINKS = 20_000;

async function getPage(apiKey: string, workspace: string | null, params: Record<string, string>): Promise<RbLink[]> {
  const url = new URL("/v1/links", base());
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const headers: Record<string, string> = { apikey: apiKey, accept: "application/json" };
  if (workspace) headers.workspace = workspace;

  for (let attempt = 0; attempt < 4; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000), cache: "no-store" });
    } catch {
      throw new RebrandlyError("Could not reach Rebrandly. Try again in a moment.");
    }
    if (res.status === 401 || res.status === 403) {
      throw new RebrandlyError("Rebrandly did not accept that API key (or workspace).");
    }
    if (res.status === 429) {
      await sleep(1500 * (attempt + 1));
      continue;
    }
    if (res.status === 400) throw new RebrandlyError("BAD_REQUEST");
    if (!res.ok) throw new RebrandlyError(`Rebrandly answered with an error (HTTP ${res.status}).`);
    const body = (await res.json()) as unknown;
    return Array.isArray(body) ? (body as RbLink[]) : [];
  }
  throw new RebrandlyError("Rebrandly is rate limiting requests. Wait a minute and try again.");
}

/** Every link in the workspace the key belongs to, following Rebrandly's `last` cursor. */
export async function fetchAllLinks(apiKey: string, workspace: string | null): Promise<{ links: RbLink[]; truncated: boolean }> {
  const byId = new Map<string, RbLink>();
  let limit = 100; // the docs disagree on the maximum (25 or 100), so fall back if 100 is refused
  let truncated = false;

  // Rebrandly's own example lists "non-favourite" links, so also run a favourites pass and merge by id.
  for (const favourite of [undefined, "true"]) {
    let last: string | undefined;
    for (;;) {
      const params: Record<string, string> = { limit: String(limit) };
      if (last) params.last = last;
      if (favourite) params.favourite = favourite;

      let page: RbLink[];
      try {
        page = await getPage(apiKey, workspace, params);
      } catch (e) {
        if (e instanceof RebrandlyError && e.message === "BAD_REQUEST" && limit > 25) {
          limit = 25;
          continue;
        }
        if (e instanceof RebrandlyError && e.message === "BAD_REQUEST") {
          if (favourite) break; // the extra pass is only a safety net
          throw new RebrandlyError("Rebrandly rejected the request.");
        }
        throw e;
      }
      if (page.length === 0) break;
      for (const l of page) if (l?.id) byId.set(l.id, l);
      last = page[page.length - 1]?.id;
      if (!last) break;
      if (byId.size >= MAX_LINKS) {
        truncated = true;
        break;
      }
      await sleep(120);
    }
  }
  return { links: [...byId.values()], truncated };
}

/* ---------- Mapping ---------- */

/** Turns Rebrandly's links into the records every import source shares, which are then planned and saved the same way. */
export function rebrandlyRecords(links: RbLink[]): ImportRecord[] {
  return links.map((link) => {
    const slug = (link.slashtag ?? "").trim();
    const clicks = typeof link.clicks === "number" && link.clicks > 0 ? ` Rebrandly click total at import: ${link.clicks}.` : "";
    return {
      host: link.domain?.fullName ?? "",
      slug,
      destination: link.destination ?? "",
      title: link.title ?? null,
      createdAt: link.createdAt ?? null,
      note: `Imported from Rebrandly (${slug}).${clicks}`,
      utm: null,
      ref: null,
    };
  });
}
