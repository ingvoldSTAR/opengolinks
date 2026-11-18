// UTM campaign parameters. No imports on purpose: this runs on the server (redirects,
// validation) and in the browser (live preview on the link form).

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
export type UtmKey = (typeof UTM_KEYS)[number];
export type Utm = Record<UtmKey, string | null>;

export const UTM_MAX_LENGTH = 100;

/**
 * Analytics tools treat "Newsletter" and "newsletter" as different campaigns, so values are
 * lower-cased and spaces become hyphens. Empty input means "not set".
 */
export function cleanUtmValue(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase().replace(/\s+/g, "-").slice(0, UTM_MAX_LENGTH);
  return v || null;
}

/** The destination with the link's UTM values applied. A link's own values replace any already in the URL. */
export function withUtm(destination: string, utm: Partial<Record<UtmKey, string | null>>): string {
  let url: URL;
  try {
    url = new URL(destination);
  } catch {
    return destination;
  }
  const additions = UTM_KEYS.flatMap((key) => (utm[key] ? [[key, utm[key] as string] as const] : []));
  if (additions.length === 0) return destination;

  // The query is edited as text. Going through URLSearchParams would re-encode the destination's own
  // parameters (for example %20 becomes +), which can break signed or otherwise exact URLs.
  const replaced = new Set<string>(additions.map(([key]) => key));
  const kept = url.search
    .slice(1)
    .split("&")
    .filter((pair) => pair !== "" && !replaced.has(decodeKey(pair.split("=")[0])));
  const added = additions.map(([key, value]) => `${key}=${encodeURIComponent(value)}`);
  url.search = "?" + [...kept, ...added].join("&");
  return url.toString();
}

function decodeKey(raw: string): string {
  try {
    return decodeURIComponent(raw.replace(/\+/g, " "));
  } catch {
    return raw;
  }
}
