"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const libraryHtml = read("public/library.html");
const libraryUi = read("public/js/library-ui.js");
const corpusRegistry = read("public/js/corpus-registry.js");

const TARGETS = Object.freeze({
  readyPreviewMax: 12,
  initialDomMax: 2438,
  presentationLongTaskMaxMs: 50,
  interactionMaxMs: 200,
  mobileUsefulContentMaxY: 844,
  mobileRowMinPx: 72,
  mobileRowMaxPx: 104,
  desktopRowMinPx: 72,
  desktopRowMaxPx: 88,
  shelfMin: 4,
  shelfMax: 12,
  minTargetPx: 24,
  preferredTargetPx: 44,
  normalContrast: 4.5,
  largeContrast: 3,
});

const VIEW_MODEL_FIXTURES = Object.freeze([
  {
    name: "benyehuda-derived-complete",
    value: {
      corpusId: "benyehuda", itemId: "25450", textKey: "corpus:25450",
      title: "הַבְּרֵכָה", creator: "חיים נחמן ביאליק", secondaryIdentity: "התחייה",
      languageDirection: "rtl", kind: "literary-work", artwork: null,
      learnerState: { state: "reading", resumeLabel: "Продолжить · 38%", progressValue: 38, lastOpenedAt: "2026-08-10T10:00:00.000Z" },
      readiness: { levelLabel: "средне", familiarityPct: 84, confidence: "derived-high", caveats: ["классический регистр"], reason: "подходит по знакомым словам" },
      media: { kind: "audio", coverage: "full", humanOrTts: "tts" },
      savedState: "reading-list", tags: [], primaryAction: "continue", secondaryActions: ["author"],
      provenanceSummary: "difficulty:derived; familiarity:profile-overlap",
    },
  },
  {
    name: "mytexts-partial-no-fabricated-fit",
    value: {
      corpusId: "mytexts", itemId: "mine-1", textKey: "mine-1",
      title: "השיעור שלי", creator: null, secondaryIdentity: "ваш текст",
      languageDirection: "rtl", kind: "personal-text", artwork: null,
      learnerState: { state: "reading", resumeLabel: "Продолжить · строка 17", progressValue: null, lastOpenedAt: null },
      readiness: { levelLabel: "ב", familiarityPct: null, confidence: "asserted", caveats: [], reason: "уровень указан в Студии" },
      media: { kind: "video", coverage: null, humanOrTts: "human" },
      savedState: null, tags: ["ульпан"], primaryAction: "continue", secondaryActions: ["niqqud", "studio"],
      provenanceSummary: "level:owner-asserted",
    },
  },
  {
    name: "group-assigned-partial-audio",
    value: {
      corpusId: "group:study-songs", itemId: "song-2", textKey: "song-key-2",
      title: "אהבת השם", creator: "בן צור", secondaryIdentity: "№2 · назначено группе",
      languageDirection: "rtl", kind: "assigned-song", artwork: null,
      learnerState: { state: "new", resumeLabel: null, progressValue: 0, lastOpenedAt: null },
      readiness: { levelLabel: "ב", familiarityPct: null, confidence: "asserted", caveats: ["аудио частично"], reason: "назначено вашей группе" },
      media: { kind: "audio", coverage: "partial", humanOrTts: "tts" },
      savedState: null, tags: ["שירים"], primaryAction: "start", secondaryActions: ["share"],
      provenanceSummary: "assignment:group; audio:20/34",
    },
  },
]);

function assertNormalizedFixture(fixture) {
  const item = fixture.value;
  const required = ["corpusId", "itemId", "textKey", "title", "learnerState", "readiness", "media", "primaryAction"];
  for (const key of required) assert.ok(Object.hasOwn(item, key), `${fixture.name}: missing ${key}`);
  assert.ok(["new", "reading", "finished"].includes(item.learnerState.state), `${fixture.name}: invalid learner state`);
  assert.ok(item.learnerState.progressValue == null || (item.learnerState.progressValue >= 0 && item.learnerState.progressValue <= 100), `${fixture.name}: progress must be null or 0..100`);
  assert.ok(item.readiness.familiarityPct == null || (item.readiness.familiarityPct > 0 && item.readiness.familiarityPct <= 100), `${fixture.name}: missing familiarity must stay null, never cosmetic zero`);
  assert.ok(["asserted", "derived-high", "derived-soft"].includes(item.readiness.confidence), `${fixture.name}: readiness confidence required`);
  assert.notEqual(item.readiness.levelLabel, "0", `${fixture.name}: missing level must not become zero`);
}

