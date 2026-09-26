"use strict";

// R6 (UI release program, audit P0-2, P1-2, P2-11): one navigation for the three surfaces —
// Зал · Медиатека · Студия · Повторение — a bottom bar on phones (hidden in an open text, owner
// option 2 of 2026-09-26) and a top strip on desktops. Icons come from the shared sprite.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const SHELLS = ["public/index.html", "public/library.html", "public/mediatheque.html"];

test("the nav module renders the four sections with sprite icons and marks the current one", () => {
  const { parseHTML } = require("linkedom");
  const vm = require("node:vm");
  for (const [url, current] of [["/library.html", "room"], ["/mediatheque.html", "mediatheque"], ["/", "studio"], ["/library.html#review", "review"]]) {
    const u = new URL("https://x" + url);
    const { window, document } = parseHTML("<!doctype html><html><body></body></html>");
    const sandbox = { window, document, location: { pathname: u.pathname, hash: u.hash } };
    window.location = sandbox.location;
    vm.runInNewContext(read("public/js/app-nav.js"), sandbox);
    window.LpAppNav.mount();
    const nav = document.querySelector("nav.lp-app-nav");
    assert.ok(nav, "nav mounted");
    const links = [...nav.querySelectorAll("a[data-nav-id]")];
    assert.deepEqual(links.map((a) => a.getAttribute("data-nav-id")), ["room", "mediatheque", "studio", "review"]);
    assert.deepEqual(links.map((a) => a.getAttribute("href")), ["/library.html", "/mediatheque.html", "/", "/library.html#review"]);
    assert.equal(nav.querySelector('[aria-current="page"]').getAttribute("data-nav-id"), current, url);
    for (const a of links) assert.match(a.innerHTML, /<use href="\/icons\/linguistpro-ui\.svg#lp-/);
    assert.ok(document.body.classList.contains("lp-has-app-nav"));
  }
});

test("every shell loads the nav, and the service worker precaches it", () => {
  const sw = read("public/sw.js");
  for (const shell of SHELLS) {
    const html = read(shell);
    // Its own line right after the real <body> line — never inside an inline script (a comment
    // mentioning "<body>" once caught a naive insertion).
    assert.match(html, /^<body[^>]*>\n<script src="\/js\/app-nav\.js\?v=\d+"><\/script>$/m, shell + ": mounted right after <body>");
    assert.equal((html.match(/app-nav\.js\?v=/g) || []).length, 1, shell + ": loaded once");
    assert.match(html, /<link rel="stylesheet" href="\/css\/app-nav\.css\?v=\d+">/, shell);
  }
  assert.match(sw, /"\/js\/app-nav\.js\?v=\d+",/);
  assert.match(sw, /"\/css\/app-nav\.css\?v=\d+",/);
});

test("phone bar: 56px plus the safe area, 44px targets, hidden in an open text", () => {
  const css = read("public/css/app-nav.css");
  assert.match(css, /@media \(max-width: 599px\)/);
  assert.match(css, /env\(safe-area-inset-bottom/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /body\.room-reading \.lp-app-nav \{ display: none; \}/);
  assert.match(css, /body\.lp-has-app-nav \.room-mediatheque-entry,/, "the nav replaces the Room entry");
  assert.match(css, /body\.lp-has-app-nav \.ml-crossnav/, "and the Mediatheque cross links");
});

// R7: on a desktop the sticky strip covered every scrollIntoView({ block: "start" }) target
// (the Studio result panel landed at top 0, under a 45px nav).
test("desktop: scroll targets land below the sticky strip", () => {
  const css = read("public/css/app-nav.css");
  assert.match(css, /@media \(min-width: 600px\) \{[\s\S]*?html:has\(> body\.lp-has-app-nav\) \{ scroll-padding-top: 56px; \}/);
});

// R7 verification: on a phone the fixed toasts and the Mediatheque selection bar sat on the bar.
test("phone: toasts and the selection bar clear the navigation bar", () => {
  const css = read("public/css/app-nav.css");
  assert.match(css, /body\.lp-has-app-nav:not\(\.room-reading\) \.room-toast \{ bottom: calc\(72px \+ env\(safe-area-inset-bottom, 0px\)\); \}/);
  assert.match(css, /body\.lp-has-app-nav \.ml-toast \{ inset-block-end: calc\(72px \+ env\(safe-area-inset-bottom, 0px\)\); \}/);
  assert.match(css, /body\.lp-has-app-nav \.ml-bulk\[data-has-selection=true\] \{ bottom: calc\(68px \+ env\(safe-area-inset-bottom, 0px\)\); \}/);
});

test("nav labels exist in every locale and the Room is called the same everywhere", () => {
  for (const locale of ["ru", "en", "he"]) {
    const src = read(`public/i18n/locales/${locale}.js`);
    for (const key of ["room", "mediatheque", "studio", "review", "label"]) {
      assert.match(src, new RegExp(`appNav: \\{[^}]*\\b${key}:`), `${locale}: appNav.${key}`);
    }
  }
  assert.doesNotMatch(read("public/i18n/locales/ru.js"), /room: "Учебный зал"/);
});

test("the Room opens review from #review", () => {
  assert.match(read("public/js/library-ui.js"), /location\.hash === '#review'[\s\S]{0,200}startDueReview\(\)/);
});
