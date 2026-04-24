const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

test("history repo tolerates legacy texts schema in dashboard queries", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-dash-legacy-"));
  const dbPath = path.join(tmpDir, "legacy-dashboard.db");

  const script = `
    const path = require("node:path");
    const { initDb, getDb, closeDb } = require(path.join(process.cwd(), "db", "sqlite"));
    const { listRecentTexts, listRecentActivity } = require(path.join(process.cwd(), "db", "historyRepo"));

    (async () => {
      await initDb(${JSON.stringify(dbPath)});
      const db = getDb();

      const exec = (sql, params = []) => new Promise((resolve, reject) => {
        if (!params.length) {
          db.exec(sql, (err) => err ? reject(err) : resolve());
          return;
        }
        db.run(sql, params, (err) => err ? reject(err) : resolve());
      });

      await exec(\`
        CREATE TABLE texts (
          id TEXT PRIMARY KEY,
          text_key TEXT NOT NULL,
          title TEXT NOT NULL,
          level TEXT,
          tags_json TEXT,
          source_text TEXT NOT NULL,
          source_meta_json TEXT,
          tts_profile_json TEXT,
          table_model_meta_json TEXT,
          is_archived INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          last_opened_at TEXT
        );
        CREATE TABLE sentences (
          id TEXT PRIMARY KEY,
          text_id TEXT NOT NULL,
          order_index INTEGER NOT NULL,
          he_plain TEXT,
          he_niqqud TEXT,
          translit TEXT,
          ru TEXT
        );
        CREATE TABLE recent_texts (
          text_id TEXT NOT NULL PRIMARY KEY,
          last_seen_at TEXT NOT NULL,
          seen_count INTEGER NOT NULL DEFAULT 0,
          last_sentence_id TEXT,
          last_asset_key TEXT
        );
        CREATE TABLE recent_rows (
          text_id TEXT NOT NULL,
          sentence_id TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          seen_count INTEGER NOT NULL DEFAULT 0,
          last_asset_key TEXT,
          PRIMARY KEY (text_id, sentence_id)
        );
      \`);

      await exec(
        "INSERT INTO texts (id, text_key, title, level, tags_json, source_text, source_meta_json, tts_profile_json, table_model_meta_json, is_archived, created_at, updated_at, last_opened_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)",
        [
          "text-1",
          "key-1",
          "Legacy dash title",
          "A1",
          JSON.stringify(["dash"]),
          "שלום עולם",
          null,
          null,
          null,
          "2026-04-24T10:00:00.000Z",
          "2026-04-24T10:00:00.000Z",
          "2026-04-24T10:05:00.000Z"
        ]
      );

      await exec(
        "INSERT INTO sentences (id, text_id, order_index, he_plain, he_niqqud, translit, ru) VALUES (?, ?, ?, ?, ?, ?, ?)",
        ["sent-1", "text-1", 0, "שלום", "שָׁלוֹם", "shalom", "мир"]
      );
      await exec(
        "INSERT INTO recent_texts (text_id, last_seen_at, seen_count, last_sentence_id, last_asset_key) VALUES (?, ?, ?, ?, ?)",
        ["text-1", "2026-04-24T10:06:00.000Z", 3, "sent-1", null]
      );
      await exec(
        "INSERT INTO recent_rows (text_id, sentence_id, last_seen_at, seen_count, last_asset_key) VALUES (?, ?, ?, ?, ?)",
        ["text-1", "sent-1", "2026-04-24T10:07:00.000Z", 5, null]
      );

      const recentTexts = await listRecentTexts({ limit: 10, includeArchived: true });
      const recentActivity = await listRecentActivity({ limit: 10, includeArchived: true });
      await closeDb();

      process.stdout.write(JSON.stringify({ recentTexts, recentActivity }));
    })().catch(async (error) => {
      try { await closeDb(); } catch (_) {}
      console.error(error && error.stack ? error.stack : String(error));
      process.exit(1);
    });
  `;

  const stdout = execFileSync(process.execPath, ["-e", script], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const payload = JSON.parse(stdout);
  assert.equal(payload.recentTexts.length, 1);
  assert.equal(payload.recentTexts[0].text_id, "text-1");
  assert.equal(payload.recentTexts[0].is_pinned, 0);
  assert.equal(payload.recentActivity.length, 1);
  assert.equal(payload.recentActivity[0].text_id, "text-1");
  assert.equal(payload.recentActivity[0].source, null);
  assert.equal(payload.recentActivity[0].topic, null);
  assert.equal(payload.recentActivity[0].is_pinned, 0);
  assert.equal(payload.recentActivity[0].pin_order, null);
});
