"use strict";
// E1 — «карточка текста»: экспорт v2 + импорт v1/v2.
// Чистое ядро: public/js/text-card-format.js (см. шапку модуля — что и почему несёт v2).
//
// Кроме юнитов здесь есть КОНТРАКТНЫЕ проверки против ЖИВОГО public/db/local-db.js:
// адаптер и importBundle связаны только именами полей, и ровно на этом шве уже был
// молчаливый баг (адаптер отдавал `he`, importBundle читал `hebrew_plain || he_plain`
// — иврит терялся целиком). Читаем исходник потребителя, а не пересказываем его.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const TCF = require("../public/js/text-card-format.js");
const LOCAL_DB_SRC = fs.readFileSync(
  path.join(__dirname, "../public/db/local-db.js"), "utf8");

// ── Фикстуры ────────────────────────────────────────────────────────────────

// Паспорт медиа в форме, которую пишет реальный импорт (S4/S12): media-ссылка +
// ASR + сегменты + тайминг. Байты аудио тут не лежат и лежать не должны.
function passport() {
  return {
    source: {
      kind: "audio",
      audio: {
        media: { opfsPath: "media/abc123.mp3", sha256: "abc123", name: "interview.mp3", sizeBytes: 176000000 },
        asr: { model: "gemini-2.5-pro", windows: 5, codeVersion: "3.11.264" },
        segments: [{ i: 0, start: 0, text: "שלום" }, { i: 1, start: 4.2, text: "מה נשמע" }],
        timing: { entries: [{ row: 0, t: 0 }, { row: 1, t: 4.2 }] },
        timingDropReason: null,
      },
    },
    codeVersion: "3.11.264",
  };
}

// Строка texts, как её отдаёт getTextById (SELECT *): паспорт в source_meta_json —
// именно так пишет «Сохранить как новый» (живая карточка владельца).
function textRow(over) {
  return Object.assign({
    id: "t1",
    text_key: "text-1",
    title: "Шломо Крук. Интервью.",
    level: "intermediate",
    tags_json: JSON.stringify(["holocaust", "interview"]),
    source: "YouTube",
    topic: "history",
    source_text: "שלום\nמה נשמע",
    tts_profile_json: JSON.stringify({ voiceName: "he-IL-Wavenet-A", language: "he-IL" }),
    audio_asset_key: null,
    source_meta_json: JSON.stringify(passport()),
    table_model_meta_json: null,
  }, over || {});
}

// Предложения в форме getSentences() = SELECT s.* + JOIN аудио + ПРОЕКЦИЯ никуда
// (niqqud_authority появляется только в проекции, колонки такой нет).
function sentences() {
  return [
    {
      id: "s1", order_index: 0,
      he_plain: "שלום", he_niqqud: "שָׁלוֹם", translit: "shalom", translit_ru: "шалом", ru: "Привет",
      audio_asset_key: "key-a", edit_meta_json: JSON.stringify({ edited: { ru: true } }),
      meta_json: null, translation_provider: "gemini-2.5-pro",
      translation_meta_json: JSON.stringify({ chunk: 0 }),
      niqqud_authority: "ASSERTED",
      he_norm: "שלום", row_hash: "deadbeef",
    },
    {
      id: "s2", order_index: 1,
      he_plain: "מה נשמע", he_niqqud: "מַה נִשְׁמָע", translit: "ma nishma", translit_ru: "ма нишма", ru: "Как дела",
      audio_asset_key: null, edit_meta_json: null,
      meta_json: JSON.stringify({
        niqqud_derived: {
          value: "מַה נִשְׁמָע", authority: "DERIVED", provider: "DICTA_NAKDAN",
          provenance: "nakdan/2026-07", source_hash: "hash-of-body", generated_at: "2026-07-01T00:00:00Z",
          model_version: "v1",
        },
      }),
      translation_provider: null, translation_meta_json: null,
      niqqud_authority: "DERIVED", niqqud_provenance: "nakdan/2026-07",
      he_norm: "מה נשמע", row_hash: "cafebabe",
    },
  ];
}

