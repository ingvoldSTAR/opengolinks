import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:https";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { probeDetailed } from "../src/lib/domainStatus.ts";
import { PING_BODY } from "../src/lib/ping.ts";

// A throwaway certificate for "localhost", trusted only for these tests.
let cert = "";
let key = "";
const servers: Server[] = [];

async function serve(handler: (req: unknown, res: { writeHead: (c: number, h?: object) => void; end: (b?: string) => void }) => void): Promise<number> {
  const s = createServer({ key, cert }, handler as never);
  servers.push(s);
  s.listen(0, "127.0.0.1");
  await once(s, "listening");
  return (s.address() as AddressInfo).port;
}

before(() => {
  const dir = mkdtempSync(join(tmpdir(), "probe-"));
  writeFileSync(join(dir, "o.cnf"), "[req]\ndistinguished_name=dn\nx509_extensions=v3\nprompt=no\n[dn]\nCN=localhost\n[v3]\nsubjectAltName=DNS:localhost\n");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(dir, "k.pem"), "-out", join(dir, "c.pem"), "-days", "1", "-config", join(dir, "o.cnf")], { stdio: "ignore" });
  cert = readFileSync(join(dir, "c.pem"), "utf8");
  key = readFileSync(join(dir, "k.pem"), "utf8");
  (https.globalAgent.options as { ca?: string }).ca = cert;
});
after(() =>
  servers.forEach((s) => {
    s.closeAllConnections();
    s.close();
  }),
);

test("an address that answers with this app's reply is ok", async () => {
  const port = await serve((_req, res) => res.end(PING_BODY));
  assert.deepEqual(await probeDetailed("localhost", "127.0.0.1", port, 1500), { ok: true, reason: "answers" });
});

test("another site's page is reported as not this app", async () => {
  const wrong = await serve((_req, res) => res.end("<html>parked</html>"));
  assert.match((await probeDetailed("localhost", "127.0.0.1", wrong, 1500)).reason, /not with this app's reply/);
  const missing = await serve((_req, res) => {
    res.writeHead(404);
    res.end("nope");
  });
  assert.match((await probeDetailed("localhost", "127.0.0.1", missing, 1500)).reason, /HTTP 404/);
});

test("connected but never answered (what a mis-routed parked domain looks like) is named as such, and quickly", async () => {
  const port = await serve(() => {
    /* accepts the connection and the request, and never replies */
  });
  const started = Date.now();
  const r = await probeDetailed("localhost", "127.0.0.1", port, 700);
  assert.equal(r.ok, false);
  assert.match(r.reason, /connected, but the request got no reply/);
  assert.ok(Date.now() - started < 2500);
});

test("a closed port and a wrong certificate are told apart", async () => {
  const dead = await serve((_req, res) => res.end("x"));
  const stopped = servers.pop()!;
  stopped.closeAllConnections();
  await new Promise((r) => stopped.close(r));
  const refused = await probeDetailed("localhost", "127.0.0.1", dead, 1500);
  assert.match(refused.reason, /refused|could not/);
  const live = await serve((_req, res) => res.end(PING_BODY));
  const mismatch = await probeDetailed("not-localhost.example", "127.0.0.1", live, 1500);
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.reason, /certificate problem/);
});

test("all addresses are probed together, so one dead address does not slow the others", async () => {
  const good = await serve((_req, res) => res.end(PING_BODY));
  const silent = await serve(() => {});
  const started = Date.now();
  const results = await Promise.all([probeDetailed("localhost", "127.0.0.1", silent, 900), probeDetailed("localhost", "127.0.0.1", good, 900)]);
  assert.equal(results[1].ok, true);
  assert.equal(results[0].ok, false);
  assert.ok(Date.now() - started < 1800);
});
