"use strict";

// R11a (UI release program, audit P1-9, P2-4): one set of line icons instead of emoji on the
// reading and words surfaces and on Studio's entry buttons; a user footer without the developer
// credit, GitHub, diagnostics and version (they live in «О Зале» / «О приложении»).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const locale = (l) => { const box = { window: {} }; vm.runInNewContext(read(`public/i18n/locales/${l}.js`), box); return box.window.I18N_LOCALES[l]; };
const at = (obj, key) => key.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
const EMOJI_START = /^\p{Extended_Pictographic}/u;

const NEW_ICONS = {
  "lp-icon-calendar": ["calendar.svg", "c5c59382ebf9c3c2ce6426bd9f36fdda7ef8f0a96bffb8d8316ab38dc4dcc982"],
  "lp-icon-chart": ["chart-column.svg", "80664a4c5ca1bca10bcb88c1a99f62593c94d61d72d3a4bbf577eb3f3ea4da57"],
  "lp-icon-import": ["inbox.svg", "1838482c53d0846badef9be96fdcf7a167064241bd4891efa995c77ebec5f187"],
  "lp-icon-sparkle": ["sparkles.svg", "f5499f33f09d7158151e9bd2ec0faf79ff8fb57292f84fdd7286d96d0f0424d8"],
};

test("the sprite gains four audited Lucide 1.27.0 icons with exact provenance", () => {
  const sprite = read("public/icons/linguistpro-ui.svg");
  const prov = read("public/icons/linguistpro-ui.PROVENANCE.md");
  for (const [id, [file, sha]] of Object.entries(NEW_ICONS)) {
    assert.match(sprite, new RegExp(`<symbol id="${id}" viewBox="0 0 24 24">`), id);
    assert.match(prov, new RegExp("\\| `" + id + "` \\| `icons/" + file.replace(".", "\\.") + "` \\| `" + sha + "` \\|"), id);
  }
  assert.match(sprite, /<symbol id="lp-icon-calendar" viewBox="0 0 24 24">\s*<path d="M8 2v4" \/>\s*<path d="M16 2v4" \/>\s*<rect width="18" height="18" x="3" y="4" rx="2" \/>\s*<path d="M3 10h18" \/>\s*<\/symbol>/);
});

