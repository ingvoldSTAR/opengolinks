import { resolve4 } from "node:dns/promises";
import { request } from "node:https";
import { PING_BODY } from "./ping.ts"; // with the extension, so the plain Node test runner can load this file

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
export function isPublicIPv4(ip: string): boolean {
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

export type ProbeResult = { ok: boolean; reason: string };

function failure(e: NodeJS.ErrnoException, connected: boolean): string {
  const code = e.code ?? "";
  if (code === "ECONNREFUSED") return "connection refused";
  if (code === "ECONNRESET") return connected ? "connected, then the connection was reset" : "connection reset";
  if (/CERT|SSL|TLS|HOSTNAME_MISMATCH|SELF_SIGNED/i.test(code) || /certificate/i.test(e.message)) return `certificate problem (${code || "TLS"})`;
  if (code === "ETIMEDOUT" || code === "EHOSTUNREACH" || code === "ENETUNREACH") return `could not reach it (${code})`;
  return `connection error (${code || "unknown"})`;
}

/**
 * Asks https://<host>:<port>/api/ping whether this app answers there, and says what happened if not. The connection
 * goes to `ip`, the address that was just checked, so a second DNS lookup cannot send it somewhere else; the
 * certificate is still verified for `host`. Redirects are not followed, and only a short body is read.
 * `port` and `timeoutMs` exist for tests.
 */
export function probeDetailed(host: string, ip: string, port = 443, timeoutMs = 4000): Promise<ProbeResult> {
  return new Promise((resolve) => {
    let connected = false;
    let settled = false;
    const finish = (r: ProbeResult) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    const req = request(
      {
        host,
        port,
        path: "/api/ping",
        method: "GET",
        timeout: timeoutMs,
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
          finish({ ok: false, reason: `it answered HTTP ${res.statusCode}, which is not this app (often a default or parking page)` });
          return;
        }
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          body += chunk;
          if (body.length > 64) res.destroy();
        });
        res.on("close", () => finish(body === PING_BODY ? { ok: true, reason: "answers" } : { ok: false, reason: "it answered, but not with this app's reply" }));
        res.on("error", () => finish({ ok: false, reason: "the reply was cut off" }));
      },
    );
    req.on("socket", (socket) => {
      socket.once("secureConnect", () => {
        connected = true;
      });
    });
    req.on("timeout", () => {
      req.destroy();
      finish({ ok: false, reason: connected ? "connected, but the request got no reply (it never reached the app)" : "could not connect (timed out)" });
    });
    req.on("error", (e) => finish({ ok: false, reason: failure(e, connected) }));
    req.end();
  });
}

export async function probe(host: string, ip: string, port = 443): Promise<boolean> {
  return (await probeDetailed(host, ip, port)).ok;
}

// This server checks its own domains over the internet, and hosting plans can limit how many connections an app
// may have open at once. However many domains there are, only a handful of probes run at a time.
const MAX_PROBES = 8;
let activeProbes = 0;
const waiting: (() => void)[] = [];

async function withProbeSlot<T>(run: () => Promise<T>): Promise<T> {
  if (activeProbes >= MAX_PROBES) await new Promise<void>((resolve) => waiting.push(resolve));
  activeProbes++;
  try {
    return await run();
  } finally {
    activeProbes--;
    waiting.shift()?.();
  }
}

export type DomainCheck = { status: DomainStatus; addresses: { ip: string; ok: boolean; reason: string }[]; checkedAt: number };

async function runCheck(host: string): Promise<DomainCheck> {
  const done = (status: DomainStatus, addresses: DomainCheck["addresses"] = []): DomainCheck => ({ status, addresses, checkedAt: Date.now() });
  if (isLocal(host)) return done("unchecked");
  if (!HOSTNAME.test(host)) return done("dns-missing");

  let addresses: string[] = [];
  try {
    addresses = await withTimeout(resolve4(host), 3000); // follows a CNAME if there is one
  } catch {
    // no records, or the lookup failed
  }
  if (addresses.length === 0 || !addresses.every(isPublicIPv4)) return done("dns-missing");

  // Providers answer with several addresses; one reaching this app is enough. They are tried together, so one
  // dead address cannot hold up the answer.
  const probed = await Promise.all(addresses.slice(0, 4).map(async (ip) => ({ ip, ...(await withProbeSlot(() => probeDetailed(host, ip))) })));
  return done(probed.some((p) => p.ok) ? "live" : "needs-connect", probed);
}

const CACHE_MS = 45_000;
const cache = new Map<string, { at: number; value: Promise<DomainCheck> }>();

/**
 * What a domain looks like right now, with what was seen at each address. Results are remembered for 45 seconds
 * (and a check already under way is shared), so reloading the page does not start another slow round of checks.
 * `fresh` skips the memory, for "Check again".
 */
export function inspectDomain(host: string, opts: { fresh?: boolean } = {}): Promise<DomainCheck> {
  const hit = cache.get(host);
  if (hit && !opts.fresh && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = runCheck(host);
  cache.set(host, { at: Date.now(), value });
  if (cache.size > 200) cache.delete(cache.keys().next().value as string);
  return value;
}

export async function checkDomain(host: string): Promise<DomainStatus> {
  return (await inspectDomain(host)).status;
}
