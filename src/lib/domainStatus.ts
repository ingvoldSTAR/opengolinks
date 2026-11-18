import { resolve4 } from "node:dns/promises";
import { request } from "node:https";

/**
 * dns-missing:   the domain has no usable DNS records yet.
 * needs-connect: DNS answers, but https://<domain>/api/ping does not reach this app (not added as a
 *                parked domain at the host yet, or its certificate is still being issued).
 * live:          a request to https://<domain> reaches this app.
 * unchecked:     local development, nothing to check.
 *
 * DNS is not compared with this app's own addresses on purpose. Some hosts replace the CNAME
 * with their own alias once a domain is attached, and the addresses then differ by resolver.
 * Whether the request really arrives here is the reliable test.
 */
export type DomainStatus = "dns-missing" | "needs-connect" | "live" | "unchecked";

const isLocal = (h: string) => h === "localhost" || h === "127.0.0.1" || h.endsWith(".local");

/** The hostname people should point their CNAME at: the admin host. */
export function cnameTarget(currentHost: string): string {
  const explicit = process.env.CNAME_TARGET?.trim().toLowerCase();
  if (explicit) return explicit;
  const admin = (process.env.ADMIN_HOSTS ?? "").split(",")[0]?.trim().toLowerCase();
  return admin || currentHost;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

/** Public, routable IPv4 only. Keeps this check from making the server contact internal addresses. */
function isPublicIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  if ([a, b].some((n) => Number.isNaN(n))) return false;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  return true;
}

const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;

/**
 * Asks https://<host>:<port>/api/ping whether this app answers there. The connection goes to `ip`, the
 * address that was just checked, so a second DNS lookup cannot send it somewhere else; the certificate is
 * still verified for `host`. Redirects are not followed, and only a short body is read.
 * `port` exists for tests.
 */
export function probe(host: string, ip: string, port = 443): Promise<boolean> {
  return new Promise((resolve) => {
    const req = request(
      {
        host,
        port,
        path: "/api/ping",
        method: "GET",
        timeout: 5000,
        headers: { "User-Agent": "opengolinks-domain-check" },
        lookup: (_hostname, options, callback) => {
          const address = { address: ip, family: 4 };
          if ((options as { all?: boolean }).all) {
            (callback as unknown as (e: null, a: typeof address[]) => void)(null, [address]);
          } else {
            callback(null, address.address, address.family);
          }
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.destroy();
          resolve(false);
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
          if (body.length > 64) res.destroy();
        });
        res.on("close", () => resolve(body === "opengolinks"));
        res.on("error", () => resolve(false));
      },
    );
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(false));
    req.end();
  });
}

export async function checkDomain(host: string): Promise<DomainStatus> {
  if (isLocal(host)) return "unchecked";
  if (!HOSTNAME.test(host)) return "dns-missing";

  let addresses: string[] = [];
  try {
    addresses = await withTimeout(resolve4(host), 3000); // follows a CNAME if there is one
  } catch {
    // no records, or the lookup failed
  }
  if (addresses.length === 0 || !addresses.every(isPublicIPv4)) return "dns-missing";

  // Providers answer with several addresses; one reaching this app is enough.
  for (const ip of addresses.slice(0, 3)) {
    if (await probe(host, ip)) return "live";
  }
  return "needs-connect";
}
