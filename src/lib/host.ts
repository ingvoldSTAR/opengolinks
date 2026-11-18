import { headers } from "next/headers";

type HeaderSource = { get(name: string): string | null };

/** A proxy appends its own value to a header a client may already have set, so the last entry is the trustworthy one. */
function lastValue(raw: string | null | undefined): string {
  const parts = (raw ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

export function normaliseHost(raw: string | null | undefined): string {
  return lastValue(raw)
    .toLowerCase()
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

/** The host the visitor asked for, with any port: the proxy's X-Forwarded-Host, else Host. */
function rawHost(h: HeaderSource): string {
  return lastValue(h.get("x-forwarded-host")) || lastValue(h.get("host"));
}

/** Normalised host for a request. Use this everywhere instead of reading the headers directly. */
export function hostFromHeaders(h: HeaderSource): string {
  return normaliseHost(rawHost(h));
}

export async function currentHost(): Promise<string> {
  return hostFromHeaders(await headers());
}

export function adminHosts(): string[] {
  return (process.env.ADMIN_HOSTS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** In production the admin area stays off (404 on every host) until ADMIN_HOSTS is set. Locally, unset allows every host. */
export function isAdminHost(host: string): boolean {
  const allowed = adminHosts();
  if (allowed.length === 0) return process.env.NODE_ENV !== "production";
  return allowed.includes(host);
}

/**
 * Public origin of this app, for OAuth redirect URIs and redirects after sign-in. Keeps the port, which
 * currentHost drops. The host must be one of ADMIN_HOSTS (when set); anything else is replaced by the
 * first of them, so a forged Host or X-Forwarded-Host cannot steer a redirect to another site.
 * The scheme is https except for localhost, and is not taken from a header.
 */
export async function currentOrigin(): Promise<string> {
  let host = rawHost(await headers());
  const configured = adminHosts();
  if (configured.length > 0 && !configured.includes(normaliseHost(host))) host = configured[0];
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  return `${local ? "http" : "https"}://${host}`;
}
