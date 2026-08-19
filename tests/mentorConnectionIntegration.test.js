"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Room loads the connection core before Mentor Home", () => {
  const html = read("public/library.html");
  const core = html.indexOf("/js/mentor-connection-core.js");
  const home = html.indexOf("/js/mentor-home.js");
  assert.ok(core >= 0 && home > core);
});

test("Mentor journey reuses the existing account and sync writers", () => {
  const home = read("public/js/mentor-home.js");
  const room = read("public/js/library-ui.js");
  assert.match(home, /MentorConnection\.deriveJourney/);
  assert.doesNotMatch(home, /\/api\/auth\/bootstrap-login|roomCloudSecret/);
  assert.match(room, /mentorConnectionState/);
  assert.match(room, /openAccountSync/);
  assert.match(room, /runMentorSync/);
});

test("journey copy is complete in RU EN and HE", () => {
  for (const locale of ["ru", "en", "he"]) {
    const source = read(`public/i18n/locales/${locale}.js`);
    for (const key of ["connectionTitle", "accountTitle", "syncTitle", "telegramTitle", "aiTitle", "optional", "locked"]) {
      assert.match(source, new RegExp(`${key}\\s*:`), `${locale} missing ${key}`);
    }
  }
});

test("journey has visible focus and mobile-size controls", () => {
  const html = read("public/library.html");
  assert.match(html, /\.mentor-connection-action[^}]*min-height:\s*44px/s);
  assert.match(html, /\.mentor-connection-action:focus-visible/);
  assert.match(html, /\.mentor-connection-status\[aria-live=["']polite["']\]/);
});
