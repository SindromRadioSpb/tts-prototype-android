#!/usr/bin/env node
"use strict";

// MASS-ACCESS P0 frozen contract. This file is deliberately NOT part of
// `npm test` or any deploy gate while the owner-authorized state is
// DETAILED_DESIGN_AND_RED_TESTS_ONLY. Run it explicitly with:
//   npm run smoke:mass-access:p0:red
// Expected baseline: exit 1 and IMPLEMENTATION RED. Green guards must pass.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const exists = (relative) => fs.existsSync(path.join(ROOT, relative));
const fixture = JSON.parse(read("scripts/premium/fixtures/mass-access-p0/contract-v1.json"));
const migrations = fs.readdirSync(path.join(ROOT, "migrations"))
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => read(path.join("migrations", name)))
  .join("\n");
const server = read("server.js");
const groupMigration = read("migrations/056_group_song_corpus_p0.sql");
const indexHtml = read("public/index.html");
const libraryUi = read("public/js/library-ui.js");

function locale(name) {
  const window = { I18N_LOCALES: {} };
  // Locale files are trusted repository sources; use the same lightweight load
  // pattern as tests/i18n.smoke.js without starting a browser.
  new Function("window", read(`public/i18n/locales/${name}.js`))(window);
  return window.I18N_LOCALES[name];
}

function get(object, dotted) {
  return dotted.split(".").reduce((value, key) => value && value[key], object);
}

const greenGuards = [];
const implementation = [];
const guard = (id, condition, message) => greenGuards.push({ id, condition: !!condition, message });
const future = (id, condition, message) => implementation.push({ id, condition: !!condition, message });

guard("P0-G01", fixture.authority.migration === false && fixture.authority.deploy === false,
  "fixture preserves no-migration/no-deploy authority");
guard("P0-G02", fixture.authority.b9 === "KEEP_FROZEN",
  "fixture keeps B9 frozen");
guard("P0-G03", /visibility\s+TEXT NOT NULL CHECK\(visibility='GROUP_RESTRICTED'\)/.test(groupMigration),
  "existing group corpus remains structurally restricted");
guard("P0-G04", !/CREATE TABLE[^;]*(curated_paths|path_assignments)/i.test(migrations),
  "no B9 Path/Assignment schema exists");
guard("P0-G05", fixture.publication.source_operation_default === "PUBLISH_COPY"
  && fixture.publication.source_delete_in_publish_transaction === false,
  "publication copy cannot delete the private source transactionally");
guard("P0-G06", fixture.rights.separate_permissions.join("|") === "PUBLIC_READ|PUBLIC_STREAM|PACKAGE_DOWNLOAD",
  "read, stream and package-download rights stay independent");
guard("P0-G07", fixture.sharing.complete_audio_label_requires_missing_zero === true,
  "a package cannot claim complete audio while expected files are missing");
guard("P0-G08", Object.values(fixture.i18n).filter((value) => value && typeof value === "object" && value.body)
  .every((value) => value.body.includes(fixture.rights.takedown_email)),
  "every approved locale names the same takedown address");

future("P0-R01", /CREATE TABLE IF NOT EXISTS published_corpora/i.test(migrations),
  "dedicated published_corpora aggregate exists");
future("P0-R02", /CREATE TABLE IF NOT EXISTS published_corpus_editions/i.test(migrations)
  && /CREATE TABLE IF NOT EXISTS publication_events/i.test(migrations),
  "immutable editions and append-only publication events exist");
future("P0-R03", /public_read_allowed/i.test(migrations)
  && /public_stream_allowed/i.test(migrations)
  && /package_download_allowed/i.test(migrations),
  "per-item read, stream and package-download rights are separate schema facts");
future("P0-R04", exists("db/publicationRepo.js"),
  "one publication repository owns draft, edition, pointer and event writes");
future("P0-R05", /\/api\/public-corpora/.test(server),
  "anonymous public-corpus read routes exist outside group membership");
future("P0-R06", /\/api\/publication\/corpora/.test(server),
  "owner/publisher writer routes exist behind their own authorization boundary");
future("P0-R07", exists("public/js/public-corpus-adapter.js"),
  "Room has a typed public-corpus adapter rather than group-route branching");
future("P0-R08", exists("public/js/publication-center.js"),
  "the single Publication Center writer exists");
future("P0-R09", /publication-center|Add to corpus|Добавить в корпус/i.test(indexHtml),
  "Studio exposes the publisher-only Add to corpus entrance");
future("P0-R10", /publication-center|Manage published corpus|Управлять публикацией/i.test(libraryUi),
  "Room owner management deep-links to the same writer");
future("P0-R11", exists("public/js/share-service.js")
  && /canShare\s*\(\s*\{\s*files/.test(read("public/js/share-service.js")),
  "one shared Send or save service can invoke native ZIP file share");
future("P0-R12", !/_v3TcsJsonBlob\(\)[\s\S]{0,220}navigator\.share/.test(indexHtml)
  && /LEARNING_ZIP|learning zip|Учебный ZIP/i.test(indexHtml),
  "Studio primary Share no longer sends lightweight JSON");
future("P0-R13", exists("public/js/mentor-connection-core.js")
  && /ACCOUNT[\s\S]*SYNC[\s\S]*TELEGRAM[\s\S]*AI_CONSENT/.test(read("public/js/mentor-connection-core.js")),
  "Mentor connection exposes the approved progressive capability order");

const localeNames = ["ru", "en", "he"];
const localeReady = localeNames.every((name) => {
  const current = locale(name);
  const expected = fixture.i18n[name];
  return get(current, "room.copyright.title") === expected.title
    && get(current, "room.copyright.summary") === expected.summary
    && get(current, "room.copyright.body") === expected.body
    && get(current, "room.copyright.contactLabel") === expected.contactLabel
    && get(current, "room.copyright.localPrivateNote") === expected.localPrivateNote;
});
future("P0-R14", localeReady,
  "RU/EN/HE runtime locales contain the exact approved copyright/takedown copy");

const failedGuards = greenGuards.filter((item) => !item.condition);
const pending = implementation.filter((item) => !item.condition);

for (const item of greenGuards) {
  console.log(`${item.condition ? "GREEN" : "GUARD FAIL"} ${item.id} · ${item.message}`);
}
for (const item of implementation) {
  console.log(`${item.condition ? "IMPLEMENTED" : "RED"} ${item.id} · ${item.message}`);
}

if (failedGuards.length) {
  console.error(`MASS_ACCESS_P0_CONTRACT_INVALID guards=${greenGuards.length - failedGuards.length}/${greenGuards.length}`);
  process.exit(2);
}
if (pending.length) {
  console.error(`MASS_ACCESS_P0_IMPLEMENTATION_RED implemented=${implementation.length - pending.length}/${implementation.length} pending=${pending.length}`);
  process.exit(1);
}
console.log(`MASS_ACCESS_P0_IMPLEMENTATION_GREEN ${implementation.length}/${implementation.length}`);
