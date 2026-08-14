"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.resolve(__dirname, "..");
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), "utf8");
const libraryHtml = read("public/library.html");
const libraryUi = read("public/js/library-ui.js");
const corpusRegistry = read("public/js/corpus-registry.js");
const indexHtml = read("public/index.html");
const serviceWorker = read("public/sw.js");
const localeRu = read("public/i18n/locales/ru.js");
const localeEn = read("public/i18n/locales/en.js");
const localeHe = read("public/i18n/locales/he.js");
const presenterPath = path.join(ROOT, "public", "js", "corpus-item-presenter.js");

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
  assert.match(libraryUi, /const ROOM_BROWSE_PAGE = roomB6\.ROOM_B6_LIMITS\.pageSize/);
  const myTexts = libraryUi.slice(libraryUi.indexOf("async function renderMyTextsCorpus"), libraryUi.indexOf("// L1 — graduated landing"));
  assert.match(myTexts, /listPersonalTextsPage/);
  assert.match(myTexts, /limit: ROOM_BROWSE_PAGE/);
  assert.doesNotMatch(myTexts, /myBrowseLimit \+=|found\.slice\(0, myBrowseLimit\)/);
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

test("2026-08-14 keeps corpus identity isolated and makes every long corpus list collapsible", () => {
  const benHome = libraryUi.slice(
    libraryUi.indexOf("function renderHomeInto"),
    libraryUi.indexOf("// FB-9 — L1 results order"),
  );
  const benRails = libraryUi.slice(
    libraryUi.indexOf("async function injectBenHomeRails"),
    libraryUi.indexOf("async function injectCorpusRails"),
  );
  assert.match(benHome, /injectBenHomeRails\(body\)/,
    "Ben-Yehuda must use a corpus-local rail coordinator");
  assert.doesNotMatch(benRails, /injectMyTexts\(/,
    "the neighboring My Texts corpus must not be injected into Ben-Yehuda");
  assert.match(libraryUi, /function attachRoomLongListDisclosure\(/,
    "one disclosure helper must own the expand/collapse semantics");
  assert.match(libraryUi, /aria-expanded[\s\S]*aria-controls/,
    "long-list toggles need programmatic state and an explicit controlled region");
  assert.match(libraryHtml, /\.room-long-list-body\[hidden\]/,
    "author CSS must not be able to resurrect a collapsed list");
  assert.ok((libraryUi.match(/attachRoomLongListDisclosure\(/g) || []).length >= 12,
    "all long-list families must consume the same disclosure contract");
  for (const family of ["mytexts:materials", "group:' + corpusId + ':materials", "ben:periods", "ben:results:title", "ben:authors:", "ben:works:"]) {
    assert.match(libraryUi, new RegExp(family.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `missing disclosure coverage for ${family}`);
  }
  for (const locale of [localeRu, localeEn, localeHe]) {
    assert.match(locale, /sectionExpand:/);
    assert.match(locale, /sectionCollapse:/);
  }
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
  assert.match(learningHome, /countPersonalTextsExact\(\)/,
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
  assert.match(learningHome, /Number\.isFinite\(Number\(pick\.familiar\)\)[\s\S]*Number\(pick\.denominator\) > 0/,
    "B7 familiarity may render only with an exact numerator and non-zero denominator");
  assert.doesNotMatch(learningHome, /≈|pick\.cov\) \* 100/,
    "B7 must not revive a soft estimate or universal percentage promise");
  assert.match(learningHome, /Number\.isFinite\(Number\(card\.segments\)\)/,
    "the short-text action needs a real row count");
  assert.match(learningHome, /_dueCounts && _dueCounts\.dueNow/,
    "review joins Today only from the shared due-count truth");
  assert.match(learningHome, /groupCorpora\.length/,
    "protected study material may appear only from authorized catalogs");
  assert.match(learningHome, /'data-focus-key': 'room-due-review'/,
    "the inline review trigger needs a stable focus identity across live locale rerenders");
});

test("B4 adapters normalize each corpus without inventing readiness", async () => {
  assert.ok(fs.existsSync(presenterPath), "B4 needs one pure presentation adapter module");
  const presenter = await import(pathToFileURL(presenterPath).href);
  const copy = {
    untitled: "Без названия", ownText: "Ваш текст", assigned: "назначено группе",
    finished: "Прочитано", continuePercent: (pct) => `Продолжить · ${pct}%`,
    continueRow: (row) => `Продолжить · строка ${row}`,
    studioLevelReason: "уровень указан в Студии", groupLevelReason: "уровень указан в корпусе",
    familiarityReason: "подходит по знакомым словам", intrinsicReason: "приблизительно по частотности",
    assignedReason: "назначено вашей группе", personalProvenance: "ваш текст · уровень указан в Студии",
    benProvenance: "сложность по частотности · знакомые слова по профилю",
    groupProvenance: (revision) => `учебная группа · TTS r${revision}`,
  };
  const ben = presenter.adaptBenYehudaItem({
    id: "25450", text_key: "corpus:25450", title: "הַבְּרֵכָה", author: "חיים נחמן ביאליק",
    era: "revival", segments: 24, audio_status: "tts", review_status: "machine",
  }, {
    copy, difficultyBand: "mid", difficultyLabel: "средне", familiarityPct: 84,
    familiarityZone: "in", caveats: ["классический регистр"],
    progress: { last_row_idx: 8, n_rows: 24 }, savedState: "reading-list",
  });
  assert.deepEqual({ corpusId: ben.corpusId, state: ben.learnerState.state, progress: ben.learnerState.progressValue,
    level: ben.readiness.levelLabel, familiar: ben.readiness.familiarityPct, confidence: ben.readiness.confidence,
    media: ben.media.humanOrTts, saved: ben.savedState },
  { corpusId: "benyehuda", state: "reading", progress: 38, level: "средне", familiar: 84,
    confidence: "derived-high", media: "tts", saved: "reading-list" });

  const mine = presenter.adaptMyTextItem({
    id: "mine-1", text_key: "mine-1", title: "השיעור שלי", level: "ב", last_row_idx: 16,
    familiarity_pct: 0, tags_json: '["ульпан"]', topic: "Урок",
  }, { copy, media: { kind: "video", coverage: null, humanOrTts: "human" } });
  assert.equal(mine.readiness.familiarityPct, null, "personal text must ignore unsupported raw familiarity");
  assert.equal(mine.learnerState.progressValue, null, "row position must not become a percentage without a denominator");
  assert.equal(mine.learnerState.resumeLabel, "Продолжить · строка 17");
  assert.equal(mine.readiness.confidence, "asserted");

  const group = presenter.adaptGroupCorpusItem({
    work_id: "song-2", text_key: "song-key-2", title: "אהבת השם", artist: "בן צור",
    position_no: 2, rows_count: 34, audio_count: 20, audio_revision: 3, level: "ב",
    familiarity_pct: 91, tags: ["שירים"],
  }, { copy, corpusId: "study-songs", progress: null, humanOrTts: "tts",
    audioProvenance: { type: "asserted", source: "group-corpus", revision: "3" } });
  assert.equal(group.readiness.familiarityPct, null, "group item must ignore unsupported raw familiarity");
  assert.equal(group.media.coverage, "partial");
  assert.equal(group.media.humanOrTts, "tts");
  assert.equal(group.learnerState.state, "new");
  assert.equal(group.learnerState.progressValue, 0);
  assert.match(group.provenanceSummary, /TTS r3/);
  assert.ok(presenter.learningSignals(group).length <= 2, "scan line may expose at most two readiness signals");
});

test("B4 shared presenter is pure and all corpus rows consume its view models", () => {
  assert.ok(fs.existsSync(presenterPath), "B4 presenter module is missing");
  const presenterSource = fs.readFileSync(presenterPath, "utf8");
  assert.doesNotMatch(presenterSource, /localDb|indexedDB|fetch\(|localStorage|INSERT|UPDATE|CREATE TABLE/,
    "the presentation adapter must not become learner truth or perform I/O");
  assert.match(libraryUi, /adaptBenYehudaItem/);
  assert.match(libraryUi, /adaptMyTextItem/);
  assert.match(libraryUi, /adaptGroupCorpusItem/);
  assert.match(libraryUi, /function paintLearningCompass\(/);
  assert.match(libraryUi, /data-confidence/);
});

test("B5 returns to the exact corpus context and refreshes canonical progress", () => {
  const continuity = libraryUi.slice(
    libraryUi.indexOf("let readerReturnContext"),
    libraryUi.indexOf("function setReaderReturnRoute"),
  );
  const openReaderStart = libraryUi.indexOf("async function openReader");
  const openReader = libraryUi.slice(openReaderStart, libraryUi.indexOf("function maybeNudgeNiqqud", openReaderStart));
  const closeReader = libraryUi.slice(
    libraryUi.indexOf("async function closeReader"),
    libraryUi.indexOf("// ── BRR-S15"),
  );
  assert.match(continuity, /function captureReaderReturnContext\(/,
    "Reader needs one in-memory snapshot of the visible corpus place");
  assert.match(continuity, /function restoreReaderReturnContext\(/,
    "Reader needs one focus/scroll restoration path after a fresh render");
  assert.doesNotMatch(continuity, /localStorage|sessionStorage|indexedDB|localDb|fetch\(/,
    "return context is ephemeral UI state, never learner truth or persistence");
  assert.match(openReader, /captureReaderReturnContext\(\)[\s\S]*window\.scrollTo\(0, 0\)/,
    "the corpus place must be captured before Reader moves the viewport");
  assert.match(closeReader, /activeTrack === 'corpus'[\s\S]*await renderCorpus\(\)/,
    "every corpus adapter must repaint from canonical state after progress flush");
  assert.match(closeReader, /await restoreReaderReturnContext\(returnContext/,
    "focus and scroll must restore only after the asynchronous corpus repaint");
  assert.match(continuity, /details\[id\]/,
    "mobile filter disclosure state is part of the ephemeral return place");
});

test("B5 gives every corpus row a stable, presentation-only continuity identity", () => {
  const myTextCard = libraryUi.slice(libraryUi.indexOf("function renderMyTextCard"), libraryUi.indexOf("async function injectMyTexts"));
  const groupCard = libraryUi.slice(libraryUi.indexOf("function renderCard(work)"), libraryUi.indexOf("let groupBrowseLimit"));
  const benCard = libraryUi.slice(libraryUi.indexOf("function renderCorpusCard"), libraryUi.indexOf("function renderTrack"));
  const benRow = libraryUi.slice(libraryUi.indexOf("function renderCorpusWorkRow"), libraryUi.indexOf("function wireChrome"));
  assert.match(myTextCard, /'data-continuity-key': continuityKey\('mytexts'/);
  assert.match(groupCard, /'data-continuity-key'\s*:\s*continuityKey\('group:' \+ corpusId/);
  assert.match(benCard, /'data-continuity-key': continuityKey\('benyehuda'/);
  assert.match(benRow, /'data-continuity-key': continuityKey\('benyehuda'/);
  assert.match(libraryUi, /'data-continuity-action': 'open'/,
    "the refreshed row needs an unambiguous focus target");
  assert.match(benRow, /class: 'work-card-difficulty learning-compass'/,
    "lazy Ben-Yehuda readiness must reserve its row slot before it enters the viewport");
});

test("B5 invalidates late served-on-open completions after Back", () => {
  const openReader = libraryUi.slice(libraryUi.indexOf("async function openReader"), libraryUi.indexOf("function maybeNudgeNiqqud"));
  const closeReader = libraryUi.slice(libraryUi.indexOf("async function closeReader"), libraryUi.indexOf("// ── BRR-S15"));
  const corpusOpen = libraryUi.slice(libraryUi.indexOf("async function openCorpusWork"), libraryUi.indexOf("// Restricted group corpus"));
  const groupOpen = libraryUi.slice(libraryUi.indexOf("async function openGroupCorpusWork"), libraryUi.indexOf("// BRR-P0-004"));
  assert.match(libraryUi, /let readerOpenEpoch = 0/);
  assert.match(closeReader, /readerOpenEpoch\+\+/,
    "Back must revoke pending presentation authority");
  assert.match(openReader, /openEpoch !== readerOpenEpoch[\s\S]*ReaderCore was resolving/,
    "a late ReaderCore completion cannot repaint a closed Reader");
  assert.match(corpusOpen, /const openEpoch = \+\+readerOpenEpoch[\s\S]*openEpoch !== readerOpenEpoch[\s\S]*_readerOpenEpoch: openEpoch/,
    "served-on-open import may finish, but stale navigation cannot reopen Ben-Yehuda");
  assert.match(groupOpen, /const openEpoch = \+\+readerOpenEpoch[\s\S]*openEpoch !== readerOpenEpoch[\s\S]*_readerOpenEpoch: openEpoch/,
    "the protected-corpus transport follows the same late-result contract");
});

test("B5 finish handoff includes a localized, non-destructive Learning Home route", () => {
  const endCard = libraryUi.slice(
    libraryUi.indexOf("async function renderEndOfTextCard"),
    libraryUi.indexOf("// ── BRR Epic 5 W2"),
  );
  assert.match(endCard, /class: 'reader-end-paths'/,
    "review and home are one bounded result-choice row");
  assert.match(endCard, /room\.resume\.backHome/);
  assert.match(endCard, /closeReader\(\{ returnHome: true \}\)/,
    "home handoff must reuse normal progress flush and cleanup");
  for (const locale of [localeRu, localeEn, localeHe]) assert.match(locale, /backHome:/,
    "RU, EN and HE must all name the new end-of-text route");
  const homeHandler = endCard.slice(endCard.indexOf("const home ="), endCard.indexOf("paths.appendChild(home)"));
  assert.doesNotMatch(homeHandler, /confetti|setTextFinished|clearTextFinished/,
    "going home must not silently mark the text finished or add celebration noise");
});

test("B5 exposes one release version across Studio, Room and service worker", () => {
  const app = indexHtml.match(/window\.APP_VERSION\s*=\s*"([^"]+)"/);
  const room = libraryHtml.match(/id="roomFooterVersion"[^>]*>v([^<]+)</);
  const worker = serviceWorker.match(/const CACHE_VERSION\s*=\s*"v([^"]+)"/);
  assert.ok(app && room && worker, "all three public release stamps must exist");
  assert.equal(room[1], app[1], "Room footer must not advertise a stale release");
  assert.equal(worker[1], app[1], "service-worker cache and document release must match");
});

module.exports = { TARGETS, VIEW_MODEL_FIXTURES };