// Реальная форма v1-файла владельца (то, что уже скачано и лежит на диске):
// edit_meta и note ЗАХАРДКОЖЕНЫ в null, паспорта нет вовсе.
const V1_FIXTURE = {
  format: "linguistpro-text-card-v1",
  exported_at: "2026-05-01T10:00:00.000Z",
  exported_by_app: "linguist-pro-web/3.2.0",
  card: {
    title: "Старая карточка",
    level: null,
    tags: [],
    source_label: null,
    topic: null,
    source_text: "שלום",
    rows: [{
      row_id: "old-1", order_index: 0,
      hebrew_plain: "שלום", hebrew_niqqud: "שָׁלוֹם",
      translit: "shalom", translit_ru: "шалом", russian: "Привет",
      audio_asset_key: "key-a", edit_meta: null, note: null,
    }],
    tts_profile: { voiceName: "he-IL-Wavenet-A" },
    text_audio_asset_key: null,
  },
};

// ── Экспорт (v2) ────────────────────────────────────────────────────────────

test("buildCardPayload: v2-формат несёт паспорт, провенанс строк, edit_meta и заметки", () => {
  const p = TCF.buildCardPayload({
    text: textRow(), sentences: sentences(),
    notesBySentenceId: { s1: "моя заметка" },
    exportedAt: "2026-07-30T00:00:00.000Z", appTag: "test/1",
  });

  assert.equal(p.format, "linguistpro-text-card-v2");
  assert.equal(p.exported_at, "2026-07-30T00:00:00.000Z");

  const c = p.card;
  // Паспорт целиком — вместе с media/asr/segments/timing.
  assert.ok(c.source_meta && c.source_meta.source && c.source_meta.source.audio);
  assert.equal(c.source_meta.source.audio.segments.length, 2);
  assert.equal(c.source_meta.source.audio.timing.entries.length, 2);
  assert.equal(c.source_meta.source.audio.asr.model, "gemini-2.5-pro");
  assert.equal(c.source_meta.codeVersion, "3.11.264");
  assert.equal(c.table_model_meta, null);
  assert.equal(c.passport_in, "source_meta");

  // v1-поля не потеряны.
  assert.deepEqual(c.tags, ["holocaust", "interview"]);
  assert.equal(c.tts_profile.voiceName, "he-IL-Wavenet-A");
  assert.equal(c.rows.length, 2);
  assert.equal(c.rows[0].hebrew_plain, "שלום");

  // v2-добавки: построчный провенанс.
  assert.equal(c.rows[0].translation_provider, "gemini-2.5-pro");
  assert.deepEqual(c.rows[0].translation_meta, { chunk: 0 });
  assert.equal(c.rows[0].niqqud_authority, "ASSERTED");
  assert.equal(c.rows[1].niqqud_authority, "DERIVED");
  assert.equal(c.rows[1].niqqud_provenance, "nakdan/2026-07");
  assert.equal(c.rows[1].meta.niqqud_derived.provider, "DICTA_NAKDAN");

  // v1 хардкодил эти два в null — теперь это реальные данные.
  assert.deepEqual(c.rows[0].edit_meta, { edited: { ru: true } });
  assert.equal(c.rows[0].note, "моя заметка");
  assert.equal(c.rows[1].note, null);

  // Производные колонки НЕ переносим (R9): пересчитываются владельцем.
  assert.equal("he_norm" in c.rows[0], false);
  assert.equal("row_hash" in c.rows[0], false);
});

