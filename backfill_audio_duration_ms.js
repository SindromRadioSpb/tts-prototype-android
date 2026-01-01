"use strict";

const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const { initDb, getDb, getDbHealth } = require("./db/sqlite");

// Same default as server.js
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "app.db");

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ changes: this.changes, lastID: this.lastID });
    });
  });
}

function probeMp3DurationMs(absPath) {
  return new Promise((resolve) => {
    try {
      if (!absPath || typeof absPath !== "string") return resolve(null);
      if (!fs.existsSync(absPath)) return resolve(null);

      const args = [
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        absPath,
      ];

      execFile("ffprobe", args, { windowsHide: true }, (err, stdout) => {
        try {
          if (err) return resolve(null);
          const raw = String(stdout || "").trim();
          if (!raw) return resolve(null);
          const sec = Number(raw);
          if (!Number.isFinite(sec) || sec <= 0) return resolve(null);
          return resolve(Math.max(0, Math.round(sec * 1000)));
        } catch (_) {
          return resolve(null);
        }
      });
    } catch (_) {
      return resolve(null);
    }
  });
}

async function main() {
  const LIMIT = Number(process.env.LIMIT || "500");
  const DRY_RUN = String(process.env.DRY_RUN || "0") === "1";

  console.log("[backfill] DB_PATH =", DB_PATH);
  console.log("[backfill] LIMIT  =", LIMIT);
  console.log("[backfill] DRY_RUN=", DRY_RUN ? "1" : "0");

  await initDb(DB_PATH);

  const health = getDbHealth();
  if (!health || !health.ok) {
    console.error("[backfill] DB is not healthy:", health);
    process.exitCode = 2;
    return;
  }

  const db = getDb();

  const targets = await dbAll(
    db,
    "SELECT asset_key, relative_path, created_at FROM audio_assets WHERE duration_ms IS NULL ORDER BY created_at ASC LIMIT ?;",
    [LIMIT]
  );

  console.log(`[backfill] targets = ${targets.length}`);

  let ok = 0;
  let skippedNoFile = 0;
  let skippedNoProbe = 0;
  let updated = 0;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const assetKey = String(t.asset_key || "");
    const relativePath = String(t.relative_path || "");
    const absPath = path.join(__dirname, relativePath);

    if (!assetKey || !relativePath) {
      skippedNoProbe++;
      continue;
    }

    if (!fs.existsSync(absPath)) {
      skippedNoFile++;
      continue;
    }

    const durationMs = await probeMp3DurationMs(absPath);
    if (durationMs == null) {
      skippedNoProbe++;
      continue;
    }

    ok++;

    if (!DRY_RUN) {
      const r = await dbRun(
        db,
        "UPDATE audio_assets SET duration_ms = ? WHERE asset_key = ? AND duration_ms IS NULL;",
        [Number(durationMs), assetKey]
      );
      if (r.changes > 0) updated += r.changes;
    }

    if ((i + 1) % 50 === 0) {
      console.log(`[backfill] progress ${i + 1}/${targets.length} (ok=${ok}, updated=${updated}, noFile=${skippedNoFile}, noProbe=${skippedNoProbe})`);
    }
  }

  console.log("[backfill] done");
  console.log("[backfill] ok durations   =", ok);
  console.log("[backfill] updated rows   =", updated);
  console.log("[backfill] skipped noFile =", skippedNoFile);
  console.log("[backfill] skipped noProbe=", skippedNoProbe);

  // Show remaining null durations
  const remain = await dbAll(db, "SELECT COUNT(*) AS cnt FROM audio_assets WHERE duration_ms IS NULL;", []);
  console.log("[backfill] remaining duration_ms IS NULL =", remain[0] ? remain[0].cnt : "n/a");
}

main().catch((e) => {
  console.error("[backfill] fatal:", e);
  process.exitCode = 1;
});
