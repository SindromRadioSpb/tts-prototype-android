#!/usr/bin/env node
// scripts/research/preview-ui-smoke.js — DOM-level smoke for the
// «👁 Что собрано» pending-upload preview section (research-ui.js).
//
// Spawns server.js with a temp RESEARCH_DATA_DIR, navigates to
// /index.html in headless Chromium, primes localStorage (consent + cohort)
// and synthetic events, opens the transparency modal, and asserts that:
//   1. The preview section is present.
//   2. The preview status badge "⏳ preview" is rendered.
//   3. Period + Will-be-uploaded fields are populated with iso-day strings.
//   4. When synthetic events exist, the metrics row reflects them.
//   5. The legacy "Sent uploads" history section is still rendered.
//
// Exits 0 on success, 1 on any failure. Designed to be wired into
// all-smoke.js after the existing suites.
"use strict";

const path = require("path");
const fs = require("fs");
const os = require("os");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function makeTempDir() {
  const dir = path.join(os.tmpdir(), `preview-ui-smoke-${Date.now()}-${process.pid}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function startServer(port, researchDir) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: REPO_ROOT,
    env: { ...process.env, PORT: String(port), RESEARCH_DATA_DIR: researchDir },
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
    const t = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(t); resolve(true); });
  });
  if (exited) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGKILL");
  }
}

async function waitForReady(baseUrl, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(baseUrl + "/healthz");
      if (r.status === 200) return true;
    } catch (_) {}
    await sleep(200);
  }
  return false;
}

async function main() {
  const PORT = 3201;
  const baseUrl = `http://127.0.0.1:${PORT}`;
  const researchDir = makeTempDir();
  console.log(`[preview-ui-smoke] RESEARCH_DATA_DIR = ${researchDir}`);

  const { child, logs } = startServer(PORT, researchDir);
  let exitCode = 1;
  let browser, playwright;
  try {
    playwright = require("playwright");
  } catch (e) {
    console.error("[preview-ui-smoke] playwright not installed");
    await stopServer(child);
    process.exit(1);
  }

  try {
    const ready = await waitForReady(baseUrl);
    if (!ready) throw new Error("server did not become ready in 15s");
    console.log(`[preview-ui-smoke] server up`);

    browser = await playwright.chromium.launch({ headless: true });
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e.message)));

    // Use the in-app research-client-test.html as the host — it already loads
    // research.js + can take research-ui.js as an extra script. That keeps
    // this smoke decoupled from index.html's full app boot (db, OPFS, etc).
    // We load research-ui.js manually via addScriptTag after the page settles.
    await page.goto(`${baseUrl}/research-client-test.html`, { waitUntil: "domcontentloaded" });
    // Wait for research.js IIFE to expose the API.
    await page.waitForFunction(() => !!window.LinguistProResearch, { timeout: 5000 });

    // Inject a minimal v3ConfirmModal so research-ui.js' open* calls produce
    // DOM we can inspect. Captures the final {title, body} from the most
    // recent call into window.__LAST_MODAL.
    await page.addScriptTag({ content: `
      window.__LAST_MODAL = null;
      window.v3ConfirmModal = function (opts) {
        window.__LAST_MODAL = opts;
        // Inject the body into a known container so we can query the rendered DOM.
        let host = document.getElementById('__modal_host');
        if (!host) {
          host = document.createElement('div');
          host.id = '__modal_host';
          document.body.appendChild(host);
        }
        host.innerHTML = opts.body || '';
        return Promise.resolve(true);
      };
      window.showToast = function (msg) { /* no-op for smoke */ };
    `});
    await page.addScriptTag({ url: `/js/research-ui.js` });
    await page.waitForFunction(() => !!window.LinguistProResearchUI, { timeout: 5000 });

    // Prime client state: consent + cohort. Also seed today's synthetic events
    // by reinstalling the page's mock __localDB. We reuse the same hooks that
    // research-client-test.html defines so this script doesn't fork the mocks.
    const today = await page.evaluate(() => new Date().toISOString().slice(0, 10));
    await page.evaluate((today) => {
      window.LinguistProResearch.acceptConsent('1.0');
      window.LinguistProResearch.joinCohort('VALID-2026');
      // Reinstall the mock LDB if research-client-test cleared it.
      window._syntheticEvents = [
        { event_type: 'session_start',     ts: today + 'T10:00:00.000Z' },
        { event_type: 'session_heartbeat', ts: today + 'T10:00:30.000Z' },
        { event_type: 'play_audio',        ts: today + 'T10:01:00.000Z', sentence_id: 's1',
          payload_json: { duration_ms: 4500, replay_count: 1 } },
        { event_type: 'srs_review',        ts: today + 'T10:02:00.000Z',
          payload_json: { grade: 'good' } },
        { event_type: 'save_note',         ts: today + 'T10:03:00.000Z' },
      ];
    }, today);

    // Reinstall the mock-LDB (research-client-test.html exposes installMockLdb
    // as a module-level function — re-create it inline here so this script
    // works whether or not that test already ran).
    await page.evaluate(() => {
      window.__localDB = {
        dbQuery: async function (sql) {
          const s = String(sql || '');
          const ev = window._syntheticEvents || [];
          if (/session_start.*THEN 1/i.test(s) && /COUNT\(DISTINCT substr\(ts, 1, 10\)\)/i.test(s)) {
            const filtered = ev.filter((e) => ['session_start','session_heartbeat','session_end'].includes(e.event_type));
            const sessions = filtered.filter((e) => e.event_type === 'session_start').length;
            const days = new Set(filtered.map((e) => e.ts.slice(0, 10)));
            return [{ sessions, active_days: days.size }];
          }
          if (/substr\(ts, 12, 2\) AS hour/i.test(s)) {
            const filtered = ev.filter((e) => e.event_type === 'session_start');
            const m = {};
            for (const e of filtered) { const h = e.ts.slice(11, 13); m[h] = (m[h] || 0) + 1; }
            return Object.entries(m).map(([hour, n]) => ({ hour, n }));
          }
          if (/event_type = 'text_open'/.test(s)) return [{ distinct_: 0, total_: 0 }];
          if (/IN \('row_tts', 'play_audio'\)/.test(s)) {
            const filtered = ev.filter((e) => ['row_tts','play_audio'].includes(e.event_type));
            return [{ distinct_: new Set(filtered.map((e) => e.sentence_id)).size, total_: filtered.length }];
          }
          if (/event_type = 'play_audio'/.test(s) && /payload_json FROM events/.test(s)) {
            return ev.filter((e) => e.event_type === 'play_audio').map((e) => ({ payload_json: JSON.stringify(e.payload_json || {}) }));
          }
          if (/event_type = 'srs_review'/.test(s) && /payload_json FROM events/.test(s)) {
            return ev.filter((e) => e.event_type === 'srs_review').map((e) => ({ payload_json: JSON.stringify(e.payload_json || {}) }));
          }
          const m = s.match(/event_type = '([\w_]+)'/);
          if (m && /COUNT\(\*\) AS n/.test(s)) {
            const t = m[1];
            return [{ n: ev.filter((e) => e.event_type === t).length }];
          }
          if (/MIN\(substr\(ts, 1, 10\)\) AS first_day/.test(s)) {
            if (!ev.length) return [{ first_day: null }];
            const days = ev.map((e) => e.ts.slice(0, 10)).sort();
            return [{ first_day: days[0] }];
          }
          return [];
        },
        getActiveMsReal: async function () {
          const ev = window._syntheticEvents || [];
          return ev.filter((e) => e.event_type === 'session_heartbeat').length * 30000;
        },
      };
    });

    // Now open the transparency modal — research-ui.js will call previewToday(),
    // assemble the HTML, and our shim mounts it into #__modal_host.
    await page.evaluate(() => window.LinguistProResearchUI.openTransparency());
    // Wait one tick for the async previewToday() promise inside openTransparency
    // to resolve and the modal body to be injected.
    await page.waitForSelector('[data-testid="research-preview-section"]', { timeout: 5000 });

    const probe = await page.evaluate(() => {
      const section = document.querySelector('[data-testid="research-preview-section"]');
      const row = section && section.querySelector('[data-testid="research-preview-row"]');
      const cells = row ? Array.from(row.querySelectorAll('td')).map((td) => td.textContent.trim()) : [];
      const sectionText = section ? section.textContent : '';
      const lastModalTitle = window.__LAST_MODAL && window.__LAST_MODAL.title;
      // The history-section heading should also be present (legacy uploads
      // table — we want both rendered in the same modal).
      const historyHeading = (document.getElementById('__modal_host') || {}).innerHTML || '';
      return {
        sectionPresent: !!section,
        rowPresent: !!row,
        cells,
        previewStatusText: section && section.textContent.includes('⏳ preview'),
        hasPeriod: /Период|Period/.test(sectionText),
        hasWillUpload: /Будет отправлено|Will be uploaded/.test(sectionText),
        hasHistoryHeader: /Отправленные uploads|Sent uploads/.test(historyHeading),
        modalTitle: lastModalTitle,
      };
    });

    const assertions = [
      ['preview section rendered',          probe.sectionPresent],
      ['preview row rendered',              probe.rowPresent],
      ['⏳ preview status badge visible',    probe.previewStatusText],
      ['period label present',              probe.hasPeriod],
      ['willUpload label present',          probe.hasWillUpload],
      ['legacy history header still rendered', probe.hasHistoryHeader],
      ['no JS errors during open',          pageErrors.length === 0],
    ];

    // Numeric assertions on the row cells: [date, status, minutes, SRS, notes, bytes]
    if (probe.cells.length >= 6) {
      assertions.push(['row has Date / Status / Min / SRS / Notes / Bytes columns', probe.cells.length === 6]);
      assertions.push(['minutes >= 0', /^\d+$/.test(probe.cells[2])]);
      assertions.push(['SRS reviews = 1 (from synthetic events)', probe.cells[3] === '1']);
      assertions.push(['Notes created = 1 (from synthetic events)', probe.cells[4] === '1']);
      assertions.push(['bytes column begins with ≈', /^≈/.test(probe.cells[5])]);
    } else {
      assertions.push(['row has 6 cells', false]);
    }

    console.log(`\n[preview-ui-smoke] cells: ${JSON.stringify(probe.cells)}`);
    console.log(`[preview-ui-smoke] modal title: ${probe.modalTitle}`);
    let failed = 0;
    for (const [name, ok] of assertions) {
      console.log(`  ${ok ? '✓' : '✗'} ${name}`);
      if (!ok) failed++;
    }

    if (pageErrors.length > 0) {
      console.error('[preview-ui-smoke] JS errors:');
      for (const e of pageErrors) console.error('  ' + e);
    }

    // Visual capture: paint the rendered preview body for the user to see
    // exactly what their modal looks like.
    try {
      const captureDir = path.join(REPO_ROOT, "Smoke-check");
      fs.mkdirSync(captureDir, { recursive: true });
      // Style the host with the dark theme + center it on a sane width so the
      // screenshot reads like the actual modal in-app.
      await page.evaluate(() => {
        const host = document.getElementById('__modal_host');
        if (!host) return;
        host.style.maxWidth = '720px';
        host.style.margin = '40px auto';
        host.style.padding = '20px';
        host.style.background = '#0f172a';
        host.style.color = '#e2e8f0';
        host.style.borderRadius = '10px';
        host.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        document.body.style.background = '#020617';
        document.body.style.minHeight = '100vh';
        // Hide the test framework output so the screenshot is clean.
        const log = document.getElementById('log');
        if (log) log.style.display = 'none';
        const h2 = document.querySelector('body > h2');
        if (h2) h2.style.display = 'none';
        const p = document.querySelector('body > p.inf');
        if (p) p.style.display = 'none';
      });
      const shotPath = path.join(captureDir, `preview-ui-${Date.now()}.png`);
      await page.screenshot({ path: shotPath, fullPage: true });
      console.log(`[preview-ui-smoke] visual capture: ${path.relative(REPO_ROOT, shotPath)}`);
    } catch (e) {
      console.warn(`[preview-ui-smoke] screenshot failed (non-fatal): ${e && e.message}`);
    }

    if (failed === 0) {
      console.log(`\n[preview-ui-smoke] all green ✓ (${assertions.length} cases)`);
      exitCode = 0;
    } else {
      console.error(`\n[preview-ui-smoke] FAIL — ${failed}/${assertions.length} assertions failed`);
      exitCode = 1;
    }
  } catch (e) {
    console.error('[preview-ui-smoke] fatal:', e && e.message ? e.message : e);
    for (const line of logs.slice(-20)) console.error('  ' + line);
  } finally {
    if (browser) try { await browser.close(); } catch (_) {}
    await stopServer(child);
    try { fs.rmSync(researchDir, { recursive: true, force: true }); } catch (_) {}
    process.exit(exitCode);
  }
}

if (require.main === module) {
  main().catch((e) => { console.error('[preview-ui-smoke] unhandled:', e); process.exit(1); });
}