test("pickCardMeta: паспорт читается из ОБЕИХ колонок, приоритет — где он реально есть", () => {
  // «Сохранить как новый» → source_meta_json.
  assert.equal(TCF.pickCardMeta(textRow()).passportIn, "source_meta");

  // «Обновить карточку» → table_model_meta_json, source_meta_json занят другим.
  const updated = textRow({
    source_meta_json: JSON.stringify({ corpus: { byehuda_id: 42 } }),
    table_model_meta_json: JSON.stringify(passport()),
  });
  const picked = TCF.pickCardMeta(updated);
  assert.equal(picked.passportIn, "table_model_meta");
  // Чужая source_meta не выбрасывается — она тоже едет в архив.
  assert.equal(picked.sourceMeta.corpus.byehuda_id, 42);

  // Ни там, ни там.
  assert.equal(TCF.pickCardMeta({ source_meta_json: null, table_model_meta_json: null }).passportIn, null);
  assert.equal(TCF.pickCardMeta(null).passportIn, null);
});

test("buildCardPayload: паспорт из table_model_meta_json тоже попадает в v2", () => {
  const p = TCF.buildCardPayload({
    text: textRow({ source_meta_json: null, table_model_meta_json: JSON.stringify(passport()) }),
    sentences: sentences(),
  });
  assert.equal(p.card.source_meta, null);
  assert.ok(p.card.table_model_meta.source.audio.media.sha256);
  assert.equal(p.card.passport_in, "table_model_meta");
});

test("cardMediaSummary: медиа-байты НИКОГДА не в JSON — только ссылка (R11)", () => {
  const p = TCF.buildCardPayload({ text: textRow(), sentences: sentences() });
  const m = TCF.cardMediaSummary(p.card);
  assert.equal(m.fileEmbedded, false);
  assert.equal(m.opfsPath, "media/abc123.mp3");
  assert.equal(m.sha256, "abc123");
  assert.equal(m.mediaName, "interview.mp3");
  assert.equal(m.segments, 2);
  assert.equal(m.timingEntries, 2);
  assert.equal(m.hasTiming, true);
  assert.equal(m.asrModel, "gemini-2.5-pro");

  // Нет паспорта → null, а не выдуманная сводка.
  const bare = TCF.buildCardPayload({
    text: textRow({ source_meta_json: null }), sentences: sentences(),
  });
  assert.equal(TCF.cardMediaSummary(bare.card), null);
  assert.equal(TCF.cardMediaSummary(null), null);

  // Сериализация не протаскивает байты: в JSON нет ничего, кроме ссылки.
  const json = JSON.stringify(p);
  assert.ok(json.includes("media/abc123.mp3"));
  assert.ok(!/"bytes"|"blob"|base64/i.test(json));
});

// ── Детект формата ──────────────────────────────────────────────────────────

test("detectCard: v1 и v2 поддержаны, v3 — честная ошибка, не 'не карточка'", () => {
  assert.deepEqual(
    TCF.detectCard(V1_FIXTURE),
    { isCard: true, format: "linguistpro-text-card-v1", version: 1, supported: true, reason: null });

  const v2 = TCF.buildCardPayload({ text: textRow(), sentences: sentences() });
  assert.equal(TCF.detectCard(v2).supported, true);
  assert.equal(TCF.detectCard(v2).version, 2);

  // Файл из БУДУЩЕЙ сборки: распознан как карточка, но неподдержан — вызывающий
  // код обязан сказать это вслух, а не отдать его generic-импорту бандла.
  const future = TCF.detectCard({ format: "linguistpro-text-card-v9", card: { rows: [] } });
  assert.equal(future.isCard, true);
  assert.equal(future.supported, false);
  assert.equal(future.reason, "CARD_FORMAT_UNSUPPORTED");
  assert.equal(future.version, 9);

  // Карточка без строк.
  const broken = TCF.detectCard({ format: "linguistpro-text-card-v2", card: {} });
  assert.equal(broken.isCard, true);
  assert.equal(broken.reason, "CARD_NO_ROWS");

  // Не карточка вовсе — обычный бандл библиотеки идёт своим путём.
  for (const notCard of [null, undefined, 42, "str", [], {}, { format: "linguistpro-bundle" }, { library: { texts: [] } }]) {
    assert.equal(TCF.detectCard(notCard).isCard, false, JSON.stringify(notCard));
  }
});

