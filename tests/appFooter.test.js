"use strict";

// R12 (owner 2026-09-26): one typed footer for Studio, Reading Room and Mediatheque —
// «Данные на этом устройстве · Сообщить о проблеме · О приложении · Приватность ·
// [О Зале] · Документация» and the version the open page actually runs, always visible.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const SHELLS = { studio: "public/index.html", room: "public/library.html", mediatheque: "public/mediatheque.html" };

function mount(section, extra) {
  const { parseHTML } = require("linkedom");
  const { window, document } = parseHTML(`<!doctype html><html><body><footer id="f" data-lp-footer="${section}"></footer></body></html>`);
  const sandbox = Object.assign({ window, document, navigator: {}, fetch: () => Promise.reject(new Error("offline")), setTimeout, clearTimeout, MessageChannel: class {} }, extra || {});
  Object.assign(window, extra || {});
  vm.runInNewContext(read("public/js/app-footer.js"), sandbox);
  return { window, document, footer: document.getElementById("f") };
}

test("every section renders the same typed items in the same order", () => {
  const base = ["device", "feedback", "about", "privacy", "docs"];
  for (const [section, expected] of [["studio", base], ["mediatheque", base], ["room", ["device", "feedback", "about", "privacy", "section", "docs"]]]) {
    const { footer } = mount(section);
    const ids = [...footer.querySelectorAll("[data-lp-footer-item]")].map((a) => a.getAttribute("data-lp-footer-item"));
    assert.deepEqual(ids, expected, section);
    assert.ok(footer.querySelector(".lp-footer-version"), section + " shows a version slot");
  }
  const room = mount("room").footer;
  assert.equal(room.querySelector('[data-lp-footer-item="section"]').id, "roomAboutLink", "the Room keeps its «О Зале» wiring");
});

test("the version label: running version, plus a note when the server already has a newer one", () => {
  const { window } = mount("studio");
  const label = window.LpAppFooter.versionLabel;
  assert.equal(label("3.11.652", "3.11.652"), "v3.11.652");
  assert.equal(label("3.11.651", "3.11.652"), "v3.11.651 · есть новая версия");
  assert.equal(label(null, "3.11.652"), "v3.11.652");
  assert.equal(label(null, null), "");
});

test("«О приложении» and «Сообщить о проблеме» use the section's own dialogs when it has them", () => {
  const src = read("public/js/app-footer.js");
  assert.match(src, /typeof window\.v3AboutOpen === "function"/);
  assert.match(src, /typeof window\.v3FeedbackOpen === "function"/);
  assert.match(src, /function openSharedAbout\(\)/);
});

test("the service worker reports the version it serves", () => {
  const sw = read("public/sw.js");
  assert.match(sw, /event\.data\.type === "GET_VERSION"[\s\S]{0,200}event\.ports\[0\]\.postMessage\(\{ version: CACHE_VERSION\.replace\(\/\^v\/, ""\) \}\)/);
});

test("every shell mounts the footer once, right after its <footer data-lp-footer>", () => {
  const sw = read("public/sw.js"), server = read("server.js");
  for (const [section, file] of Object.entries(SHELLS)) {
    const html = read(file);
    assert.match(html, new RegExp(`<footer id="[a-zA-Z]+" data-lp-footer="${section}"><\\/footer>\\n<script src="\\/js\\/app-footer\\.js\\?v=\\d+"><\\/script>`), file);
    assert.equal((html.match(/app-footer\.js\?v=/g) || []).length, 1, file);
  }
  assert.match(sw, /"\/js\/app-footer\.js\?v=\d+",/);
  assert.match(server, /"\/js\/app-footer\.js\?v=\d+",/);
});

test("the Studio tour moves into «О приложении»; locale keys exist", () => {
  const studio = read("public/index.html");
  const about = studio.slice(studio.indexOf('<div id="v3AboutModal"'), studio.indexOf('<div id="v3AboutModal"') + 6000);
  assert.match(about, /byokTourStart\(\)[^>]*data-i18n="footer\.tourLink"/);
  assert.doesNotMatch(studio, /id="byokTourReplayLink"/);
  for (const l of ["ru", "en", "he"]) {
    const src = read(`public/i18n/locales/${l}.js`);
    assert.match(src, /appFooter: \{[^}]*\bupdateAvailable: "/, l);
    assert.match(src, /appFooter: \{[^}]*\blabel: "/, l);
  }
});
