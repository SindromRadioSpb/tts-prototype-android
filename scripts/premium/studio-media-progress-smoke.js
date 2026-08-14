#!/usr/bin/env node
"use strict";

// Regression gate 2026-08-14: Studio media karaoke moves a private table
// scroller without selecting rows. That visible working place must still write
// the same canonical text_progress row used by Studio/Room Continue.

const path = require("path");
const { spawn, spawnSync } = require("child_process");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3298;
const BASE = `http://127.0.0.1:${PORT}`;
const failures = [];
let checks = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (condition, message) => {
  checks++;
  if (condition) console.log("  ✓ " + message);
  else { failures.push(message); console.log("  ✗ " + message); }
};

function startServer() {
  return spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

async function stopServer(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  const exited = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(timer); resolve(true); });
  });
  if (!exited && process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  }
}

async function ready(timeout = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    try { if ((await fetch(BASE + "/healthz")).ok) return true; } catch (_) {}
    await sleep(200);
  }
  return false;
}

async function main() {
  const server = startServer();
  if (!await ready()) throw new Error("local server did not start");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error.message || error)));
    await page.goto(BASE + "/index.html", { waitUntil: "load", timeout: 60000 });
    await page.waitForFunction(() => typeof window.v3LibraryOpenText === "function" && typeof window.ensureLocalDB === "function", null, { timeout: 90000 });
    await page.evaluate(() => {
      for (const id of ["v3OnboardingModal", "v3Phase6Modal"]) {
        const node = document.getElementById(id); if (node) node.remove();
      }
    });

    const seeded = await page.evaluate(async () => {
      const db = await window.ensureLocalDB();
      const textId = "smpr-media";
      try { await db.dbRun("DELETE FROM text_progress WHERE text_id=?", [textId]); } catch (_) {}
      try { await db.dbRun("DELETE FROM sentences WHERE text_id=?", [textId]); } catch (_) {}
      try { await db.dbRun("DELETE FROM texts WHERE id=?", [textId]); } catch (_) {}
      const rows = Array.from({ length: 64 }, (_, i) => `שורת מדיה ארוכה מספר ${i}`);
      const passport = { source: { audio: {
        v: 1,
        media: { opfsPath: "media/smpr-missing.mp3", sha256: "smpr-media", mime: "audio/mpeg" },
        segments: rows.map((text, i) => ({ i, start: i, end: i + 0.8, text })),
        timing: { v: 1, unit: "row", entries: rows.map((_, i) => ({ o: i, t: i, end: i + 0.8 })) },
      } } };
      await db.createText({ id: textId, text_key: "smpr-media-key", title: "SMPR media", source_text: rows.join("\n"), table_model_meta_json: JSON.stringify(passport) });
      for (let i = 0; i < rows.length; i++) {
        await db.addSentence(textId, { id: `${textId}-s${i}`, he_plain: rows[i], ru: `медиа строка ${i}` });
      }
      return textId;
    });

    await page.evaluate((textId) => window.v3LibraryOpenText(textId, { resume: false }), seeded);
    await page.waitForFunction(() => document.querySelectorAll("#proTable tbody tr[data-row-idx]").length === 64 && !!window.v3ActiveMediaAudio, null, { timeout: 30000 });
    const followed = await page.evaluate(async (textId) => {
      window.v3MediaFollowTableRange({ rowStart: 45, rowEnd: 45 });
      await new Promise((resolve) => setTimeout(resolve, 1200));
      const db = await window.ensureLocalDB();
      const saved = await db.getProgress(textId);
      const container = document.getElementById("tableContainer");
      return { saved: saved && Number(saved.last_row_idx), scrollTop: container ? container.scrollTop : -1 };
    }, seeded);
    check(followed.scrollTop > 0, `media karaoke follows inside Studio table (${followed.scrollTop})`);
    check(followed.saved === 45, `media karaoke persists canonical working row 45 (${JSON.stringify(followed)})`);

    await page.evaluate((textId) => window.v3LibraryOpenText(textId, { resume: true }), seeded);
    await page.waitForTimeout(1800);
    const reopened = await page.evaluate(() => {
      const container = document.getElementById("tableContainer");
      const row = document.querySelector('#proTable tbody tr[data-row-idx="45"]');
      const cr = container && container.getBoundingClientRect();
      const rr = row && row.getBoundingClientRect();
      return {
        scrollTop: container ? container.scrollTop : -1,
        targetVisible: !!(cr && rr && rr.bottom > cr.top && rr.top < cr.bottom),
        selected: !!(row && row.classList.contains("row-selected")),
      };
    });
    check(reopened.scrollTop > 0 && reopened.targetVisible && reopened.selected,
      `Studio Continue reopens the persisted media row (${JSON.stringify(reopened)})`);
    check(pageErrors.length === 0, `no pageerror (${pageErrors.join(" | ")})`);
  } finally {
    await browser.close();
    await stopServer(server);
  }
  if (failures.length) throw new Error(`${failures.length}/${checks} failed: ${failures.join(" | ")}`);
  console.log(`[studio-media-progress-smoke] PASS ${checks}/${checks}`);
}

main().catch((error) => { console.error(error && error.stack || error); process.exit(1); });