test("cardToBundle: неподдержанный формат бросает код, а не молча отдаёт пустой бандл", () => {
  assert.throws(
    () => TCF.cardToBundle({ format: "linguistpro-text-card-v9", card: { rows: [] } }),
    (e) => e.code === "CARD_FORMAT_UNSUPPORTED");
  assert.throws(
    () => TCF.cardToBundle({ format: "linguistpro-bundle" }),
    (e) => e.code === "NOT_A_CARD");
});

// ── Round-trip v2 ───────────────────────────────────────────────────────────

test("round-trip: карточка → v2 → bundle — паспорт и провенанс строк доходят", () => {
  const p = TCF.buildCardPayload({
    text: textRow(), sentences: sentences(), notesBySentenceId: { s1: "моя заметка" },
  });
  const b = TCF.cardToBundle(p, { now: "2026-07-30T12:00:00.000Z", textKey: "tk-1" });

  assert.equal(b.library.texts.length, 1);
  const t = b.library.texts[0];

  // Паспорт вернулся В ТУ ЖЕ колонку, откуда уехал.
  assert.ok(t.source_meta.source.audio.media.opfsPath);
  assert.equal(t.source_meta.source.audio.segments.length, 2);
  assert.equal(t.source_meta.source.audio.timing.entries.length, 2);
  assert.equal(t.table_model_meta, null);

  // Провенанс самого импорта — рядом, не вместо (R9).
  assert.equal(t.source_meta.card_import.origin, "text-card-share");
  assert.equal(t.source_meta.card_import.format, "linguistpro-text-card-v2");
  assert.equal(t.source_meta.card_import.media_file_included, false);
  assert.equal(t.source_meta.card_import.imported_at, "2026-07-30T12:00:00.000Z");

  // Шапка текста.
  assert.equal(t.text_key, "tk-1");
  assert.equal(t.title, "Шломо Крук. Интервью.");
  assert.deepEqual(t.tags, ["holocaust", "interview"]);
  assert.equal(JSON.parse(t.tts_profile_json).voiceName, "he-IL-Wavenet-A");

  // Строки: провенанс + заметка + edit_meta.
  assert.equal(t.rows[0].hebrew_plain, "שלום");
  assert.equal(t.rows[0].translation_provider, "gemini-2.5-pro");
  assert.deepEqual(JSON.parse(t.rows[0].translation_meta_json), { chunk: 0 });
  assert.equal(t.rows[0].note, "моя заметка");
  assert.deepEqual(t.rows[0].edit_meta, { edited: { ru: true } });
  assert.equal(t.rows[0].audio_asset_key, "key-a");

  // Производные — не переносим и не подделываем.
  assert.equal("he_norm" in t.rows[0], false);
  assert.equal("row_hash" in t.rows[0], false);

  // Стаб audio_assets — по одному на уникальный ключ.
  assert.deepEqual(b.library.audio_assets.map((a) => a.asset_key), ["key-a"]);
});

test("round-trip: машинный никуд НЕ становится утверждённым (R9 derived≠asserted)", () => {
  const p = TCF.buildCardPayload({ text: textRow(), sentences: sentences() });
  const t = TCF.cardToBundle(p).library.texts[0];

  // ASSERTED — как было.
  assert.equal(t.rows[0].hebrew_niqqud, "שָׁלוֹם");

  // DERIVED — he_niqqud пуст, значение живёт в meta_json.niqqud_derived; проекция
  // получателя (nakdan-derived-core) пересчитает авторитет сама. Значение при этом
  // НЕ теряется: оно и в meta_json, и в самом файле карточки.
  assert.equal(t.rows[1].hebrew_niqqud, "");
  const meta = JSON.parse(t.rows[1].meta_json);
  assert.equal(meta.niqqud_derived.value, "מַה נִשְׁמָע");
  assert.equal(meta.niqqud_derived.authority, "DERIVED");
  assert.equal(p.card.rows[1].hebrew_niqqud, "מַה נִשְׁמָע");
});

// ── Обратная совместимость с v1 ─────────────────────────────────────────────

