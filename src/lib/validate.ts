const RESERVED = new Set(["admin", "api", "_next", "login", "logout", "favicon.ico", "robots.txt", "sitemap.xml"]);
const SLUG_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

export function parseUrl(input: string, label = "Destination"): Parsed<string> {
  const raw = input.trim();
  if (!raw) return { ok: false, error: `${label} is required.` };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: `${label} must be a full URL, for example https://example.com/page.` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: `${label} must start with http:// or https://.` };
  }
  return { ok: true, value: url.toString() };
}

export function parseOptionalUrl(input: string, label: string): Parsed<string | null> {
  if (!input.trim()) return { ok: true, value: null };
  return parseUrl(input, label);
}

export function parseSlug(input: string): Parsed<string> {
  const slug = input.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug)) {
    return {
      ok: false,
      error: "Slug can use letters, numbers, hyphens and underscores, up to 64 characters, and must start with a letter or number.",
    };
  }
  if (RESERVED.has(slug)) return { ok: false, error: `"${slug}" is reserved.` };
  return { ok: true, value: slug };
}

export function randomSlug(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join("");
}

export function parseHostInput(input: string): Parsed<string> {
  let host = input.trim().toLowerCase();
  host = host.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "");
  const valid = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host);
  if (!valid) return { ok: false, error: "Enter a domain such as go.example.com." };
  return { ok: true, value: host };
}

const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "edu", "ac", "or", "ne", "go", "sch", "mil"]);

/**
 * The main website of a domain: go.example.com gives https://example.com, go.example.co.uk gives
 * https://example.co.uk. Null when the host is already the main domain (a redirect to itself would loop).
 * Country code domains with a second level (co.uk, com.au) are recognised for the common cases only,
 * and the result is just a suggestion that can be edited.
 */
export function apexUrl(host: string): string | null {
  const labels = host.toLowerCase().split(".");
  const keep = labels.length >= 3 && labels[labels.length - 1].length === 2 && SECOND_LEVEL.has(labels[labels.length - 2]) ? 3 : 2;
  if (labels.length <= keep) return null;
  return `https://${labels.slice(-keep).join(".")}`;
}

export function parseRedirectCode(input: string): 301 | 302 {
  return input === "301" ? 301 : 302;
}

export function parseHexColour(input: string | null, fallback: string): string {
  if (!input) return fallback;
  const v = input.startsWith("#") ? input : `#${input}`;
  return /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;
}
