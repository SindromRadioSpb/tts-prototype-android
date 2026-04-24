const test = require("node:test");
const assert = require("node:assert/strict");
const os = require("node:os");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

test("library repo tolerates legacy texts schema without week9 columns", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tts-lib-legacy-"));
  const dbPath = path.join(tmpDir, "legacy.db");

  const script = `
    const path = require("node:path");
    const { initDb, getDb, closeDb } = require(path.join(process.cwd(), "db", "sqlite"));
    const { listTexts, getTextById } = require(path.join(process.cwd(), "db", "libraryRepo"));

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
        CREATE TABLE audio_assets (
          id TEXT PRIMARY KEY,
          asset_key TEXT,
          tts_profile_json TEXT,
          created_at TEXT,
          last_used_at TEXT
        );
        CREATE TABLE text_audio (
          text_id TEXT NOT NULL,
          audio_id TEXT NOT NULL,
          is_default INTEGER NOT NULL DEFAULT 0
        );
      \`);

      await exec(
        "INSERT INTO texts (id, text_key, title, level, tags_json, source_text, source_meta_json, tts_profile_json, table_model_meta_json, is_archived, created_at, updated_at, last_opened_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)",
        [
          "text-1",
          "key-1",
          "Legacy title",
          "A1",
          JSON.stringify(["legacy"]),
          "שלום עולם",
          null,
          null,
          null,
          "2026-04-24T10:00:00.000Z",
          "2026-04-24T10:00:00.000Z",
          "2026-04-24T10:00:00.000Z"
        ]
      );

      const list = await listTexts({ limit: 10, q: "legacy" });
      const text = await getTextById("text-1");
      await closeDb();

      process.stdout.write(JSON.stringify({ list, text }));
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
  assert.equal(Array.isArray(payload.list), true);
  assert.equal(payload.list.length, 1);
  assert.equal(payload.list[0].title, "Legacy title");
  assert.equal(payload.list[0].source, null);
  assert.equal(payload.list[0].topic, null);
  assert.equal(payload.list[0].is_pinned, 0);
  assert.equal(payload.text.id, "text-1");
  assert.equal(payload.text.source, null);
  assert.equal(payload.text.topic, null);
  assert.equal(payload.text.is_pinned, 0);
});