test("v1-файл импортируется; паспорта нет — деградация честная, не выдуманная", () => {
  const b = TCF.cardToBundle(V1_FIXTURE, { now: "2026-07-30T12:00:00.000Z", textKey: "tk-v1" });
  const t = b.library.texts[0];

  assert.equal(t.title, "Старая карточка");
  assert.equal(t.rows.length, 1);
  assert.equal(t.rows[0].hebrew_plain, "שלום");
  assert.equal(t.rows[0].russian, "Привет");
  assert.equal(t.rows[0].audio_asset_key, "key-a");

  // Ничего не выдумано: провенанса в v1 не было — значит null, а не догадка.
  assert.equal(t.rows[0].translation_provider, null);
  assert.equal(t.rows[0].translation_meta_json, null);
  assert.equal(t.rows[0].meta_json, null);
  assert.equal(t.rows[0].note, null);
  assert.equal(t.rows[0].edit_meta, null);

  // Паспорта нет → в source_meta только провенанс импорта; медиа-сводки нет.
  assert.deepEqual(Object.keys(t.source_meta), ["card_import"]);
  assert.equal(t.source_meta.card_import.format, "linguistpro-text-card-v1");
  assert.equal(t.table_model_meta, null);
  assert.equal(TCF.cardMediaSummary(V1_FIXTURE.card), null);
});

// ── Контракт со ЖИВЫМ importBundle (public/db/local-db.js) ──────────────────

// Вырезает Shape-A маппинг строк из живого local-db.js. Это НЕ пересказ логики
// импортёра, а чтение его исходника — гейт валится и когда дрейфует адаптер,
// и когда дрейфует потребитель.
function shapeARowMappingSource() {
  const start = LOCAL_DB_SRC.indexOf("sentences: (Array.isArray(item.rows) ? item.rows : []).map((r) => ({");
  assert.notEqual(start, -1, "Shape-A row mapping not found in local-db.js");
  const end = LOCAL_DB_SRC.indexOf("})),", start);
  assert.notEqual(end, -1);
  return LOCAL_DB_SRC.slice(start, end);
}

function aliasesRead(mappingSrc, field) {
  const line = mappingSrc.split("\n").find((l) => l.trim().startsWith(field + ":"));
  assert.ok(line, "importBundle mapping has no line for " + field);
  return (line.match(/\br\.([A-Za-z_][A-Za-z0-9_]*)/g) || []).map((s) => s.slice(2));
}

test("контракт: имена полей строк совпадают с тем, ЧТО ЧИТАЕТ importBundle", () => {
  const mapping = shapeARowMappingSource();
  const t = TCF.cardToBundle(
    TCF.buildCardPayload({ text: textRow(), sentences: sentences() })).library.texts[0];
  const row = t.rows[0];

  // Регрессия, стоившая всего иврита: старый адаптер отдавал `he`, а importBundle
  // читает `hebrew_plain || he_plain` — he_plain выходил пустым для КАЖДОЙ строки.
  for (const [field, expected] of [
    ["he_plain", "שלום"],
    ["he_niqqud", "שָׁלוֹם"],
    ["ru", "Привет"],
    ["translit", "shalom"],
  ]) {
    const aliases = aliasesRead(mapping, field);
    const hit = aliases.find((a) => row[a] !== undefined && row[a] !== null && row[a] !== "");
    assert.ok(hit, `importBundle читает ${field} из [${aliases}], а адаптер таких ключей не даёт`);
    assert.equal(row[hit], expected);
  }

  // v2-провенанс должен доезжать до БД: импортёр обязан его читать.
  for (const field of ["translation_provider", "translation_meta_json", "meta_json"]) {
    assert.ok(mapping.includes(field + ":"),
      "importBundle Shape-A не переносит " + field + " — провенанс строки умрёт на импорте");
  }
});

