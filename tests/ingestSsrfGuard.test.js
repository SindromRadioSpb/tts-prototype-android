"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { isPrivateIp, assertPublicHttpUrl, safeFetchHtml } = require("../ingest/ssrfGuard.js");

test("isPrivateIp blocks loopback/RFC1918/link-local/CGNAT/metadata/v6-private", () => {
  const bad = ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1",
               "169.254.169.254", "0.0.0.0", "100.64.0.1", "::1", "fe80::1", "fd00::1", "fc00::2", "::ffff:10.0.0.1"];
  for (const ip of bad) assert.equal(isPrivateIp(ip), true, ip);
  const good = ["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "2606:4700::1111", "93.184.216.34"];
  for (const ip of good) assert.equal(isPrivateIp(ip), false, ip);
});

test("isPrivateIp fails closed on garbage", () => {
  for (const junk of ["", "999.1.1.1", "1.2.3", "abc"]) assert.equal(isPrivateIp(junk), true, junk);
});

test("assertPublicHttpUrl rejects scheme/credentials/port/literal-private", async () => {
  await assert.rejects(assertPublicHttpUrl("ftp://example.com/"), /BAD_SCHEME/);
  await assert.rejects(assertPublicHttpUrl("file:///etc/passwd"), /BAD_SCHEME/);
  await assert.rejects(assertPublicHttpUrl("not a url"), /BAD_URL/);
  await assert.rejects(assertPublicHttpUrl("http://u:p@example.com/"), /BAD_URL/);
  await assert.rejects(assertPublicHttpUrl("http://example.com:8080/x"), /BAD_PORT/);
  await assert.rejects(assertPublicHttpUrl("http://127.0.0.1/x"), /PRIVATE_ADDR/);
  await assert.rejects(assertPublicHttpUrl("http://[::1]/x"), /PRIVATE_ADDR/);
  await assert.rejects(assertPublicHttpUrl("http://localhost/x"), /PRIVATE_ADDR/);
});

test("assertPublicHttpUrl resolves hostnames and rejects private results", async () => {
  const fake = async (host) => (host === "evil.example" ? ["93.184.216.34", "10.0.0.9"] : ["93.184.216.34"]);
  await assert.rejects(assertPublicHttpUrl("http://evil.example/", { resolveAll: fake }), /PRIVATE_ADDR/);
  const u = await assertPublicHttpUrl("https://ok.example/a", { resolveAll: fake });
  assert.equal(u.hostname, "ok.example");
});

test("safeFetchHtml follows redirects re-validating each hop and caps size", async () => {
  const fake = async () => ["93.184.216.34"];
  const pages = {
    "https://ok.example/start": { status: 302, headers: { location: "https://ok.example/final" } },
    "https://ok.example/final": { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: "<html><body>שלום</body></html>" },
    "https://ok.example/to-private": { status: 302, headers: { location: "http://192.168.0.1/" } },
    "https://ok.example/big": { status: 200, headers: { "content-type": "text/html" }, body: "x".repeat(200) },
    "https://ok.example/json": { status: 200, headers: { "content-type": "application/json" }, body: "{}" },
  };
  const fetchImpl = async (url) => {
    const p = pages[String(url)];
    if (!p) throw new Error("unexpected url " + url);
    return {
      status: p.status, ok: p.status >= 200 && p.status < 300,
      headers: { get: (k) => p.headers[k.toLowerCase()] || null },
      arrayBuffer: async () => Buffer.from(p.body || "", "utf8"),
    };
  };
  const okRes = await safeFetchHtml("https://ok.example/start", { resolveAll: fake, fetchImpl });
  assert.match(okRes.html, /שלום/);
  assert.equal(okRes.finalUrl, "https://ok.example/final");
  await assert.rejects(safeFetchHtml("https://ok.example/to-private", { resolveAll: fake, fetchImpl }), /PRIVATE_ADDR/);
  await assert.rejects(safeFetchHtml("https://ok.example/big", { resolveAll: fake, fetchImpl, maxBytes: 100 }), /TOO_LARGE/);
  await assert.rejects(safeFetchHtml("https://ok.example/json", { resolveAll: fake, fetchImpl }), /NOT_HTML/);
});
