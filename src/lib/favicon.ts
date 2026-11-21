import { after } from "next/server";
import { apexUrl } from "./validate";
import { safeGet } from "./safeFetch";
import { getFavicon, saveFavicon } from "./links";

const MAX_ICON = 100_000;
const MAX_HTML = 300_000;

type Icon = { data: Buffer; type: string };

/**
 * An SVG is accepted only when it is plain drawing: no script, no event handlers, no embedded HTML,
 * no external references and no DOCTYPE/entities. Anything else is refused. It is only ever shown
 * through an <img> tag, where SVG cannot run script in any case.
 */
function isSafeSvg(b: Buffer): boolean {
  if (b.length > 50_000) return false;
  const s = b.toString("utf8");
  if (!/^\s*(<\?xml[^>]*\?>\s*)?(<!--[\s\S]*?-->\s*)*<svg[\s>]/i.test(s)) return false;
  if (/<\s*(script|foreignObject|iframe|object|embed|image|use|audio|video|animate|set|link|style)\b/i.test(s)) return false;
  if (/<!(DOCTYPE|ENTITY)/i.test(s)) return false;
  if (/\bon[a-z]+\s*=/i.test(s)) return false;
  if (/javascript:|data:|@import|(?:xlink:)?href\s*=|url\(\s*["']?(?!#)/i.test(s)) return false;
  return true;
}

/** What the bytes really are. The declared type is not trusted. */
function sniff(b: Buffer): string | null {
  if (b.length < 8) return null;
  if (isSafeSvg(b)) return "image/svg+xml";
  if (b[0] === 0x89 && b.toString("latin1", 1, 4) === "PNG") return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.toString("latin1", 0, 3) === "GIF") return "image/gif";
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return "image/x-icon";
  return null;
}

/** Icon links from a page, best first: PNG icons, then other icons, then Apple touch icons. */
function iconLinks(html: string, base: string): string[] {
  const found: { href: string; score: number }[] = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href || !/\bicon\b/.test(rel)) continue;
    const sizes = Number(/\bsizes\s*=\s*["']?(\d+)/i.exec(tag)?.[1] ?? 0);
    let score = rel.includes("apple-touch") ? 1 : /\.png(\?|$)/i.test(href) || /type\s*=\s*["']image\/png/i.test(tag) ? 3 : 2;
    if (sizes >= 32 && sizes <= 192) score += 1;
    try {
      found.push({ href: new URL(href, base).toString(), score });
    } catch {
      // ignore a malformed href
    }
  }
  return found.sort((a, b) => b.score - a.score).map((f) => f.href);
}

async function iconFromSite(site: string, trace?: string[]): Promise<Icon | null> {
  const base = `https://${site}/`;
  const page = await safeGet(base, MAX_HTML, 4000, trace);
  const candidates = [...(page ? iconLinks(page.body.toString("utf8"), page.url) : []), new URL("/favicon.ico", base).toString()];
  for (const url of [...new Set(candidates)].slice(0, 4)) {
    const res = await safeGet(url, MAX_ICON, 4000, trace);
    const type = res ? sniff(res.body) : null;
    if (res && type) return { data: res.body, type };
    if (res) trace?.push(`${url}: not a usable image (${res.body.length} bytes)`);
  }
  return null;
}

/**
 * The brand icon for a domain such as go.example.com: taken from the main website (example.com) first,
 * since the short-link host usually has no page of its own, then from the host itself.
 */
export async function fetchFavicon(host: string, trace?: string[]): Promise<Icon | null> {
  const sites = [apexUrl(host)?.replace("https://", ""), host].filter((s): s is string => Boolean(s));
  for (const site of [...new Set(sites)]) {
    const icon = await iconFromSite(site, trace).catch(() => null);
    if (icon) return icon;
  }
  return null;
}

/** Fetches and stores the icon. Records the attempt so a site without an icon is not retried on every visit. */
export async function refreshFavicon(id: number, host: string, trace?: string[]): Promise<boolean> {
  const icon = await fetchFavicon(host, trace);
  await saveFavicon(id, icon);
  return icon !== null;
}

const RETRY_MS = 7 * 86_400_000;

/** Domains that have no icon and have not been tried this week. */
export function needsIcon(d: { has_icon: boolean; favicon_checked_at: Date | null }): boolean {
  if (d.has_icon) return false;
  return !d.favicon_checked_at || Date.now() - new Date(d.favicon_checked_at).getTime() > RETRY_MS;
}

/** Fetch missing icons after the response is sent, so a page never waits on another website. */
export function backfillIcons(domains: { id: number; host: string; has_icon: boolean; favicon_checked_at: Date | null }[]): void {
  const todo = domains.filter(needsIcon);
  if (todo.length === 0) return;
  after(async () => {
    for (const d of todo) await refreshFavicon(d.id, d.host).catch((e) => console.error("[favicon]", d.host, e instanceof Error ? e.message : e));
  });
}

export { getFavicon };
