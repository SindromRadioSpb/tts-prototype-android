"use strict";

// Audit P2-6 (R11 leftover): the «Подключите свои API-ключи» window inherited the fixed
// .v3-modal-panel height (min(720px, 100vh - 32px)) — about 60% of it stayed empty white.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

test("the BYOK window sizes to its content, with 44px actions and no emoji icon", () => {
  const html = read("public/index.html");
  assert.match(html, /#byokOnboardingModal \.v3-modal-panel \{ height: auto; \}/);
  assert.match(html, /#byokOnboardingModal \.v3-modal-panel :is\(button, a\.btn-primary\) \{ min-height: 44px;/);
  for (const l of ["ru", "en", "he"]) {
    const box = { window: {} };
    vm.runInNewContext(read(`public/i18n/locales/${l}.js`), box);
    assert.doesNotMatch(box.window.I18N_LOCALES[l].byokOnboarding.btnTour, /^\p{Extended_Pictographic}/u, l);
  }
  assert.doesNotMatch(html, /data-i18n="byokOnboarding\.btnTour">🎯/);
});
