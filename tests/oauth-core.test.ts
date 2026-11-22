import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { checkRedirectUri, cleanClientName, isValidChallenge, randomToken, redirectMatches, sameResource, sha256Hex, verifyPkce } from "../src/lib/oauth-core.ts";

const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const challenge = createHash("sha256").update(verifier).digest("base64url");

test("PKCE accepts the matching verifier and nothing else", () => {
  assert.equal(verifyPkce(verifier, challenge), true);
  assert.equal(verifyPkce(verifier + "x", challenge), false);
  assert.equal(verifyPkce("short", challenge), false);
  assert.equal(verifyPkce(verifier, challenge.slice(1)), false);
  assert.equal(verifyPkce("", ""), false);
});

test("a challenge must look like a SHA-256 hash", () => {
  assert.equal(isValidChallenge(challenge), true);
  assert.equal(isValidChallenge(verifier), true); // 43 characters too, the format is all that is checked
  assert.equal(isValidChallenge("plain"), false);
  assert.equal(isValidChallenge(challenge + "="), false);
});

test("redirect URIs: https, local http and app schemes are fine", () => {
  for (const ok of ["https://claude.ai/api/mcp/auth_callback", "http://localhost:6274/oauth/callback", "http://127.0.0.1/cb", "claude://oauth/callback", "cursor://anysphere.cursor-mcp/oauth/callback"]) {
    assert.equal(checkRedirectUri(ok).ok, true, ok);
  }
});

test("redirect URIs: dangerous or unsafe targets are refused", () => {
  for (const bad of ["http://evil.example/cb", "javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "https://a.example/cb#frag", "https://user:pw@a.example/cb", "not a url", "", "ftp://a.example/x", "https://" + "a".repeat(600)]) {
    assert.equal(checkRedirectUri(bad).ok, false, bad);
  }
});

test("redirect matching is exact, with a free port only for local http", () => {
  assert.equal(redirectMatches(["https://a.example/cb"], "https://a.example/cb"), true);
  assert.equal(redirectMatches(["https://a.example/cb"], "https://a.example/cb2"), false);
  assert.equal(redirectMatches(["https://a.example/cb"], "https://a.example:444/cb"), false);
  assert.equal(redirectMatches(["http://localhost:1111/cb"], "http://localhost:2222/cb"), true);
  assert.equal(redirectMatches(["http://localhost:1111/cb"], "http://localhost:2222/other"), false);
  assert.equal(redirectMatches(["http://localhost:1111/cb"], "http://127.0.0.1:2222/cb"), false);
  assert.equal(redirectMatches(["https://a.example/cb"], "http://localhost:2222/cb"), false);
});

test("hashes and tokens", () => {
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.notEqual(randomToken(), randomToken());
  assert.ok(randomToken(32).length >= 43);
});

test("client names are cleaned", () => {
  assert.equal(cleanClientName("  Claude <b>x</b>\n"), "Claude bx/b");
  assert.equal(cleanClientName(undefined), "Unnamed app");
  assert.equal(cleanClientName("x".repeat(200)).length, 80);
});

test("a resource may differ from ours only by a trailing slash", () => {
  assert.equal(sameResource("https://a.example/api/mcp", "https://a.example/api/mcp"), true);
  assert.equal(sameResource("https://a.example/api/mcp/", "https://a.example/api/mcp"), true);
  assert.equal(sameResource("https://a.example/api/other", "https://a.example/api/mcp"), false);
  assert.equal(sameResource("https://b.example/api/mcp", "https://a.example/api/mcp"), false);
});
