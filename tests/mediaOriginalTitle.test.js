"use strict";

// O-021: the HE UI showed a Mediatheque material's Russian title. YouTube keeps the original
// (Hebrew) video title; the server fetches it once per video via oEmbed and caches it.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createOriginalTitleStore, isVideoId } = require("../media/originalTitle");

test("only real YouTube ids are accepted", () => {
  assert.equal(isVideoId("njtNjn4ya2U"), true);
  assert.equal(isVideoId("njtNjn4ya2U&x=1"), false);
  assert.equal(isVideoId("../etc/passwd"), false);
  assert.equal(isVideoId(""), false);
});

test("a title is fetched once, persisted, and failures are cached briefly", async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lp-otitle-")), "titles.json");
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    if (url.includes("bad00000000")) return { ok: false, status: 404, json: async () => ({}) };
    assert.match(url, /^https:\/\/www\.youtube\.com\/oembed\?format=json&url=https%3A%2F%2Fwww\.youtube\.com%2Fwatch%3Fv%3D/);
    return { ok: true, status: 200, json: async () => ({ title: "בדידות בערב החג | שיחה נכנסת - הפרק המלא", author_name: "yes tv (יס)" }) };
  };
  let now = 1_000_000;
  const store = createOriginalTitleStore({ file, fetchImpl, now: () => now });
  const a = await store.getMany(["njtNjn4ya2U", "bad00000000"]);
  assert.deepEqual(a.njtNjn4ya2U, { title: "בדידות בערב החג | שיחה נכנסת - הפרק המלא", author: "yes tv (יס)" });
  assert.equal(a.bad00000000, null);
  assert.equal(calls, 2);
  await store.getMany(["njtNjn4ya2U", "bad00000000"]);
  assert.equal(calls, 2, "both answers are cached");
  const reopened = createOriginalTitleStore({ file, fetchImpl, now: () => now });
  assert.deepEqual((await reopened.getMany(["njtNjn4ya2U"])).njtNjn4ya2U.title, "בדידות בערב החג | שיחה נכנסת - הפרק המלא");
  assert.equal(calls, 2, "persisted across restarts");
  now += 2 * 24 * 3600 * 1000;
  await reopened.getMany(["bad00000000"]);
  assert.equal(calls, 3, "a failure is retried after a day");
});

test("the endpoint validates, batches and rate-limits", () => {
  const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
  assert.match(server, /app\.get\("\/api\/media\/original-title", rlOriginalTitle,/);
  assert.match(server, /\.filter\(isVideoId\)\.slice\(0, 60\)/);
});

test("the HE interface shows the original title; other languages keep the author's title", async () => {
  const { parseHTML } = require("linkedom");
  const vm = require("node:vm");
  const { window, document } = parseHTML('<!doctype html><html lang="he"><body><h3><a data-orig-video="njtNjn4ya2U">ЭРАН. Входящий звонок -1</a></h3></body></html>');
  let locale = "he";
  window.appGetLocale = () => locale;
  const sandbox = { window, document, fetch: async () => ({ ok: true, json: async () => ({ titles: { njtNjn4ya2U: { title: "שיחה נכנסת", author: "yes" } } }) }), Promise };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "public/js/original-title.js"), "utf8"), sandbox);
  const a = document.querySelector("a");
  await window.LpOriginalTitle.paint(document);
  assert.equal(a.textContent, "שיחה נכנסת");
  assert.equal(a.getAttribute("title"), "ЭРАН. Входящий звонок -1");
  locale = "ru";
  await window.LpOriginalTitle.paint(document);
  assert.equal(a.textContent, "ЭРАН. Входящий звонок -1");
});

test("the Mediatheque and the Room reader opt in; every shell loads the module", () => {
  const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
  const ml = read("public/js/mediatheque-ui.js");
  assert.match(ml, /data-orig-video="\$\{esc\(item\.videoId \|\| ''\)\}"/);
  assert.match(ml, /window\.LpOriginalTitle && window\.LpOriginalTitle\.paint\(root\)/);
  const room = read("public/js/library-ui.js");
  assert.match(room, /titleEl\.setAttribute\('data-orig-video', audio\.video\.videoId\)/);
  assert.match(room, /titleEl\.removeAttribute\('data-orig-video'\); titleEl\.removeAttribute\('data-lp-ru-title'\);/);
  for (const f of ["public/library.html", "public/mediatheque.html"]) assert.equal((read(f).match(/<script src="\/js\/original-title\.js\?v=\d+"><\/script>/g) || []).length, 1, f);
  assert.match(read("public/sw.js"), /"\/js\/original-title\.js\?v=\d+",/);
  assert.match(read("server.js"), /"\/js\/original-title\.js\?v=\d+",/);
});