test("B0 freezes quantitative Room maturity thresholds", () => {
  assert.deepEqual(TARGETS, {
    readyPreviewMax: 12, initialDomMax: 2438, presentationLongTaskMaxMs: 50,
    interactionMaxMs: 200, mobileUsefulContentMaxY: 844,
    mobileRowMinPx: 72, mobileRowMaxPx: 104, desktopRowMinPx: 72, desktopRowMaxPx: 88,
    shelfMin: 4, shelfMax: 12, minTargetPx: 24, preferredTargetPx: 44,
    normalContrast: 4.5, largeContrast: 3,
  });
});

test("B0 normalized fixtures preserve asserted, derived and missing truth", () => {
  for (const fixture of VIEW_MODEL_FIXTURES) assertNormalizedFixture(fixture);
  const myTexts = VIEW_MODEL_FIXTURES.find((fixture) => fixture.name.startsWith("mytexts")).value;
  const group = VIEW_MODEL_FIXTURES.find((fixture) => fixture.name.startsWith("group")).value;
  assert.equal(myTexts.readiness.familiarityPct, null);
  assert.equal(myTexts.learnerState.progressValue, null);
  assert.equal(group.readiness.familiarityPct, null);
  assert.equal(group.media.coverage, "partial");
});

test("B1 bounds the Ben-Yehuda ready preview and exposes the full result set", () => {
  assert.match(libraryUi, /const ROOM_PREVIEW = 12/);
  assert.match(libraryUi, /ready\.slice\(0, ROOM_PREVIEW\)/,
    "the home preview must never mount the full ready corpus");
  assert.match(libraryUi, /room-ready-all[\s\S]*corpusFilter\.readyOnly = true[\s\S]*corpusL1Sort = 'ready'/,
    "the bounded preview needs an explicit route to the complete ready inventory");
});

test("B1 bounds My Texts and protected-corpus browse without hiding the total", () => {
  assert.match(libraryUi, /const ROOM_BROWSE_PAGE = 48/);
  assert.match(libraryUi, /found\.slice\(0, myBrowseLimit\)/);
  assert.match(libraryUi, /myBrowseLimit \+= ROOM_BROWSE_PAGE; paint\(false\)/);
  assert.match(libraryUi, /found\.slice\(0,groupBrowseLimit\)/);
  assert.match(libraryUi, /groupBrowseLimit\+=ROOM_BROWSE_PAGE;paint\(false\)/);
});

