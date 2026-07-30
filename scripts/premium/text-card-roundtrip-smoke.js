#!/usr/bin/env node
"use strict";

// smoke:text-card — «карточка текста» (share/import) ПРОТИВ ЖИВОЙ БД, не против юнита.
//
// tests/textCardShare.test.js покрывает чистое ядро public/js/text-card-format.js и
// читает исходник local-db.js. Этого НЕ хватает: реальные потери слайса E1 жили не в
// форме payload, а на шве «адаптер → importBundle → createText/addSentence», где
// молчаливо срабатывают побочные эффекты БД. Этот гейт гоняет НАСТОЯЩИЙ importBundle в
// настоящем OPFS/wa-sqlite и читает результат обратно из таблиц.
//
// Что закрыто (каждый пункт — реально ломавшийся путь):
//   A. round-trip v2: 5 колонок + edit_meta + построчный провенанс + заметки + паспорт
//      (сегменты/тайминг/asr) доезжают без искажений.
//   B. table_model_meta_json переживает ОБЫЧНЫЙ exportBundle→importBundle (ZIP-бэкап):
//      createText не знал этой колонки — паспорт «Обновить карточку» умирал на каждом
//      восстановлении.
//   C. DERIVED-никуд (машинный Nakdan) переживает импорт. Адаптер сознательно кладёт
//      he_niqqud="" и надеется на meta_json.niqqud_derived — а addSentence вызывает
//      clearDerivedNiqqud(textId) ПОСЛЕ каждой вставки и вычищает ровно этот ключ по
//      всему тексту. Значение исчезало и из колонки, и из meta: никуд не «скрыт до
//      пересчёта хэша», а УНИЧТОЖЕН (R11 do-no-harm).
//   D. обратная совместимость: v1-файл (все ранее скачанные владельцем) импортируется
//      с ЖИВЫМ ивритом. Старый адаптер слал `he:`, а importBundle читает
//      `hebrew_plain || he_plain` — ивритская колонка терялась целиком.
//   E. честная деградация без аудио (R11): у получателя байтов медиа нет — медиа-бар
//      виден, play выключен, причина названа, построчные «▶︎» НЕ отрисованы. Проверяется
//      на реально открытом в Студии импортированном тексте, а не на моке.

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = Number(process.env.TEXT_CARD_SMOKE_PORT || 3273);
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${extra !== undefined ? " — " + JSON.stringify(extra) : ""}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (c) => logs.push("[out] " + String(c).trim()));
  child.stderr.on("data", (c) => logs.push("[err] " + String(c).trim()));
  return { child, logs };
}
async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const exited = await new Promise((resolve) => {
    const tm = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(tm); resolve(true); });
  });
  if (exited) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGKILL");
}
async function waitForReady(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {}
    await sleep(200);
  }
  return false;
}

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[text-card-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  if (!(await waitForReady())) {
    console.error("[text-card-smoke] server failed to start");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child);
    process.exit(1);
  }
  console.log("[text-card-smoke] server up");

  const browser = await playwright.chromium.launch();
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    const pageErrors = [];
    pg.on("pageerror", (e) => pageErrors.push(String(e)));
    await pg.goto(BASE + "/index.html", { waitUntil: "load" });
    await sleep(1500);

    const R = await pg.evaluate(async () => {
      const out = {};
      let ldb = null;
      for (let i = 0; i < 20 && !ldb; i++) {
        try { if (window.__localDBInitPromise) await window.__localDBInitPromise; } catch (_) {}
        try { const l = await window.ensureLocalDB(); if (l && typeof l.importBundle === "function") ldb = l; } catch (_) {}
        if (!ldb) await new Promise((r) => setTimeout(r, 500));
      }
      if (!ldb) { out.dbSkipped = true; return out; }
      out.hasTCF = !!window.TextCardFormat;
      if (!out.hasTCF) return out;

      const ROWS = 40, SEGS = 20;
      const clean = async () => {
        for (const t of (await ldb.dbQuery("SELECT id FROM texts WHERE text_key LIKE 'TCARD_%'") || []))
          await ldb.dbRun("DELETE FROM texts WHERE id = ?", [t.id]);
      };
      await clean();

      // ── паспорт в форме, которую пишет реальный аудио-импорт (S4/S12) ─────
      const segments = [];
      for (let i = 0; i < SEGS; i++) segments.push({ i, start: i * 6.1, end: i * 6.1 + 5.9, text: "מקטע " + i });
      const timing = { entries: [] };
      // НЕ 1:1 с сегментами — иначе K1-карантин (timingLooksDegenerate) законно снёс бы
      // тайминг, и проверка E прошла бы вхолостую (кнопок нет «потому что тайминга нет»).
      for (let i = 0; i < ROWS; i++) timing.entries.push({ row: i, t: i * 3.05, seg: Math.floor(i * SEGS / ROWS) });
      const passport = {
        source: { kind: "audio", audio: {
          media: { opfsPath: "media/tcard-missing.mp3", sha256: "b".repeat(64), name: "interview.mp3", sizeBytes: 17600000, mime: "audio/mpeg" },
          asr: { model: "gemini-2.5-pro", windows: 2, codeVersion: "3.11.264" },
          segments, timing, timingDropReason: null,
        } }, codeVersion: "3.11.264",
        _portable: { text_audio_asset_key: "text-audio-main" },
      };

      // ── источник: 5 колонок, ASSERTED-никуд, провенанс, заметки ───────────
      const TID = "TCARD_SRC";
      await ldb.createText({ id: TID, text_key: "TCARD_src", title: "Интервью", level: "intermediate",
        tags_json: JSON.stringify(["a", "b"]), source: "YouTube", topic: "history",
        source_text: "שורה", tts_profile_json: JSON.stringify({ voiceName: "he-IL-Wavenet-A" }),
        source_meta_json: JSON.stringify(passport) });
      for (let i = 0; i < ROWS; i++) {
        await ldb.addSentence(TID, {
          id: "TCARD_S" + i, he_plain: "שורה מספר " + i, he_niqqud: "שׁוּרָה מִסְפָּר " + i,
          translit: "shura mispar " + i, translit_ru: "шура миспар " + i, ru: "Строка номер " + i,
          edit_meta_json: i === 0
            ? JSON.stringify({
                edited: { ru: true },
                _studio_source: {
                  schema: "studio-row-source-v1",
                  source_segment_id: "asr-source-0",
                  source_line_index: 0,
                  sentence_index: 7,
                },
              })
            : ((i % 7 === 0) ? JSON.stringify({ edited: { ru: true } }) : null),
          translation_provider: "gemini-2.5-pro",
          translation_meta_json: JSON.stringify({ chunk: Math.floor(i / 12) }),
        });
      }
      await ldb.upsertNote(TID, "TCARD_S3", "заметка на 3-й строке");

      // ── A: экспорт живым путём приложения → импорт → построчная сверка ────
      const v2 = await window.v3TcsBuildCardPayload(TID);
      out.A_format = v2.format;
      const bundle = window.TextCardFormat.cardToBundle(v2, { textKey: "TCARD_dst" });
      const res = await ldb.importBundle(bundle, { mode: "skip" });
      out.A_import = { imported: res.imported, errors: res.errors };
      const newId = (res.importedIds || [])[0] || null;
      out.A_newId = !!newId;
      if (newId) {
        const src = await ldb.dbQuery("SELECT * FROM sentences WHERE text_id = ? ORDER BY order_index", [TID]);
        const dst = await ldb.dbQuery("SELECT * FROM sentences WHERE text_id = ? ORDER BY order_index", [newId]);
        out.A_rowCount = [src.length, dst.length];
        const diffs = {};
        for (const f of ["he_plain", "he_niqqud", "translit", "translit_ru", "ru",
                         "edit_meta_json", "translation_provider", "translation_meta_json"]) {
          let n = 0;
          for (let i = 0; i < Math.min(src.length, dst.length); i++)
            if ((src[i][f] || "") !== (dst[i][f] || "")) n++;
          diffs[f] = n;
        }
        out.A_diffs = diffs;
        const nt = (await ldb.dbQuery("SELECT * FROM texts WHERE id = ?", [newId]))[0];
        const sm = JSON.parse(nt.source_meta_json || "null");
        out.A_passport = {
          segments: sm && sm.source && sm.source.audio ? sm.source.audio.segments.length : -1,
          timing: sm && sm.source && sm.source.audio && sm.source.audio.timing ? sm.source.audio.timing.entries.length : -1,
          asr: sm && sm.source && sm.source.audio && sm.source.audio.asr ? sm.source.audio.asr.model : null,
          cardImport: sm && sm.card_import ? sm.card_import.origin : null,
          mediaEmbedded: sm && sm.card_import ? sm.card_import.media_file_included : "MISSING",
        };
        out.A_head = { title: nt.title, level: nt.level, tags: nt.tags_json, source: nt.source, topic: nt.topic };
        out.A_notes = ((await ldb.listNotes(newId)) || []).map((n) => n.note);
        out.A_importedId = newId;
      }

      // ── B: table_model_meta_json через ОБЫЧНЫЙ бандл (ZIP-бэкап) ──────────
      {
        await ldb.dbRun("UPDATE texts SET table_model_meta_json = ? WHERE id = ?",
          [JSON.stringify({ probe: "tmm", n: 42 }), TID]);
        const b2 = await ldb.exportBundle({ textIds: [TID] });
        out.B_bundleCarries = !!b2.library.texts[0].table_model_meta;
        const bText = b2.library.texts[0];
        const bRow = bText.rows[0];
        out.BC_export = {
          textAudio: bText.text_audio_asset_key || null,
          translationProvider: bRow.translation_provider || null,
          translationMetaChunk: bRow.translation_meta && bRow.translation_meta.chunk,
          editRu: !!(bRow.edit_meta && bRow.edit_meta.edited && bRow.edit_meta.edited.ru),
          sourceSegmentId: bRow.source_segment_id || null,
          sourceLineIndex: bRow.source_line_index,
          sentenceIndex: bRow.sentence_index,
        };
        b2.library.texts[0].text_key = "TCARD_zip";
        const r2 = await ldb.importBundle(b2, { mode: "skip" });
        const id2 = (r2.importedIds || [])[0];
        out.B_restored = id2
          ? (await ldb.dbQuery("SELECT table_model_meta_json AS m FROM texts WHERE id = ?", [id2]))[0].m
          : null;
        if (id2) {
          const restoredText = (await ldb.dbQuery(
            "SELECT source_meta_json FROM texts WHERE id = ?", [id2]))[0];
          const restoredRow = (await ldb.dbQuery(
            "SELECT translation_provider, translation_meta_json, edit_meta_json FROM sentences WHERE text_id = ? ORDER BY order_index LIMIT 1",
            [id2]))[0];
          let restoredSource = null, restoredTranslationMeta = null, restoredEditMeta = null;
          try { restoredSource = JSON.parse(restoredText.source_meta_json || "null"); } catch (_) {}
          try { restoredTranslationMeta = JSON.parse(restoredRow.translation_meta_json || "null"); } catch (_) {}
          try { restoredEditMeta = JSON.parse(restoredRow.edit_meta_json || "null"); } catch (_) {}
          const restoredIdentity = restoredEditMeta && restoredEditMeta._studio_source;
          out.BC_restored = {
            textAudio: restoredSource && restoredSource._portable && restoredSource._portable.text_audio_asset_key,
            translationProvider: restoredRow.translation_provider || null,
            translationMetaChunk: restoredTranslationMeta && restoredTranslationMeta.chunk,
            editRu: !!(restoredEditMeta && restoredEditMeta.edited && restoredEditMeta.edited.ru),
            sourceSegmentId: restoredIdentity && restoredIdentity.source_segment_id,
            sourceLineIndex: restoredIdentity && restoredIdentity.source_line_index,
            sentenceIndex: restoredIdentity && restoredIdentity.sentence_index,
          };
        }
        if (id2) await ldb.dbRun("DELETE FROM texts WHERE id = ?", [id2]);
      }

      // ── C: DERIVED-никуд переживает импорт ────────────────────────────────
      {
        const DT = "TCARD_DERIVED";
        await ldb.createText({ id: DT, text_key: "TCARD_derived", title: "derived", source_text: "x" });
        for (let i = 0; i < 3; i++)
          await ldb.addSentence(DT, { id: "TCARD_D" + i, he_plain: "מה נשמע " + i, he_niqqud: "", ru: "как дела " + i });
        const req = await ldb.getNiqqudRequestForText(DT);
        await ldb.saveDerivedNiqqud(DT, {
          source_hash: req.source_hash,
          niqqud: [0, 1, 2].map((i) => "מַה נִשְׁמָע " + i).join("\n"),
          niqqud_provenance: "nakdan/2026-07", generated_at: "2026-07-01T00:00:00Z", model_version: "v1",
        });
        out.C_srcAuthority = (await ldb.getSentences(DT)).map((p) => p.niqqud_authority);
        const dcard = await window.v3TcsBuildCardPayload(DT);
        const dres = await ldb.importBundle(
          window.TextCardFormat.cardToBundle(dcard, { textKey: "TCARD_derived_imp" }), { mode: "skip" });
        const did = (dres.importedIds || [])[0];
        if (did) {
          const raw = await ldb.dbQuery("SELECT he_niqqud, meta_json FROM sentences WHERE text_id = ? ORDER BY order_index", [did]);
          // Значение НЕ должно исчезнуть: либо в колонке, либо в meta.niqqud_derived.
          out.C_valuePreserved = raw.map((r) => {
            let m = null; try { m = JSON.parse(r.meta_json || "null"); } catch (_) {}
            return !!(String(r.he_niqqud || "").trim() || (m && m.niqqud_derived && String(m.niqqud_derived.value || "").trim()));
          });
          // …и он НЕ должен выдавать себя за ASSERTED (R9): проекция обязана сказать DERIVED.
          out.C_projected = (await ldb.getSentences(did)).map((p) => ({ a: p.niqqud_authority || null, n: String(p.he_niqqud || "") }));
          await ldb.dbRun("DELETE FROM texts WHERE id = ?", [did]);
        }
        await ldb.dbRun("DELETE FROM texts WHERE id = ?", [DT]);
      }

      // ── D: v1-файл (реальная форма старой выгрузки) — иврит доезжает ──────
      {
        const V1 = {
          format: "linguistpro-text-card-v1",
          exported_at: "2026-05-01T10:00:00.000Z", exported_by_app: "linguist-pro-web/3.2.0",
          card: { title: "Старая карточка", level: null, tags: [], source_label: null, topic: null,
            source_text: "שלום", tts_profile: null, text_audio_asset_key: null,
            rows: [{ row_id: "old-1", order_index: 0, hebrew_plain: "שלום", hebrew_niqqud: "שָׁלוֹם",
              translit: "shalom", translit_ru: "шалом", russian: "Привет",
              audio_asset_key: null, edit_meta: null, note: null }] },
        };
        const vres = await ldb.importBundle(
          window.TextCardFormat.cardToBundle(V1, { textKey: "TCARD_v1" }), { mode: "skip" });
        const vid = (vres.importedIds || [])[0];
        out.D_row = vid
          ? (await ldb.dbQuery("SELECT he_plain, he_niqqud, ru FROM sentences WHERE text_id = ?", [vid]))[0]
          : null;
        if (vid) await ldb.dbRun("DELETE FROM texts WHERE id = ?", [vid]);
      }
      return out;
    });

    console.log("\n[A] round-trip v2 → importBundle (живая БД)");
    test("модуль формата загружен в странице (window.TextCardFormat)", R.hasTCF === true, R.dbSkipped ? "DB skipped" : R);
    if (R.dbSkipped) { console.log("  ! OPFS DB unavailable — headless skip"); }
    test("экспорт пишет v2", R.A_format === "linguistpro-text-card-v2", R.A_format);
    test("импорт добавил ровно 1 текст без ошибок", R.A_import && R.A_import.imported === 1 && (R.A_import.errors || []).length === 0, R.A_import);
    test("число строк совпадает", !!R.A_rowCount && R.A_rowCount[0] === R.A_rowCount[1], R.A_rowCount);
    for (const f of ["he_plain", "he_niqqud", "translit", "translit_ru", "ru", "edit_meta_json", "translation_provider", "translation_meta_json"])
      test(`колонка ${f} доехала без искажений`, R.A_diffs && R.A_diffs[f] === 0, R.A_diffs && R.A_diffs[f]);
    test("паспорт: сегменты на месте", R.A_passport && R.A_passport.segments === 20, R.A_passport);
    test("паспорт: тайминг на месте", R.A_passport && R.A_passport.timing === 40, R.A_passport);
    test("паспорт: модель ASR на месте", R.A_passport && R.A_passport.asr === "gemini-2.5-pro", R.A_passport);
    test("провенанс импорта проставлен и честен про медиа", R.A_passport && R.A_passport.cardImport === "text-card-share" && R.A_passport.mediaEmbedded === false, R.A_passport);
    test("шапка текста (title/level/tags/source/topic) доехала",
      !!R.A_head && R.A_head.title === "Интервью" && R.A_head.level === "intermediate" &&
      R.A_head.tags === '["a","b"]' && R.A_head.source === "YouTube" && R.A_head.topic === "history", R.A_head);
    test("заметка строки доехала", Array.isArray(R.A_notes) && R.A_notes.includes("заметка на 3-й строке"), R.A_notes);

    console.log("\n[B] table_model_meta_json переживает обычный exportBundle→importBundle");
    test("exportBundle несёт table_model_meta", R.B_bundleCarries === true, R.B_bundleCarries);
    test("importBundle/createText восстанавливают колонку", R.B_restored === '{"probe":"tmm","n":42}', R.B_restored);
    test("обычный exportBundle несёт text-level audio key, перевод и раздельную source identity",
      !!R.BC_export && R.BC_export.textAudio === "text-audio-main" &&
      R.BC_export.translationProvider === "gemini-2.5-pro" && R.BC_export.translationMetaChunk === 0 &&
      R.BC_export.editRu === true && R.BC_export.sourceSegmentId === "asr-source-0" &&
      R.BC_export.sourceLineIndex === 0 && R.BC_export.sentenceIndex === 7, R.BC_export);
    test("обычный importBundle восстанавливает text-level audio key, перевод и раздельную source identity",
      !!R.BC_restored && R.BC_restored.textAudio === "text-audio-main" &&
      R.BC_restored.translationProvider === "gemini-2.5-pro" && R.BC_restored.translationMetaChunk === 0 &&
      R.BC_restored.editRu === true && R.BC_restored.sourceSegmentId === "asr-source-0" &&
      R.BC_restored.sourceLineIndex === 0 && R.BC_restored.sentenceIndex === 7, R.BC_restored);

    console.log("\n[C] DERIVED-никуд (машинный Nakdan) переживает импорт");
    test("исходник действительно DERIVED", Array.isArray(R.C_srcAuthority) && R.C_srcAuthority.every((a) => a === "DERIVED"), R.C_srcAuthority);
    test("значение никуда НЕ уничтожено импортом (колонка или meta.niqqud_derived)",
      Array.isArray(R.C_valuePreserved) && R.C_valuePreserved.every(Boolean), R.C_valuePreserved);
    test("после импорта никуд читается и помечен DERIVED, не ASSERTED",
      Array.isArray(R.C_projected) && R.C_projected.length === 3 &&
      R.C_projected.every((p, i) => p.a === "DERIVED" && p.n === "מַה נִשְׁמָע " + i), R.C_projected);

    console.log("\n[D] обратная совместимость: v1-файл");
    test("v1: ивритская колонка доехала живой", !!R.D_row && R.D_row.he_plain === "שלום", R.D_row);
    test("v1: никуд и перевод доехали", !!R.D_row && R.D_row.he_niqqud === "שָׁלוֹם" && R.D_row.ru === "Привет", R.D_row);

    // ── E: честная деградация без аудио — на реально открытом тексте ────────
    console.log("\n[E] у получателя нет аудио-файла: честная деградация (R11)");
    if (R.A_importedId) {
      const E = await pg.evaluate(async (textId) => {
        await window.v3LibraryOpenText(textId);
        // медиа-бар резолвит blob асинхронно; ждём стабилизации
        await new Promise((r) => setTimeout(r, 1200));
        const bar = document.getElementById("v3MediaBar");
        const btn = document.getElementById("v3MediaPlayBtn");
        const note = document.getElementById("v3MediaBarNote");
        const a = window.v3ActiveMediaAudio;
        return {
          passportAdopted: !!(a && a.media),
          timingAlive: !!(a && a.timing && a.timing.entries && a.timing.entries.length),
          blob: !!(await (window.v3MediaResolveBlob ? window.v3MediaResolveBlob(a) : null)),
          barVisible: !!bar && !bar.hidden,
          playDisabled: !!btn && btn.disabled === true,
          noteText: note ? note.textContent : "",
          expectedNote: window.t ? window.t("studio.media.fileMissing") : "",
          rowReplayButtons: document.querySelectorAll(".smk-row-replay").length,
          karaokeRunning: !!(window.StudioMediaKaraoke && window.StudioMediaKaraoke.isRunning && window.StudioMediaKaraoke.isRunning()),
        };
      }, R.A_importedId);
      test("паспорт принят при открытии текста", E.passportAdopted === true, E);
      test("тайминг НЕ выродился (иначе проверка кнопок была бы холостой)", E.timingAlive === true, E);
      test("аудио-байтов у получателя действительно нет", E.blob === false, E);
      test("медиа-бар виден", E.barVisible === true, E);
      test("кнопка «▶ Оригинал» выключена", E.playDisabled === true, E);
      test("причина названа словами (studio.media.fileMissing)", !!E.expectedNote && E.noteText === E.expectedNote, E);
      test("построчные «▶︎» НЕ отрисованы (нет тупиковых кнопок)", E.rowReplayButtons === 0, E);
      test("караоке не запущено", E.karaokeRunning === false, E);
      await pg.evaluate(async (id) => {
        const ldb = await window.ensureLocalDB();
        await ldb.dbRun("DELETE FROM texts WHERE id = ?", [id]);
        await ldb.dbRun("DELETE FROM texts WHERE text_key LIKE 'TCARD_%'");
      }, R.A_importedId);
    } else {
      test("импортированный текст доступен для проверки деградации", false, R.A_newId);
    }

    if (pageErrors.length) {
      console.log("\n  page errors:\n   " + pageErrors.slice(0, 5).join("\n   "));
    }
  } finally {
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\ntext-card round-trip: ${passed} passed, ${failed} failed`);
  if (failed > 0) { console.log("TEXT-CARD SMOKE FAILED"); process.exit(1); }
  console.log("TEXT-CARD SMOKE OK");
}

main().catch((e) => { console.error(e); process.exit(1); });
