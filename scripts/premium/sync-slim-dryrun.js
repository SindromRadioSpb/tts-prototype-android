#!/usr/bin/env node
"use strict";
// sync-slim dry-run (SYNC_HARDENING_P0P2_DESIGN §6.10, критика F1-11): размерная гистограмма
// slim per-text бандлов + размер state_bundle на РЕАЛЬНОМ масштабе (Library/test-enriched.zip:
// 80 текстов, ~9K ②-заметок — профиль §3.4-класса), а не на вере. Порог 200 КБ/текст
// утверждается этим замером. Отчёт — в stdout; ничего не пишет в репо.
// Run: node scripts/premium/sync-slim-dryrun.js

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, spawnSync } = require("child_process");
const AdmZip = require("adm-zip");
const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3291, BASE = "http://127.0.0.1:" + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer(dataDir) {
  const c = spawn(process.execPath, ["server.js"], {
    cwd: REPO, env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = []; c.stdout.on("data", (x) => logs.push(String(x))); c.stderr.on("data", (x) => logs.push(String(x)));
  return { c, logs };
}
async function stop(c) {
  if (!c || c.killed) return;
  c.kill("SIGTERM");
  const ok = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); c.once("exit", () => { clearTimeout(t); r(true); }); });
  if (!ok && process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
}

(async () => {
  let pw; try { pw = require("playwright"); } catch (e) { console.error("no playwright"); process.exit(1); }
  const zipPath = path.join(REPO, "Library", "test-enriched.zip");
  if (!fs.existsSync(zipPath)) { console.error("no Library/test-enriched.zip"); process.exit(1); }
  const z = new AdmZip(zipPath);
  const lib = JSON.parse(z.readAsText("library/library.json"));
  const adv = JSON.parse(z.readAsText("library/notes_advanced.json"));
  const bundle = { manifest: {}, library: lib, notes_advanced: adv };
  console.log("[dryrun] fixture: texts=" + (lib.texts || []).length + " notes=" + ((adv && adv.notes) || []).length
    + " occurrences=" + ((adv && adv.occurrences) || []).length);

  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lp-slim-dryrun-"));
  const srv = startServer(scratch);
  const b = await pw.chromium.launch();
  try {
    const s = Date.now();
    let up = false;
    while (Date.now() - s < 30000) {
      try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) { up = true; break; } } catch (_) {}
      await sleep(200);
    }
    if (!up) { console.error("server failed\n" + srv.logs.join("").slice(-1500)); process.exit(1); }
    const ctx = await b.newContext({ serviceWorkers: "block" });
    const pg = await ctx.newPage();
    await pg.route("**/__dryrun_bundle__", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify(bundle) }));
    await pg.goto(BASE + "/library.html?canon=skip&nocloudauto=1", { waitUntil: "load" });
    const report = await pg.evaluate(async () => {
      const ldb = await import("/db/local-db.js");
      await ldb.initLocalDB();
      // Дать бут-фазе Зала (сиды/миграции через тот же worker) дописаться: большой импорт
      // держит BEGIN долго, конкурентный бут-BEGIN = «transaction within a transaction».
      await new Promise((r2) => setTimeout(r2, 5000));
      const bundle2 = await (await fetch("/__dryrun_bundle__")).json();
      const t0 = Date.now();
      let imp = null;
      for (let att = 0; att < 3; att++) {
        try { imp = await ldb.importBundle(bundle2, { mode: "skip" }); break; }
        catch (e) {
          if (String(e && e.message).includes("transaction") && att < 2) { await new Promise((r2) => setTimeout(r2, 3000)); continue; }
          throw e;
        }
      }
      const tImport = Date.now() - t0;
      const texts = await ldb.dbQuery("SELECT id, text_key, title FROM texts", []);
      const sizes = [];
      const t1 = Date.now();
      for (const t of texts) {
        const slim = await ldb.exportBundle({ textIds: [t.id], slim: true });
        sizes.push({ key: t.text_key, bytes: JSON.stringify(slim).length, title: (t.title || "").slice(0, 40) });
      }
      const tSlim = Date.now() - t1;
      const t2 = Date.now();
      const state = await ldb.exportStateBundle();
      const stateBytes = JSON.stringify(state).length;
      const tState = Date.now() - t2;
      // fat-сравнение: один типичный текст полным составом
      const fat = await ldb.exportBundle({ textIds: [texts[0].id] });
      const fatBytes = JSON.stringify(fat).length;
      const st = state.state || {};
      return {
        imported: imp.imported, skipped: imp.skipped, errors: (imp.errors || []).length,
        tImport, tSlim, tState,
        sizes, stateBytes, fatBytes,
        stateCounts: {
          notes: (st.notes || []).length, versions: (st.versions || []).length, links: (st.links || []).length,
          occurrences: (st.occurrences || []).length, occSkipped: state.occ_skipped || 0,
          shelves: (st.shelves || []).length, overrides: (st.translation_overrides || []).length,
          anki: (st.anki_word_exports || []).length, study_day: (st.study_day || []).length, roots: (st.roots || []).length,
        },
      };
    });
    const ss = report.sizes.map((x) => x.bytes).sort((a, b) => a - b);
    const pct = (p) => ss[Math.min(ss.length - 1, Math.floor(ss.length * p))];
    const kb = (n) => (n / 1024).toFixed(1) + "KB";
    console.log("[dryrun] imported=" + report.imported + " skipped=" + report.skipped + " errors=" + report.errors
      + " (import " + report.tImport + "ms, slim-exports " + report.tSlim + "ms, state-export " + report.tState + "ms)");
    console.log("[dryrun] slim per-text: n=" + ss.length + " min=" + kb(ss[0]) + " p50=" + kb(pct(0.5))
      + " p90=" + kb(pct(0.9)) + " p99=" + kb(pct(0.99)) + " max=" + kb(ss[ss.length - 1]));
    const over = report.sizes.filter((x) => x.bytes > 200 * 1024);
    console.log("[dryrun] >200KB: " + over.length + (over.length ? " → " + over.slice(0, 5).map((x) => x.key + "=" + kb(x.bytes)).join(", ") : ""));
    console.log("[dryrun] state_bundle: " + kb(report.stateBytes) + " (cap 24MB, 75%-warn 18MB) · counts=" + JSON.stringify(report.stateCounts));
    console.log("[dryrun] fat-сравнение (первый текст, полный состав): " + kb(report.fatBytes));
    const capOk = report.stateBytes < 18 * 1024 * 1024;
    console.log(capOk ? "[dryrun] OK — state ниже warn-порога" : "[dryrun] ⚠ state выше 75% капа — пересмотреть состав/кап");
    await ctx.close();
  } catch (e) {
    console.error("CRASH:", e && e.stack || e);
    process.exitCode = 1;
  } finally {
    await b.close().catch(() => {});
    await stop(srv.c);
    try { fs.rmSync(scratch, { recursive: true, force: true }); } catch (_) {}
  }
})();
