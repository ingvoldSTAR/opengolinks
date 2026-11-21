import { resolve4 } from "node:dns/promises";
import { request } from "node:https";
import { isPublicIPv4 } from "./domainStatus";

export type SafeResponse = { status: number; headers: Record<string, string | string[] | undefined>; body: Buffer; url: string };

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

function get(url: URL, ip: string, maxBytes: number, timeoutMs: number): Promise<SafeResponse | null> {
  return new Promise((resolve) => {
    const req = request(
      {
        host: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: "GET",
        timeout: timeoutMs,
        headers: { "User-Agent": "opengolinks-icon-fetch", Accept: "text/html,image/*;q=0.9,*/*;q=0.5" },
        // Connect to the address that was just checked, not whatever a second lookup returns.
        lookup: (_h, options, cb) => {
          const a = { address: ip, family: 4 };
          if ((options as { all?: boolean }).all) (cb as unknown as (e: null, a: unknown[]) => void)(null, [a]);
          else cb(null, a.address, a.family);
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        let tooBig = false;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > maxBytes) {
            tooBig = true;
            res.destroy();
          } else chunks.push(c);
        });
        res.on("close", () =>
          resolve(tooBig ? null : { status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks), url: url.toString() }),
        );
        res.on("error", () => resolve(null));
      },
    );
    // The socket timeout only covers idle time, so a server sending a byte at a time could hold on. Cap the whole request.
    const deadline = setTimeout(() => req.destroy(), timeoutMs * 3);
    req.on("close", () => clearTimeout(deadline));
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
    req.end();
  });
}

/**
 * GET over HTTPS for a public website only: the name must resolve to public IPv4 addresses, the connection
 * is pinned to one of them, redirects are followed at most three times with every hop checked again, and
 * the body is capped. Anything else returns null.
 */
export async function safeGet(startUrl: string, maxBytes: number, timeoutMs = 4000, trace?: string[]): Promise<SafeResponse | null> {
  let url: URL;
  try {
    url = new URL(startUrl);
  } catch {
    return null;
  }
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== "https:" || url.port || url.username || !HOSTNAME.test(url.hostname)) {
      trace?.push(`${url.href}: not an https address`);
      return null;
    }
    let addresses: string[] = [];
    try {
      addresses = await resolve4(url.hostname);
    } catch {
      trace?.push(`${url.hostname}: no IPv4 address found`);
      return null;
    }
    if (addresses.length === 0 || !addresses.every(isPublicIPv4)) {
      trace?.push(`${url.hostname}: not a public address`);
      return null;
    }
    const res = await get(url, addresses[0], maxBytes, timeoutMs);
    if (!res) {
      trace?.push(`${url.href}: no response, too large or timed out`);
      return null;
    }
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      try {
        url = new URL(String(res.headers.location), url);
      } catch {
        return null;
      }
      continue;
    }
    if (res.status !== 200) trace?.push(`${url.href}: HTTP ${res.status}`);
    return res.status === 200 ? res : null;
  }
  return null;
}
