#!/usr/bin/env node
"use strict";

// room-study-smoke.js — гейт учебного режима Зала (спека docs/superpowers/specs/2026-08-05-room-study-mode-design.md).
// Чистая математика ресайза проверяется в КОНТЕКСТЕ СТРАНИЦЫ (reader-core.js — ESM, пакет
// CommonJS, Node напрямую его не импортирует — тот же приём в reader-parity-smoke.js).
// DOM-инварианты режима — над настоящей library.html с сидом OPFS (шаблон room-media-smoke.js).

const path = require("path");
const { spawn, spawnSync } = require("child_process");
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3274;
const BASE = `http://127.0.0.1:${PORT}`;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function startServer() {
  const child = spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = []; child.stdout.on("data", (c) => logs.push(String(c))); child.stderr.on("data", (c) => logs.push(String(c)));
  return { child, logs };
}
async function stopServer(child) {
  if (!child || child.killed) return; child.kill("SIGTERM");
  const exited = await new Promise((res) => { const tm = setTimeout(() => res(false), 5000); child.once("exit", () => { clearTimeout(tm); res(true); }); });
  if (exited) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); else child.kill("SIGKILL");
}
async function ready(ms = 20000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

const failures = [];
function ok(cond, msg) { if (!cond) { failures.push(msg); console.error("  x " + msg); } else { console.log("  + " + msg); } }

async function main() {
  const srv = startServer();
  if (!await ready()) { console.error("[room-study-smoke] server did not start"); await stopServer(srv.child); process.exit(1); }
  const { chromium } = require("playwright");
  const b = await chromium.launch();
  try {
    const pg = await b.newPage({ viewport: { width: 380, height: 845 } });
    await pg.goto(BASE + "/library.html", { waitUntil: "domcontentloaded" });

    // ── Секция 1: чистая математика связанного ресайза ──────────────────────
    console.log("[1] resize math");
    const math = await pg.evaluate(async () => {
      let m; try { m = await import("/js/reader-core.js"); } catch (e) { return { err: String(e) }; }
      if (typeof m.applyLinkedResize !== "function") return { err: "applyLinkedResize not exported" };
      const vis = { action: true, he: true, niqqud: true, translit: true, ru: true };
      const sum = (w) => [0, 1, 2, 3, 4].reduce((a, i) => a + w[i], 0);

      // (a) обычный сдвиг: сумма пары сохраняется, сумма всех = 100
      const w1 = [15, 20, 20, 21, 24];
      m.applyLinkedResize(vis, w1, "he", "niqqud", 20, 20, 5);
      const a = { he: w1[1], niqqud: w1[2], total: sum(w1) };

      // (b) зеркальный сдвиг возвращает к исходному
      const w2 = [15, 20, 20, 21, 24];
      m.applyLinkedResize(vis, w2, "he", "niqqud", 20, 20, 5);
      m.applyLinkedResize(vis, w2, "he", "niqqud", w2[1], w2[2], -5);
      const bsym = { he: w2[1], niqqud: w2[2] };

      // (c) кламп минимума: колонка не уходит ниже RESIZE_MIN_COL_PERCENT
      const w3 = [15, 20, 20, 21, 24];
      m.applyLinkedResize(vis, w3, "he", "niqqud", 20, 20, -50);
      const c = { he: w3[1], min: m.RESIZE_MIN_COL_PERCENT, total: sum(w3) };

      // (d) кламп максимума
      const w4 = [15, 20, 20, 21, 24];
      m.applyLinkedResize(vis, w4, "he", "niqqud", 20, 20, 500);
      const d = { he: w4[1], max: m.RESIZE_MAX_COL_PERCENT, total: sum(w4) };

      // (e) частичный набор колонок: сумма ВИДИМЫХ = 100
      const visPartial = { action: true, he: false, niqqud: true, translit: false, ru: true };
      const w5 = [15, 20, 20, 21, 24];
      m.applyLinkedResize(visPartial, w5, "niqqud", "ru", 20, 24, 4);
      const e = { visibleTotal: w5[0] + w5[2] + w5[4] };
      return { a, bsym, c, d, e };
    });
    ok(!math.err, "reader-core: applyLinkedResize экспортирован (" + (math.err || "ok") + ")");
    if (!math.err) {
      ok(Math.abs(math.a.he - 25) < 1e-6 && Math.abs(math.a.niqqud - 15) < 1e-6,
        "resize: пара движется связанно (he 25 / niqqud 15), получено " + math.a.he + " / " + math.a.niqqud);
      ok(Math.abs(math.a.total - 100) < 1e-6, "resize: сумма всех = 100, получено " + math.a.total);
      ok(Math.abs(math.bsym.he - 20) < 1e-6 && Math.abs(math.bsym.niqqud - 20) < 1e-6,
        "resize: зеркальный сдвиг возвращает исходные ширины");
      ok(math.c.he >= math.c.min - 1e-6, "resize: минимум держится (" + math.c.he + " >= " + math.c.min + ")");
      ok(Math.abs(math.c.total - 100) < 1e-6, "resize: сумма после клампа минимума = 100");
      ok(math.d.he <= math.d.max + 1e-6, "resize: максимум держится (" + math.d.he + " <= " + math.d.max + ")");
      ok(Math.abs(math.e.visibleTotal - 100) < 1e-6,
        "resize: при частичном наборе сумма ВИДИМЫХ = 100, получено " + math.e.visibleTotal);
    }
  } finally { await b.close(); await stopServer(srv.child); }

  if (failures.length) { console.error("FAIL — " + failures.length + " assertion(s)"); process.exit(1); }
  console.log("[room-study-smoke] PASS");
}

main().catch((e) => { console.error("[room-study-smoke] crashed:", e); process.exit(1); });
