"use strict";

// R5a (UI release program, audit P0-4): in «Авто» with a dark OS theme the Studio heading was
// invisible (#F1F5F9 on a white card, 1.1:1). Every dark override is written as body.theme-dark,
// but «Авто» left the class off. Auto now follows the OS by toggling the same class.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "public/index.html"), "utf8").replace(/\r\n/g, "\n");

test("the inline boot marks an auto profile dark when the OS is dark", () => {
  const boot = html.slice(html.indexOf("var pending = function() {"), html.indexOf("theme-density-", html.indexOf("var pending = function() {")));
  assert.match(boot, /matchMedia\("\(prefers-color-scheme: dark\)"\)\.matches/);
  assert.match(boot, /b\.classList\.add\("theme-dark"\)/);
});

test("v3ThemeApply in auto follows the OS, and an OS switch re-applies", () => {
  const apply = html.slice(html.indexOf("function v3ThemeApply(choice)"), html.indexOf("function v3ThemeCycle()"));
  assert.match(apply, /choice === "auto"[\s\S]{0,160}prefers-color-scheme: dark/);
  const listener = html.slice(html.indexOf('window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change"'), html.indexOf('window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change"') + 500);
  assert.match(listener, /v3ThemeApply\("auto"\)/);
});

// R5a (audit P0-5): the Room «Медиатека» entry rendered in the browser's default link blue
// (#0000EE, 1.56:1 in the dark theme) and, on a desktop, outside the header's column.
test("the Room Mediatheque entry uses the Room tokens and the header column", () => {
  const room = fs.readFileSync(path.join(__dirname, "..", "public/library.html"), "utf8");
  const rule = room.slice(room.indexOf(".room-mediatheque-entry a{"), room.indexOf("}", room.indexOf(".room-mediatheque-entry a{")));
  assert.match(rule, /color:var\(--accent\)/);
  assert.match(rule, /background:var\(--bg-card\)/);
  assert.match(room, /\.room-header-row, \.room-tabs, \.room-mediatheque-entry \{ max-width: 1120px; margin-inline: auto; \}/);
});