test("icon-only and icon-led controls use the sprite, not emoji", () => {
  const html = read("public/library.html");
  assert.match(html, /id="readerFindToggle"[^>]*data-room-icon="lp-icon-search"[^>]*><span class="room-icon-fallback" aria-hidden="true">🔍<\/span><\/button>/);
  const morph = read("public/js/reader-morph.js");
  assert.match(morph, /class="rm-speak" data-rm-speak aria-label="' \+ escapeHtml\(tt\("room\.morph\.pronounce", "Произнести"\)\) \+ '">' \+ ICON_AUDIO \+ '<\/button>'/);
  assert.match(morph, /var ICON_AUDIO = '<svg class="lp-icon" aria-hidden="true" focusable="false"><use href="\/icons\/linguistpro-ui\.svg#lp-icon-audio"><\/use><\/svg>';/);
  assert.match(morph, /class="rm-explain-btn" data-rm-explain aria-expanded="false">' \+ ICON_MENTOR \+ ' '/);
  const ui = read("public/js/library-ui.js");
  assert.doesNotMatch(ui, /class: 'room-study-speak[^']*', text: '🔊'/);
  assert.match(ui, /calBtn\.replaceChildren\(roomIcon\('lp-icon-calendar', '📅'\), document\.createTextNode\(tt\('room\.morph\.study\.heatShort', 'Календарь'\)\)\);/);
  assert.match(ui, /repBtn\.replaceChildren\(roomIcon\('lp-icon-chart', '📊'\), document\.createTextNode\(tt\('room\.morph\.study\.reportShort', 'Запоминание'\)\)\);/);
  const studio = read("public/index.html");
  assert.match(studio, /<span data-studio-icon="lp-icon-import" aria-hidden="true"><span class="studio-icon-fallback" aria-hidden="true">📥<\/span><\/span> <span data-i18n="studio\.import\.button">/);
  assert.match(studio, /<span data-studio-icon="lp-icon-sparkle" aria-hidden="true"><span class="studio-icon-fallback" aria-hidden="true">✨<\/span><\/span> <span data-i18n="studio\.retell\.button">/);
});

const STRIPPED = [
  "room.study.toggle", "room.morph.statusToggle", "room.morph.contextToggle",
  "room.morph.study.open", "room.morph.study.title", "room.morph.study.bulkIgnore",
  "room.morph.study.modeList", "room.morph.study.modeTrain", "room.morph.study.toList", "room.morph.study.again",
  "room.morph.study.leechIgnore", "room.morph.study.chRead", "room.morph.study.chListen",
  "room.morph.study.chReverse", "room.morph.study.chDictate",
  "classic.speak", "classic.speakAgain", "classic.save", "classic.tableSettingsLabel",
  "footer.privacyBadge", "footer.tourLink", "footer.feedbackLink",
];

test("text labels carry no emoji prefix in ru, en and he", () => {
  for (const l of ["ru", "en", "he"]) {
    const loc = locale(l);
    for (const key of STRIPPED) {
      const v = at(loc, key);
      assert.equal(typeof v, "string", `${l} ${key} exists`);
      assert.doesNotMatch(v, EMOJI_START, `${l} ${key} = ${v}`);
    }
  }
  const ru = locale("ru");
  assert.equal(at(ru, "room.morph.study.title"), "Мои слова");
  assert.equal(at(ru, "classic.save"), "Сохранить");
});

test("the user footer keeps six links or fewer; credit, GitHub, diagnostics and version move to «About»", () => {
  for (const [file, id] of [["public/library.html", "roomFooter"], ["public/index.html", "appFooter"]]) {
    const html = read(file);
    const footer = html.match(new RegExp(`<footer[^>]*id="${id}"[\\s\\S]*?<\\/footer>`))[0];
    assert.doesNotMatch(footer, /footer\.madeBy|footer\.githubLink|dashboard\.secDiag|Version"|footer-version/, file);
    assert.ok((footer.match(/<a\b/g) || []).length <= 6, file + " has ≤ 6 links");
  }
  const room = read("public/library.html");
  const about = room.match(/<div id="roomAbout"[\s\S]*?<\/section>[\s\S]*?<\/div>\n<\/div>/)[0];
  assert.match(about, /data-i18n="footer\.githubLink"/);
  assert.match(about, /data-i18n="dashboard\.secDiag"/);
  assert.match(about, /data-i18n="footer\.madeBy"/);
  const studio = read("public/index.html");
  const studioAbout = studio.slice(studio.indexOf('<div id="v3AboutModal"'), studio.indexOf('<div id="v3AboutModal"') + 4000);
  assert.match(studioAbout, /data-i18n="dashboard\.secDiag"/);
  assert.match(studioAbout, /data-i18n="footer\.madeBy"/);
});

test("every speaker button in the words sheet and training carries the audio icon", () => {
  const ui = read("public/js/library-ui.js");
  assert.match(ui, /function roomSpeakButton\(opts\) \{\s*const b = el\('button', opts\);\s*b\.appendChild\(roomIcon\('lp-icon-audio', '🔊'\)\);/);
  assert.equal((ui.match(/el\('button', \{ class: 'room-(study-speak|train-bigplay)/g) || []).length, 0, "no speaker button without the icon");
  assert.ok((ui.match(/roomSpeakButton\(\{ class: 'room-(study-speak|train-bigplay)/g) || []).length >= 7);
});

test("the reader tip names «Мои слова» and carries no emoji icons", () => {
  for (const l of ["ru", "en", "he"]) {
    const tip = at(locale(l), "room.onboard");
    for (const k of ["readerTip1", "readerTip2"]) assert.doesNotMatch(tip[k], EMOJI_START, l + " " + k);
  }
  assert.match(at(locale("ru"), "room.onboard.readerTip2"), /^Мои слова/);
});

test("summary lines and teasers carry no decorative emoji", () => {
  assert.doesNotMatch(read("public/js/library-ui.js"), /learning-home-teaser', text: '🔬 '/);
  assert.doesNotMatch(read("public/index.html"), /v3UpdateCardStatus\("classic(Tts|Translation)Card", parts\.length \? "(🔊|🌐) "/);
});

// The sprite lives at one unversioned URL but now changes (R11a); `immutable` would pin an old copy
// for a year in any browser the service worker does not control, and new icons would render blank.
test("the UI sprite is revalidated, never pinned as immutable", () => {
  const server = read("server.js");
  const sprite = server.search(/icons\[\\\\\/\]linguistpro-ui\\\.svg\$\/\.test\(lower\)/);
  const icons = server.search(/icons\[\\\\\/\]\.\+\\\.\(png\|svg\|ico\)\$\/\.test\(lower\)/);
  assert.ok(sprite > 0, "sprite rule exists");
  assert.match(server.slice(sprite, sprite + 400), /res\.setHeader\("Cache-Control", "no-cache"\);/);
  assert.ok(icons > sprite, "checked before the immutable icon rule");
});
