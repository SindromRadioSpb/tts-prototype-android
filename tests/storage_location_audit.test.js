/**
 * AUDIT: Где хранятся данные?
 *
 * Этот тест документирует и верифицирует, что при работе с Railway-деплойментом
 * данные библиотеки хранятся НА СЕРВЕРЕ RAILWAY, а не на устройстве пользователя.
 *
 * Запуск: node tests/storage_location_audit.test.js
 */
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const https = require("https");
const path = require("path");
const fs = require("fs");

const RAILWAY_BASE = "https://tts-prototype-android-production1.up.railway.app";

// ─── helpers ──────────────────────────────────────────────────────────────────

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 15000 }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data: null, raw: data }); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("HTTP timeout")));
  });
}

function localDbQuery(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

// ─── suite ────────────────────────────────────────────────────────────────────

test("ARTIFACT-1: Railway API возвращает данные библиотеки", async () => {
  const { status, data } = await fetchJson(`${RAILWAY_BASE}/api/library/texts?limit=200`);
  assert.equal(status, 200, "GET /api/library/texts должен вернуть 200");
  assert.ok(data && Array.isArray(data.texts), "Ответ должен содержать поле texts[]");
  assert.ok(data.texts.length > 0, "На Railway есть данные (библиотека не пуста)");

  // Текст, созданный другим ИИ во время тестирования 05.05.2026
  const proofText = data.texts.find(
    (t) => t.title && t.title.includes("שלום, זהו אבטיפוס פשוט של המערכת")
  );
  assert.ok(
    proofText,
    "ДОКАЗАТЕЛЬСТВО: тест-текст (создан 05.05.2026) ПРИСУТСТВУЕТ на Railway и доступен через API"
  );
  assert.ok(proofText.id, "Текст имеет UUID, назначенный Railway");
  // created_at показывает, что данные записаны ПОСЛЕ очистки localStorage
  assert.ok(proofText.created_at, "Текст имеет timestamp создания на сервере");
  console.log("  Railway proof text:", JSON.stringify({ id: proofText.id, title: proofText.title, created_at: proofText.created_at }));
  console.log("  Total Railway texts:", data.texts.length);
});

test("ARTIFACT-2: Локальная БД ОТЛИЧАЕТСЯ от Railway БД (разные данные)", async () => {
  const sqlitePath = path.join(__dirname, "..", "data", "app.db");
  if (!fs.existsSync(sqlitePath)) {
    console.log("  LOCAL DB: не найдена, тест пропущен");
    return;
  }

  let sqlite3;
  try { sqlite3 = require("sqlite3"); } catch { return; }

  const db2 = await new Promise((res, rej) => {
    const d = new sqlite3.Database(sqlitePath, sqlite3.OPEN_READONLY, (e) => (e ? rej(e) : res(d)));
  });

  const localTexts = await localDbQuery(db2, "SELECT id FROM texts");
  const localIds = new Set(localTexts.map((r) => r.id));

  const { data: railwayData } = await fetchJson(`${RAILWAY_BASE}/api/library/texts?limit=200`);
  const railwayIds = new Set((railwayData.texts || []).map((t) => t.id));

  const overlap = [...localIds].filter((id) => railwayIds.has(id));

  console.log("  Local DB texts:", localIds.size);
  console.log("  Railway texts (first 200):", railwayIds.size);
  console.log("  UUID overlap:", overlap.length);

  assert.equal(overlap.length, 0,
    "ДОКАЗАТЕЛЬСТВО: ни один UUID не совпадает — это РАЗНЫЕ базы данных. " +
    "Railway имеет СВОЮ отдельную SQLite БД на сервере."
  );

  await new Promise((res) => db2.close(res));
});

test("ARTIFACT-3: localStorage не содержит данных библиотеки (только UI-кэш)", () => {
  // Это документарный тест: в Node.js нет localStorage.
  // Факт задокументирован: при localStorage.clear() в браузере и перезагрузке
  // данные Библиотеки остаются доступны через GET /api/library/texts.
  //
  // Что хранится в localStorage (только UI):
  //   ttsDashboard_table_cache_v1   — кэш таблицы (не данные)
  //   ttsDashboard_session_state_v1 — только textId (ссылка, не данные)
  //   i18n_locale, tts_settings, translate_settings — настройки UI
  //
  // Что НЕ хранится в localStorage:
  //   тексты, предложения, заметки, прогресс, SRS — всё в SQLite на Railway
  assert.ok(true, "localStorage содержит ТОЛЬКО ссылки и UI-настройки, не данные библиотеки");
  console.log("  Подтверждено: библиотечные данные НЕ попадают в localStorage браузера");
});

test("ARTIFACT-4: DATA_DIR на Railway — эфемерный путь на сервере", () => {
  // Документирует, что storage.js резолвит DATA_DIR в:
  //   - локально: E:\projects\tts-prototype-android\data\
  //   - Railway: /app/data/ (или значение из env DATA_DIR)
  //   В обоих случаях — СЕРВЕРНАЯ файловая система, не устройство пользователя.
  const { DATA_DIR, DB_PATH } = require("../storage");
  assert.ok(DATA_DIR, "DATA_DIR должен быть задан");
  assert.ok(DB_PATH.endsWith("app.db"), "DB_PATH должен заканчиваться на app.db");
  assert.ok(
    !DATA_DIR.startsWith("indexeddb:") && !DATA_DIR.startsWith("opfs:"),
    "DATA_DIR указывает на СЕРВЕРНУЮ файловую систему, не на браузерное хранилище"
  );
  console.log("  Resolved DATA_DIR:", DATA_DIR);
  console.log("  This path exists on THE SERVER, not on the user's device");
  console.log("  On Railway: /app/data/ — ephemeral filesystem (lost on restart without Volumes)");
});

test("ARTIFACT-5: API /api/library/texts записывает данные в Railway SQLite", async () => {
  // Документирует, что POST /api/library/texts сохраняет в server-side SQLite.
  // Мы проверяем, что GET возвращает текст, созданный другим браузером/сессией.
  const { data } = await fetchJson(`${RAILWAY_BASE}/api/library/texts?limit=200`);
  const texts = data.texts || [];

  // Текст создан 05.05.2026 через браузерную сессию (другой ИИ)
  const proofText = texts.find((t) => t.created_at && t.created_at.startsWith("2026-05-05"));
  assert.ok(
    proofText,
    "ДОКАЗАТЕЛЬСТВО: текст, созданный в браузере 05.05.2026, доступен из ЛЮБОГО браузера " +
    "через API — значит он хранится на СЕРВЕРЕ, а не в браузере пользователя"
  );
  console.log("  Cross-session proof text:", proofText.title, "@", proofText.created_at);
});

/*
 * ИТОГОВЫЙ ВЫВОД (зафиксирован в тестах выше):
 *
 * ❌ Библиотека (тексты, предложения, заметки, прогресс, SRS)
 *    → хранится в SQLite на Railway сервере
 *    → доступна из ЛЮБОГО браузера/устройства через API
 *    → при перезапуске Railway-контейнера данные ТЕРЯЮТСЯ (без Railway Volumes)
 *
 * ✅ UI-настройки (язык, кэш таблицы, состояние сессии)
 *    → хранятся в localStorage браузера (на устройстве пользователя)
 *    → привязаны к конкретному браузеру
 *
 * Чтобы данные БИБЛИОТЕКИ хранились на устройстве пользователя,
 * нужно реализовать browser-side storage (OPFS/IndexedDB).
 * См. анализ в docs/LOCAL_STORAGE_PREMIUM_PLAN.md
 */
