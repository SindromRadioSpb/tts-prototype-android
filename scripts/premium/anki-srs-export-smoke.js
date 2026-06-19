"use strict";
// ── smoke:anki-srs-export — word_study → «LinguistPro Word v2» deck → .apkg (⑤ A2b / A-unify) ───────────
// Validates the OPFS→Anki mapping (public/db/anki-srs-export.js): field extraction from body_json, lemma
// dedup, empty-skip, then builds the deck end-to-end through the client builder (sql.js) and asserts a valid
// «LinguistPro Word v2» collection (the SHARED model — same as AnkiConnect). Headless. Run: npm run smoke:anki-srs-export

const initSqlJs = require("sql.js");
const JSZip = require("jszip");
const SrsExport = require("../../public/db/anki-srs-export.js");
const AnkiApkg = require("../../public/db/anki-apkg.js");
const AnkiModels = require("../../public/db/anki-models.js");
const AnkiIdentity = require("../../public/db/anki-identity.js");
const core = require("../../public/db/anki-apkg-core.js");

let passed = 0, failed = 0;
function ok(name, cond, extra) { if (cond) { passed++; console.log("  ✓ " + name); } else { failed++; console.log("  ✗ " + name + (extra ? "  — " + extra : "")); } }

function notesFixture() {
  return [
    { id: "n1", body_json: JSON.stringify({ word: "הלך", niqqud_variant: "הָלַךְ", root: "הלך", binyan: "קל", pos: "verb", meaning: "идти, ходить", translit_ru: "halakh", mnemonic: "halt→ходить", pealim_id: "1234" }) },
    { id: "n2", body: { word: "בית", niqqud_variant: "בַּיִת", root: "בית", pos: "noun", meaning: "дом", pealim_id: "5678" } },
    { id: "n3", body: { word: "הלך", niqqud_variant: "הָלַךְ", root: "הלך", binyan: "קל", pos: "verb", meaning: "(дубликат)", pealim_id: "1234" } }, // dup by pealim → collapses
    { id: "n4", body: { word: "", niqqud_variant: "", meaning: "пусто" } }, // no front → skipped
    { id: "n5", body: { word: "ספר", pos: "noun", meaning: "книга" } }, // no pealim → keyed by word#pos
  ];
}
const V2_ORDER = "Word,Niqqud,Translit,Russian,Root,Binyan,POS,Conjugation,Example,Mnemonic,Audio";

