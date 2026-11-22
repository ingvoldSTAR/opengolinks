import assert from "node:assert/strict";
import { test } from "node:test";
import { invitationMail, normaliseEmail, validEmail } from "../src/lib/email-core.ts";
import { checkMicrosoftClaims, decodeJwtPayload } from "../src/lib/jwt-core.ts";
import { microsoftConfigProblems } from "../src/lib/config-core.ts";
import { describeMicrosoftError } from "../src/lib/ms-error.ts";

test("email addresses", () => {
  assert.equal(normaliseEmail("  Alex@Example.COM "), "alex@example.com");
  for (const ok of ["a@b.co", "first.last+tag@example.com", "x@sub.example.com"]) assert.equal(validEmail(ok), true, ok);
  for (const bad of ["", "a", "a@b", "a@b.", "a b@c.com", "a@@b.com", "<x>@b.com", "a@b.c", "a@b.com,c@d.com", "x".repeat(250) + "@b.com"]) assert.equal(validEmail(bad), false, bad);
});

test("the invitation email escapes names and addresses in HTML", () => {
  const m = invitationMail({ appName: "Example App", inviter: '<img src=x onerror=alert(1)> & "Co"', role: "member", link: "https://go.example/admin/invite/abc?x=1&y=2", expires: "1 Dec 2026", to: "a@b.com" });
  assert.ok(!m.html.includes("<img"));
  assert.ok(m.html.includes("&lt;img") && m.html.includes("&amp;") && m.html.includes("&quot;Co&quot;"));
  assert.ok(m.html.includes("x=1&amp;y=2"));
  assert.ok(m.text.includes("https://go.example/admin/invite/abc?x=1&y=2"));
  assert.match(invitationMail({ appName: "Example App", inviter: "E", role: "admin", link: "l", expires: "d", to: "a@b.com" }).text, /as an admin/);
});

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const token = (p: unknown) => `${b64({ alg: "RS256" })}.${b64(p)}.sig`;
const tenant = "11111111-2222-3333-4444-555555555555";
const good = { tid: tenant, aud: "client-1", iss: `https://login.microsoftonline.com/${tenant}/v2.0`, nonce: "n1", exp: 2_000_000_000, preferred_username: "Alex@Example.com", email: "alex@example.com", name: "Alex" };
const expect = { tenant, clientId: "client-1", nonce: "n1", now: 1_900_000_000 };

test("Microsoft ID token claims", () => {
  assert.equal(decodeJwtPayload("nope"), null);
  assert.equal(decodeJwtPayload("a.%%%.c"), null);
  const ok = checkMicrosoftClaims(decodeJwtPayload(token(good)), expect);
  assert.deepEqual(ok, { ok: true, emails: ["alex@example.com"], name: "Alex" });
  const upnOnly = checkMicrosoftClaims({ ...good, email: undefined, preferred_username: "x@y.com" }, expect);
  assert.deepEqual(upnOnly.ok && upnOnly.emails, ["x@y.com"]);
});

test("Microsoft ID tokens for another tenant, app, nonce, issuer or time are refused", () => {
  const bad = (change: Record<string, unknown>) => checkMicrosoftClaims({ ...good, ...change }, expect);
  assert.equal(bad({ tid: "99999999-2222-3333-4444-555555555555" }).ok, false);
  assert.equal(bad({ aud: "other" }).ok, false);
  assert.equal(bad({ nonce: "n2" }).ok, false);
  assert.equal(bad({ nonce: undefined }).ok, false);
  assert.equal(bad({ iss: "https://evil.example/v2.0" }).ok, false);
  assert.equal(bad({ exp: 1_000 }).ok, false);
  assert.equal(bad({ email: undefined, preferred_username: "no-at-sign" }).ok, false);
  assert.equal(checkMicrosoftClaims(null, expect).ok, false);
});

test("Microsoft's error reply is reduced to its first line", () => {
  const reply = { error: "invalid_client", error_description: "AADSTS7000215: Invalid client secret provided. Ensure the secret being sent is the client secret value, not the client secret ID.\r\nTrace ID: abc\r\nCorrelation ID: def\r\nTimestamp: 2026-11-22" };
  const text = describeMicrosoftError(reply);
  assert.match(text, /^invalid_client, AADSTS7000215: Invalid client secret provided/);
  assert.ok(!/Trace ID|Correlation|Timestamp/.test(text));
  assert.equal(describeMicrosoftError({ error: "invalid_client" }), "invalid_client");
  assert.equal(describeMicrosoftError(null), "");
  assert.equal(describeMicrosoftError({ error: 5, error_description: { x: 1 } }), "");
  assert.ok(describeMicrosoftError({ error_description: "x".repeat(1000) }).length <= 240);
});

test("Microsoft's trace is cut off even when it is not on a new line", () => {
  const inline = { error: "invalid_request", error_description: "AADSTS900023: Specified tenant identifier 'x' is neither a valid DNS name, nor a valid external domain. Trace ID: 0c68-1 Correlation ID: fa65 Timestamp: 2026" };
  assert.equal(describeMicrosoftError(inline), "invalid_request, AADSTS900023: Specified tenant identifier 'x' is neither a valid DNS name, nor a valid external domain.");
});

const settings = { MICROSOFT_TENANT_ID: "01234567-89ab-4cde-8f01-23456789abcd", MICROSOFT_CLIENT_ID: "11111111-2222-3333-4444-555555555555", MICROSOFT_CLIENT_SECRET: "s", MAIL_FROM: "go@example.com" };

test("Microsoft settings: complete and well formed is fine, and none at all means off", () => {
  assert.deepEqual(microsoftConfigProblems(settings), []);
  assert.deepEqual(microsoftConfigProblems({}), []);
  assert.deepEqual(microsoftConfigProblems({ ...settings, MICROSOFT_TENANT_ID: settings.MICROSOFT_TENANT_ID.toUpperCase() }), []);
});

test("Microsoft settings: a mistyped ID is described, not echoed as a Microsoft error", () => {
  const short = microsoftConfigProblems({ ...settings, MICROSOFT_TENANT_ID: "1234567-89ab-4cde-8f01-23456789abcd" });
  assert.equal(short.length, 1);
  assert.match(short[0], /MICROSOFT_TENANT_ID is not a valid tenant ID \(it has 35 characters\)/);
  assert.match(microsoftConfigProblems({ ...settings, MICROSOFT_CLIENT_ID: "nope" })[0], /MICROSOFT_CLIENT_ID is not a valid application ID/);
  assert.match(microsoftConfigProblems({ ...settings, MICROSOFT_TENANT_ID: "example.com" })[0], /tenant ID/);
});

test("Microsoft settings: missing pieces and a bad mailbox are named, and the secret is never repeated", () => {
  const p = microsoftConfigProblems({ MICROSOFT_TENANT_ID: settings.MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID: settings.MICROSOFT_CLIENT_ID, MAIL_FROM: "not-an-address" });
  assert.ok(p.includes("MICROSOFT_CLIENT_SECRET is missing.") && p.includes("MAIL_FROM is not an email address."));
  assert.ok(microsoftConfigProblems({ MAIL_FROM: "go@example.com" })[0].includes("MAIL_FROM is set"));
  assert.ok(!JSON.stringify(microsoftConfigProblems({ ...settings, MICROSOFT_CLIENT_SECRET: "super-secret-value", MICROSOFT_TENANT_ID: "bad" })).includes("super-secret-value"));
});
