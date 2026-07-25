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

test("isPrivateIp blocks extended v6 private ranges (::127, ::10, fe90+, fec0, ff)", () => {
  const v6bad = ["::127.0.0.1", "::10.0.0.1", "fe90::1", "feb0::1", "fec0::1", "ff02::1"];
  for (const ip of v6bad) assert.equal(isPrivateIp(ip), true, `${ip} should be private`);
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

test("safeFetchHtml comprehensive error handling and size limits", async () => {
  let fetchCount = 0;
  const fake = async (host) => {
    if (host === "private.example") return ["192.168.1.1"];
    if (host === "port8080.example") return ["93.184.216.34"];
    return ["93.184.216.34"];
  };
  const pages = {
    "https://ok.example/start": { status: 302, headers: { location: "https://ok.example/final" } },
    "https://ok.example/final": { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, body: "<html><body>שלום</body></html>" },
    "https://ok.example/to-private": { status: 302, headers: { location: "http://192.168.0.1/" } },
    "https://ok.example/big": { status: 200, headers: { "content-type": "text/html" }, body: "x".repeat(200) },
    "https://ok.example/json": { status: 200, headers: { "content-type": "application/json" }, body: "{}" },
    "https://ok.example/content-length-big": { status: 200, headers: { "content-type": "text/html", "content-length": "10485760" }, body: "" },
    "https://ok.example/bad-redirect": { status: 302, headers: { location: "http://" } },
    "https://ok.example/error": { status: 500, headers: { "content-type": "text/html" }, body: "error" },
    "https://ok.example/loop": { status: 302, headers: { location: "https://ok.example/loop" } },
    "https://private.example/": { status: 200, headers: { "content-type": "text/html" }, body: "data" },
  };
  const fetchImpl = async (url, init) => {
    assert(init && init.redirect === "manual", "redirect: manual must be set");
    fetchCount++;
    const p = pages[String(url)];
    if (!p) throw new Error("unexpected url " + url);
    async function* bodyGen() {
      const bodyStr = p.body || "";
      yield Buffer.from(bodyStr, "utf8");
    }
    return {
      status: p.status, ok: p.status >= 200 && p.status < 300,
      headers: { get: (k) => p.headers[k.toLowerCase()] || null },
      body: bodyGen(),
      arrayBuffer: async () => Buffer.from(p.body || "", "utf8"),
    };
  };

  // Basic redirect following
  const okRes = await safeFetchHtml("https://ok.example/start", { resolveAll: fake, fetchImpl });
  assert.match(okRes.html, /שלום/);
  assert.equal(okRes.finalUrl, "https://ok.example/final");

  // Redirect to literal private IP
  let e0;
  try { await safeFetchHtml("https://ok.example/to-private", { resolveAll: fake, fetchImpl }); assert.fail("should reject"); }
  catch (err) { e0 = err; }
  assert.equal(e0.code, "PRIVATE_ADDR");

  // Size limit from content-length header
  let e1;
  try { await safeFetchHtml("https://ok.example/content-length-big", { resolveAll: fake, fetchImpl, maxBytes: 100 }); assert.fail("should reject"); }
  catch (err) { e1 = err; }
  assert.equal(e1.code, "TOO_LARGE", "content-length > maxBytes should reject before reading");

  // Size limit from actual body size
  let e2;
  try { await safeFetchHtml("https://ok.example/big", { resolveAll: fake, fetchImpl, maxBytes: 100 }); assert.fail("should reject"); }
  catch (err) { e2 = err; }
  assert.equal(e2.code, "TOO_LARGE");

  // Wrong content-type
  let e3;
  try { await safeFetchHtml("https://ok.example/json", { resolveAll: fake, fetchImpl }); assert.fail("should reject"); }
  catch (err) { e3 = err; }
  assert.equal(e3.code, "NOT_HTML");

  // Malformed Location header
  let e4;
  try { await safeFetchHtml("https://ok.example/bad-redirect", { resolveAll: fake, fetchImpl }); assert.fail("should reject"); }
  catch (err) { e4 = err; }
  assert.equal(e4.code, "FETCH_FAILED", "malformed redirect location should be FETCH_FAILED");
  assert.match(e4.message, /FETCH_FAILED/);

  // HTTP error status (500)
  let e5;
  try { await safeFetchHtml("https://ok.example/error", { resolveAll: fake, fetchImpl }); assert.fail("should reject"); }
  catch (err) { e5 = err; }
  assert.equal(e5.code, "FETCH_FAILED");
  assert.match(e5.message, /HTTP 500/);

  // Too many redirects (infinite loop)
  fetchCount = 0;
  let e6;
  try { await safeFetchHtml("https://ok.example/loop", { resolveAll: fake, fetchImpl, maxRedirects: 5 }); assert.fail("should reject"); }
  catch (err) { e6 = err; }
  assert.equal(e6.code, "TOO_MANY_REDIRECTS");
  assert.equal(fetchCount, 6, "should fetch 1 initial + 5 redirects = 6 total");

  // Redirect to hostname that resolves to private IP
  const fakePrivate = async (host) => (host === "private.example" ? ["192.168.1.1"] : ["93.184.216.34"]);
  const redirectToPrivatePages = {
    "https://ok.example/": { status: 302, headers: { location: "https://private.example/" } },
  };
  const fetchImplPrivate = async (url, init) => {
    assert(init && init.redirect === "manual");
    const p = redirectToPrivatePages[String(url)] || pages[String(url)];
    if (!p) throw new Error("unexpected url " + url);
    async function* bodyGen() {
      const bodyStr = p.body || "";
      yield Buffer.from(bodyStr, "utf8");
    }
    return {
      status: p.status, ok: p.status >= 200 && p.status < 300,
      headers: { get: (k) => p.headers[k.toLowerCase()] || null },
      body: bodyGen(),
      arrayBuffer: async () => Buffer.from(p.body || "", "utf8"),
    };
  };
  let e7;
  try { await safeFetchHtml("https://ok.example/", { resolveAll: fakePrivate, fetchImpl: fetchImplPrivate }); assert.fail("should reject"); }
  catch (err) { e7 = err; }
  assert.equal(e7.code, "PRIVATE_ADDR", "redirect to private hostname should be rejected");

  // Redirect to port 8080
  const redirectToPort8080Pages = {
    "https://ok.example/": { status: 302, headers: { location: "https://port8080.example:8080/" } },
  };
  const fetchImplPort = async (url, init) => {
    assert(init && init.redirect === "manual");
    const p = redirectToPort8080Pages[String(url)] || pages[String(url)];
    if (!p) throw new Error("unexpected url " + url);
    async function* bodyGen() {
      const bodyStr = p.body || "";
      yield Buffer.from(bodyStr, "utf8");
    }
    return {
      status: p.status, ok: p.status >= 200 && p.status < 300,
      headers: { get: (k) => p.headers[k.toLowerCase()] || null },
      body: bodyGen(),
      arrayBuffer: async () => Buffer.from(p.body || "", "utf8"),
    };
  };
  const fakeOk = async () => ["93.184.216.34"];
  let e8;
  try { await safeFetchHtml("https://ok.example/", { resolveAll: fakeOk, fetchImpl: fetchImplPort }); assert.fail("should reject"); }
  catch (err) { e8 = err; }
  assert.equal(e8.code, "BAD_PORT", "redirect to port 8080 should be rejected");

  // Body read throws AbortError (timeout during streaming) → FETCH_TIMEOUT
  const fetchImplBodyAbort = async (url, init) => {
    assert(init && init.redirect === "manual");
    async function* bodyGen() {
      yield Buffer.from("chunk");
      const domExc = new DOMException("Aborted", "AbortError");
      throw domExc;
    }
    return {
      status: 200, ok: true,
      headers: { get: (k) => k.toLowerCase() === "content-type" ? "text/html" : null },
      body: bodyGen(),
    };
  };
  let e9;
  try { await safeFetchHtml("https://ok.example/", { resolveAll: fakeOk, fetchImpl: fetchImplBodyAbort }); assert.fail("should reject"); }
  catch (err) { e9 = err; }
  assert.equal(e9.code, "FETCH_TIMEOUT", "AbortError during body read should map to FETCH_TIMEOUT");

  // Body read throws Error with .code = "ECONNRESET" (system error) → FETCH_FAILED
  const fetchImplBodySystemError = async (url, init) => {
    assert(init && init.redirect === "manual");
    async function* bodyGen() {
      yield Buffer.from("chunk");
      const err = new Error("Connection reset by peer");
      err.code = "ECONNRESET";
      throw err;
    }
    return {
      status: 200, ok: true,
      headers: { get: (k) => k.toLowerCase() === "content-type" ? "text/html" : null },
      body: bodyGen(),
    };
  };
  let e10;
  try { await safeFetchHtml("https://ok.example/", { resolveAll: fakeOk, fetchImpl: fetchImplBodySystemError }); assert.fail("should reject"); }
  catch (err) { e10 = err; }
  assert.equal(e10.code, "FETCH_FAILED", "system error during body read should map to FETCH_FAILED");
});