(async () => {
  console.log("smoke:anki-srs-export — word_study → «LinguistPro Word v2» .apkg\n");
  const SQL = await initSqlJs();
  const NOW = 1718600600000;

  // 0) shared model integrity
  ok("AnkiModels.wordV2 = «LinguistPro Word v2», 11 fields in order", AnkiModels.wordV2().modelName === "LinguistPro Word v2" && AnkiModels.wordV2().fieldNames.join(",") === V2_ORDER);
  ok("SrsExport uses the shared Word v2 model", SrsExport.MODEL_NAME === "LinguistPro Word v2" && SrsExport.FIELD_NAMES.join(",") === V2_ORDER);

  // 1) field extraction → Word v2 fields
  const f1 = SrsExport.bodyToFields(SrsExport.noteBody(notesFixture()[0]));
  ok("parses body_json string → Word v2 fields", f1.Word === "הלך" && f1.Niqqud === "הָלַךְ" && f1.Translit === "halakh" && f1.Russian === "идти, ходить" && f1.Root === "הלך" && f1.Binyan === "קל" && f1.POS === "verb" && f1.Mnemonic === "halt→ходить");
  ok("Conjugation/Example/Audio empty in global export (TTS fallback)", f1.Conjugation === "" && f1.Example === "" && f1.Audio === "");
  const f2 = SrsExport.bodyToFields(SrsExport.noteBody(notesFixture()[1]));
  ok("accepts pre-parsed body object", f2.Word === "בית" && f2.Russian === "дом");

  // 2) spec building: dedup + empty-skip
  const spec = SrsExport.buildWordStudySpec(notesFixture(), { deckName: "LinguistPro::Words::Test" });
  ok("model = «LinguistPro Word v2» with 11 fields", spec.modelName === "LinguistPro Word v2" && spec.fieldNames.length === 11);
  ok("dedups by pealim (הלך twice → 1) + skips empty (n4) → 3 notes", spec.notes.length === 3, "got " + spec.notes.length);
  ok("first field is Word (Hebrew)", spec.notes[0].fields[0] === "הלך");
  ok("Russian field (idx 3) carries the meaning", spec.notes[0].fields[3] === "идти, ходить");
  ok("guid is the stable lemma-key guid", spec.notes[0].guid === core.stableGuid("word:pid:1234"));
  ok("no-pealim note keyed by word#pos", spec.notes.some(n => n.guid === core.stableGuid("word:w:ספר#noun")));
  ok("POS tag emitted", spec.notes[0].tags.includes("lp_pos_verb") && spec.notes[0].tags.includes("lp_word"));

  // 3) end-to-end → valid Anki collection via the client builder
  const bytes = await AnkiApkg.buildApkgBytes(spec, { SQL, JSZip, now: NOW, zipType: "uint8array" });
  ok("builds .apkg bytes", bytes instanceof Uint8Array && bytes.length > 0);
  const db = new SQL.Database(await (await JSZip.loadAsync(bytes)).file("collection.anki2").async("uint8array"));
  ok("collection has 3 notes", db.exec("SELECT COUNT(*) FROM notes")[0].values[0][0] === 3);
  const models = JSON.parse(db.exec("SELECT models FROM col WHERE id=1")[0].values[0][0]);
  const mid = Object.keys(models)[0];
  ok("model name persisted = Word v2", models[mid].name === "LinguistPro Word v2");
  ok("model fields in order (11)", models[mid].flds.map(x => x.name).join(",") === V2_ORDER);
  ok("front template has {{tts}} device-TTS fallback", /\{\{tts he_IL:Word\}\}/.test(models[mid].tmpls[0].qfmt));
  ok("3 cards (1 template)", db.exec("SELECT COUNT(*) FROM cards")[0].values[0][0] === 3);
  db.close();

  // 4) empty input → valid empty deck
  const empty = SrsExport.buildWordStudySpec([], {});
  ok("empty notes → 0-note spec (still valid Word v2)", empty.notes.length === 0 && empty.modelName === "LinguistPro Word v2");

  // 5) A-unify-2b — sentence group (SRS Card v1)
  const sents = [
    { id: "s1", he_plain: "זה הבית שלי", he_niqqud: "זֶה הַבַּיִת שֶׁלִּי", translit: "ze ha-bayit", ru: "это мой дом" },
    { id: "s2", he_plain: "אני לומד עברית", he_niqqud: "", translit_ru: "ani lomed", ru: "я учу иврит" },
    { id: "s3", he_plain: "", he_niqqud: "", ru: "пусто" }, // no Hebrew → skipped
  ];
  const sg = SrsExport.sentenceGroup(sents, { noteBySid: { s1: "важное предложение" }, deckName: "LinguistPro::SRS" });
  ok("sentenceGroup = «SRS Card v1», 6 fields", sg.modelName === "LinguistPro SRS Card v1" && sg.fieldNames.join(",") === "Hebrew,Niqqud,Translit,Russian,Note,Audio");
  ok("sentenceGroup builds 2 (skips empty s3)", sg.notes.length === 2, "got " + sg.notes.length);
  ok("sentence fields: Hebrew/Russian + Note(includeHint)", sg.notes[0].fields[0] === "זה הבית שלי" && sg.notes[0].fields[3] === "это мой дом" && sg.notes[0].fields[4] === "важное предложение");
  ok("sentence guid stable per id", sg.notes[0].guid === core.stableGuid("sent:s1"));

  // 6) wordGroupFromCards (browser passes pre-built Word v2 field objects + lemma key)
  const items = [
    { key: "pid:1234", fields: { Word: "הלך", Niqqud: "הָלַךְ", Russian: "идти", Root: "הלך", POS: "verb", Conjugation: "<table>…</table>", Example: "הלכתי הביתה" } },
    { key: "pid:1234", fields: { Word: "הלך", Russian: "(dup)" } }, // same key → collapses
    { key: "w:ספר#noun", fields: { Word: "ספר", Russian: "книга" } },
  ];
  const wg = SrsExport.wordGroupFromCards(items, { deckName: "LinguistPro::Words" });
  ok("wordGroupFromCards = Word v2, dedup by key (3→2)", wg.modelName === "LinguistPro Word v2" && wg.notes.length === 2);
  ok("word group carries Conjugation/Example from the built fields", wg.notes[0].fields[7] === "<table>…</table>" && wg.notes[0].fields[8] === "הלכתי הביתה");
  ok("word group guid matches buildWordStudySpec scheme", wg.notes[0].guid === core.stableGuid("word:pid:1234"));

  // 7) «BOTH» — words + sentences in ONE .apkg (multi-model)
  const bothBytes = await AnkiApkg.buildApkgBytes({ groups: [wg, sg] }, { SQL, JSZip, now: NOW, zipType: "uint8array" });
  const bdb = new SQL.Database(await (await JSZip.loadAsync(bothBytes)).file("collection.anki2").async("uint8array"));
  const bModels = JSON.parse(bdb.exec("SELECT models FROM col WHERE id=1")[0].values[0][0]);
  const bDecks = JSON.parse(bdb.exec("SELECT decks FROM col WHERE id=1")[0].values[0][0]);
  ok("both: 2 models (Word v2 + SRS Card v1)", Object.values(bModels).map((m) => m.name).sort().join("|") === "LinguistPro SRS Card v1|LinguistPro Word v2");
  ok("both: 3 decks (Default + Words + SRS)", Object.keys(bDecks).length === 3);
  ok("both: 4 notes (2 word + 2 sentence)", bdb.exec("SELECT COUNT(*) FROM notes")[0].values[0][0] === 4);
  bdb.close();

  // 8) embedded audio — sentence Audio field [sound:…] + media file inside the .apkg
  const sgA = SrsExport.sentenceGroup([{ id: "sa", he_plain: "שלום", ru: "привет" }], { audioBySid: { sa: "lp_k1.mp3" } });
  ok("sentenceGroup audio → [sound:] in Audio field", sgA.notes[0].fields[5] === "[sound:lp_k1.mp3]");
  ok("sentenceGroup no audio → empty Audio", SrsExport.sentenceGroup([{ id: "sb", he_plain: "בית", ru: "дом" }], {}).notes[0].fields[5] === "");
  const az = await AnkiApkg.buildApkgBytes({ groups: [sgA], media: [{ name: "lp_k1.mp3", data: new Uint8Array([1, 2, 3, 4]) }] }, { SQL, JSZip, now: NOW, zipType: "uint8array" });
  const azip = await JSZip.loadAsync(az);
  const mediaMap = JSON.parse(await azip.file("media").async("string"));
  ok("apkg media map references the audio file", Object.values(mediaMap).includes("lp_k1.mp3"));
  const mIdx = Object.keys(mediaMap).find((k) => mediaMap[k] === "lp_k1.mp3");
  const mf = mIdx != null ? azip.file(String(mIdx)) : null;
  const mfBytes = mf ? await mf.async("uint8array") : null;
  ok("apkg contains the numbered media file with preserved bytes", !!mfBytes && mfBytes.length === 4 && mfBytes[0] === 1);

  // 9) cross-transport IDENTITY (audit P0/G1) — shared lemma tag so read-back sees .apkg cards
  const bodyPid = { word: "הלך", niqqud_variant: "הָלַךְ", pos: "verb", pealim_id: "1234" };
  const bodyNoPid = { word: "ספר", pos: "noun" };
  ok("identity.lemmaKey matches the export GUID key (no GUID shift)", AnkiIdentity.lemmaKey(bodyPid) === "pid:1234" && AnkiIdentity.lemmaKey(bodyNoPid) === "w:ספר#noun");
  const lt = AnkiIdentity.lemmaTag("pid:1234");
  ok("lemmaTag is tag-safe (lp_lemma_<12 hex>) + deterministic", /^lp_lemma_[0-9a-f]{12}$/.test(lt) && lt === AnkiIdentity.lemmaTag("pid:1234"));
  ok("lemmaTag differs per lemma", AnkiIdentity.lemmaTag("pid:1234") !== AnkiIdentity.lemmaTag("pid:5678"));
  // buildWordStudySpec word cards carry the lemma tag
  const wspec = SrsExport.buildWordStudySpec([{ id: "n1", body: bodyPid }], {});
  ok(".apkg word card carries lp_lemma_ tag", wspec.notes[0].tags.includes(AnkiIdentity.lemmaTagForBody(bodyPid)));
  // ROUND-TRIP: an exported card's lemma tag maps back to the local note via lemmaTagForBody (the read-back path)
  const localNotes = [{ id: "A", body: bodyPid }, { id: "B", body: { word: "הָלַךְ", niqqud_variant: "הָלַךְ", pos: "verb", pealim_id: "1234" } }, { id: "C", body: bodyNoPid }];
  const idx = new Map();
  for (const n of localNotes) { const tg = AnkiIdentity.lemmaTagForBody(n.body); (idx.get(tg) || idx.set(tg, []).get(tg)).push(n.id); }
  const cardTag = wspec.notes[0].tags.find((t) => t.indexOf("lp_lemma_") === 0);
  ok("read-back: card lemma tag fans to ALL notes of that lemma (A+B, not C)", JSON.stringify((idx.get(cardTag) || []).sort()) === '["A","B"]');

  // 10) G4 — «Word v2» / «SRS Card v1» field ORDER is LOCKED (append-only invariant). The `.apkg` writes flds
  //     POSITIONALLY, so a reorder / rename / removal would silently shift every existing card's data on
  //     re-import. This lock fails CI the instant the field list diverges — the durable half of the G4 guard
  //     (the runtime half is v3AnkiEnsureWordModel appending missing fields to an older/divergent live model).
  ok("LOCK: Word v2 field list is exactly the 11 fields in canonical order", AnkiModels.WORD_V2_FIELDS.join(",") === V2_ORDER);
  ok("LOCK: SRS Card v1 field list is exactly the 6 fields in canonical order", AnkiModels.SENT_V1_FIELDS.join(",") === "Hebrew,Niqqud,Translit,Russian,Note,Audio");

  // 11) G2 — lean (global, body-only) and rich (modal, paradigm+example+audio) cards for the SAME lemma share
  //     ONE guid + lemma tag, so Anki MERGES them on re-import → a LEAN re-export would OVERWRITE the rich
  //     Conjugation/Example/Audio with empties (the silent-data-loss bug). The fix ships RICH from BOTH
  //     surfaces (Trainer global now uses getCanonicalWordNotesAll + v3AnkiBuildWordGroup); this asserts the
  //     collision + the empty/rich field gap so a regression can't quietly reintroduce a lean global path.
  const g2body = { word: "כתב", niqqud_variant: "כָּתַב", root: "כתב", binyan: "קל", pos: "verb", meaning: "писать", pealim_id: "9001" };
  const leanCard = SrsExport.buildWordStudySpec([{ id: "g2", body: g2body }], {}).notes[0];
  const richCard = SrsExport.wordGroupFromCards([{ key: SrsExport.lemmaKey(g2body), fields: { Word: "כתב", Niqqud: "כָּתַב", Russian: "писать", Root: "כתב", Binyan: "קל", POS: "verb", Conjugation: "<table>conj</table>", Example: "כתבתי מכתב", Audio: "[sound:lp_x.mp3]" } }], {}).notes[0];
  ok("G2: lean & rich cards for one lemma share the SAME guid (Anki merges → clobber risk)", leanCard.guid === richCard.guid);
  const leanLemmaTag = leanCard.tags.find((t) => t.indexOf("lp_lemma_") === 0);
  const richLemmaTag = richCard.tags.find((t) => t.indexOf("lp_lemma_") === 0);
  ok("G2: lean & rich share the same lp_lemma_ tag", !!leanLemmaTag && leanLemmaTag === richLemmaTag);
  ok("G2: LEAN card has EMPTY Conjugation/Example/Audio (the fields a re-import would clobber)", leanCard.fields[7] === "" && leanCard.fields[8] === "" && leanCard.fields[10] === "");
  ok("G2: RICH card CARRIES Conjugation/Example/Audio (so the global export must ship rich)", richCard.fields[7] === "<table>conj</table>" && richCard.fields[8] === "כתבתי מכתב" && richCard.fields[10] === "[sound:lp_x.mp3]");

  console.log("\nsmoke:anki-srs-export — " + passed + " passed, " + failed + " failed");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