// Тот же класс бага, что и с ивритом, но на уровне ТЕКСТА: старый адаптер отдавал
// паспорт под именем `source_meta_json`, а Shape A читает `item.source_meta` — паспорт
// не восстанавливался НИКОГДА. Юнит round-trip этого не ловит: он проверяет выход
// адаптера против самого себя. Поэтому — снова читаем исходник потребителя.
function shapeATextMappingSource() {
  const start = LOCAL_DB_SRC.indexOf("      // Shape A: unified Android v2 / web v3.");
  assert.notEqual(start, -1, "Shape-A text mapping not found in local-db.js");
  const end = LOCAL_DB_SRC.indexOf("sentences: (Array.isArray(item.rows)", start);
  assert.notEqual(end, -1);
  return LOCAL_DB_SRC.slice(start, end);
}

test("контракт: имена мета-полей ТЕКСТА совпадают с тем, ЧТО ЧИТАЕТ importBundle", () => {
  const mapping = shapeATextMappingSource();
  const t = TCF.cardToBundle(
    TCF.buildCardPayload({
      text: textRow({ table_model_meta_json: JSON.stringify({ probe: 1 }) }),
      sentences: sentences(),
    })).library.texts[0];

  for (const field of ["source_meta", "table_model_meta"]) {
    // \b на конце обязателен: `item.source_meta_json` СОДЕРЖИТ `item.source_meta`,
    // и наивный includes() пропустил бы ровно тот дрейф, ради которого тест написан.
    assert.match(mapping, new RegExp("item\\." + field + "\\b(?!_)"),
      `importBundle Shape-A не читает item.${field} — паспорт не восстановится`);
    assert.notEqual(t[field], undefined,
      `адаптер не отдаёт ключ ${field}, а importBundle читает именно его`);
  }
  assert.ok(t.source_meta.source.audio.media.opfsPath);
  assert.deepEqual(t.table_model_meta, { probe: 1 });
});

test("контракт: createText пишет table_model_meta_json, addSentence — провенанс перевода", () => {
  // Паспорт «Обновить карточку» жил в table_model_meta_json, а createText такой
  // колонки не знал — он терялся на КАЖДОМ импорте, включая обычный бандл.
  const createTextSrc = LOCAL_DB_SRC.slice(
    LOCAL_DB_SRC.indexOf("export async function createText"),
    LOCAL_DB_SRC.indexOf("export async function updateText"));
  assert.ok(/INSERT INTO texts[\s\S]*table_model_meta_json/.test(createTextSrc),
    "createText не пишет table_model_meta_json");

  const addSentenceSrc = LOCAL_DB_SRC.slice(
    LOCAL_DB_SRC.indexOf("export async function addSentence"),
    LOCAL_DB_SRC.indexOf("async function _touchTextUpdatedAt"));
  assert.ok(/INSERT INTO sentences[\s\S]*translation_provider[\s\S]*translation_meta_json/.test(addSentenceSrc),
    "addSentence не пишет провенанс перевода");
  // Производные колонки писать НЕ должны.
  assert.ok(!/INSERT INTO sentences[\s\S]*\bhe_norm\b/.test(addSentenceSrc));
  assert.ok(!/INSERT INTO sentences[\s\S]*\brow_hash\b/.test(addSentenceSrc));
});

test("контракт: index.html экспортирует v2 и принимает обе версии", () => {
  const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  assert.ok(html.includes('<script src="/js/text-card-format.js"></script>'),
    "text-card-format.js не подключён — window.TextCardFormat будет undefined");
  assert.ok(html.includes("TextCardFormat.buildCardPayload"));
  assert.ok(html.includes("TextCardFormat.cardToBundle"));
  assert.ok(/TCF\.detectCard\(/.test(html), "детект формата не подключён к ядру");
  const sw = fs.readFileSync(path.join(__dirname, "../public/sw.js"), "utf8");
  assert.ok(sw.includes('"/js/text-card-format.js"'), "модуль не в PRECACHE — офлайн-сессия его потеряет");
  assert.deepEqual(TCF.SUPPORTED_FORMATS, ["linguistpro-text-card-v1", "linguistpro-text-card-v2"]);
});