test("B1 uses semantic rows with sibling title and secondary controls", () => {
  const corpusCard = libraryUi.slice(libraryUi.indexOf("function renderCorpusCard"), libraryUi.indexOf("function renderTrack"));
  const corpusRow = libraryUi.slice(libraryUi.indexOf("function renderCorpusWorkRow"), libraryUi.indexOf("function wireChrome"));
  const myTextCard = libraryUi.slice(libraryUi.indexOf("function renderMyTextCard"), libraryUi.indexOf("async function injectMyTexts"));
  assert.match(corpusCard, /el\('article',[\s\S]*el\('a', \{ class: 'work-card-open'/);
  assert.match(corpusCard, /el\('button', \{ class: 'work-card-author corpus-work-author-link'/);
  assert.doesNotMatch(corpusCard, /role: 'button'/);
  assert.match(corpusRow, /el\('article',[\s\S]*el\('a', \{ class: 'room-text-title-link corpus-work-open'/);
  assert.match(corpusRow, /el\('button', \{ class: 'corpus-work-author corpus-work-author-link'/);
  assert.doesNotMatch(corpusRow, /role: 'button'/);
  assert.match(myTextCard, /el\('article',[\s\S]*el\('a', \{ class: 'room-text-title-link mytext-open'/);
  assert.match(myTextCard, /el\('details', \{ class: 'mytext-secondary'/,
    "per-text enrichment belongs to a secondary disclosure");
  assert.match(myTextCard, /el\('button', \{ class: 'mytext-nakdan'/);
  assert.doesNotMatch(myTextCard, /role: 'button'/);
});

test("B3 puts every authorized corpus in one switcher without changing the static registry", () => {
  const switcher = libraryUi.slice(libraryUi.indexOf("function corpusSwitcherBar"), libraryUi.indexOf("async function getLearningHomeContinue"));
  const options = libraryUi.slice(libraryUi.indexOf("function authorizedCorpusOptions"), libraryUi.indexOf("function corpusBadgesRow"));
  assert.match(options, /for \(const group of groupCorpora\)/,
    "membership-filtered group corpora must participate in the presentation options");
  assert.match(switcher, /for \(const c of authorizedCorpusOptions\(\)\)/);
  assert.doesNotMatch(corpusRegistry, /groupCorpora/,
    "dynamic entitlements must not become a second registry truth");
  assert.match(libraryHtml, /<meta\s+name=["']description["']/i,
    "the Room shell must carry a product description");
  assert.match(corpusRegistry, /normalize the learning grammar|UNIFORM RETRIEVAL CONTRACT/i,
    "registry must retain the one-grammar/no-second-truth intent");
});

test("B3 normalizes identity, browse and management as shared shell zones", () => {
  assert.match(libraryUi, /function corpusShellHeader\(/);
  assert.match(libraryUi, /function corpusNextAction\(/);
  assert.match(libraryUi, /function corpusFilterChrome\(/);
  assert.match(libraryUi, /function corpusSecondaryDisclosure\(/);
  assert.match(libraryHtml, /\.corpus-filter-summary/);
  assert.match(libraryHtml, /\.corpus-management/);
  assert.match(libraryHtml, /@media \(max-width: 760px\)[\s\S]*\.corpus-filter-disclosure/);
});

test("B2 turns the corpus hub into a learning-first home without creating learner truth", () => {
  const learningHome = libraryUi.slice(
    libraryUi.indexOf("async function getLearningHomeContinue"),
    libraryUi.indexOf("async function renderMyTextsCorpus"),
  );
  assert.match(learningHome, /class: 'corpus-nav learning-home'/,
    "the L0 surface must be the Learning Home, not a storage-first card wall");
  assert.match(learningHome, /class: 'learning-home-feature'/,
    "Learning Home must reserve exactly one featured next action");
  assert.match(learningHome, /class: 'learning-home-today'/,
    "honest daily actions need a dedicated, bounded zone");
  assert.match(learningHome, /class: 'learning-home-ready'/,
    "a short ready shelf must precede corpus inventory");
  assert.match(learningHome, /class: 'learning-home-corpora'/,
    "all authorized corpora must stay one action away");
  assert.match(learningHome, /class: 'learning-home-teaser'/,
    "roadmap material must remain outside the real corpus grammar");
  assert.doesNotMatch(learningHome, /class: 'hub-card'/,
    "the former oversized hub-card wall must not survive B2");
  assert.match(learningHome, /localDb\.dbQuery\([\s\S]*text_progress[\s\S]*finished_at IS NULL/,
    "Continue must derive from the canonical LocalDb progress ledger");
  assert.match(learningHome, /protectedId[\s\S]*groupCorpora\.some/,
    "a locally retained protected work must still pass the current membership catalog");
  assert.match(learningHome, /SELECT COUNT\(\*\) AS n FROM texts/,
    "My Texts needs an exact lightweight count, not a browse-limit approximation");
  assert.match(learningHome, /buildNextTextPicks\(\)/,
    "Start must reuse the existing honest recommendation engine");
  assert.doesNotMatch(learningHome, /INSERT|UPDATE|CREATE TABLE/,
    "Learning Home is a projection, never a second learner-state writer");
});

test("B2 keeps recommendation reasons and daily actions evidence-bound", () => {
  const learningHome = libraryUi.slice(
    libraryUi.indexOf("function learningHomeFeature"),
    libraryUi.indexOf("async function renderMyTextsCorpus"),
  );
  assert.match(learningHome, /Number\.isFinite\(Number\(pick\.cov\)\)/,
    "familiarity may render only when the recommender returned a numeric estimate");
  assert.match(learningHome, /Number\.isFinite\(Number\(card\.segments\)\)/,
    "the short-text action needs a real row count");
  assert.match(learningHome, /_dueCounts && _dueCounts\.dueNow/,
    "review joins Today only from the shared due-count truth");
  assert.match(learningHome, /groupCorpora\.length/,
    "protected study material may appear only from authorized catalogs");
  assert.match(learningHome, /'data-focus-key': 'room-due-review'/,
    "the inline review trigger needs a stable focus identity across live locale rerenders");
});

module.exports = { TARGETS, VIEW_MODEL_FIXTURES };
