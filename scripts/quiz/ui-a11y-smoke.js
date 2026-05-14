#!/usr/bin/env node
// scripts/quiz/ui-a11y-smoke.js — Quiz UI accessibility smoke (post-v3.3.5 polish).
//
// 7 Playwright cases pinning the keyboard + screen-reader contract:
//   1. On open, document.activeElement is inside [data-quiz-panel]
//      (not the launcher button on the underlying page).
//   2. Tab from the last focusable element wraps to the first (focus trap
//      forward boundary).
//   3. Shift+Tab from the first focusable element wraps to the last
//      (focus trap backward boundary).
//   4. Result panel wrapper has role="status" + aria-live="polite" +
//      aria-label that includes both the score and the band — so AT
//      announces the outcome as one coherent sentence.
//   5. Each radio has aria-describedby pointing to a non-empty prompt
//      element + aria-label combining option text with position.
//   6. Progress div has role="status" + aria-live="polite" + aria-label
//      so AT announces "Question N of 20, level X" on each item change.
//   7. Closing the modal restores focus to the pre-open element (we plant
//      a known anchor button, focus it, open quiz, close, verify focus
//      returns).
//
// Spawns server.js → loads public/index.html → exercises window.LinguistProQuiz.
// Exit 0 if all green, 1 otherwise.

"use strict";

const path = require("path");
const { spawn, spawnSync } = require("child_process");

process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3199;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function test(name, cond, extra) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else      { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

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
    const t = setTimeout(() => resolve(false), 5000);
    child.once("exit", () => { clearTimeout(t); resolve(true); });
  });
  if (exited) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else { child.kill("SIGKILL"); }
}
async function waitForReady(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(BASE + "/healthz");
      if (r.status === 200) return true;
    } catch (_) {}
    await sleep(200);
  }
  return false;
}

async function main() {
  let playwright;
  try { playwright = require("playwright"); }
  catch (e) { console.error("[ui-a11y-smoke] playwright missing:", e.message); process.exit(1); }

  const srv = startServer();
  const ready = await waitForReady();
  if (!ready) {
    console.error("[ui-a11y-smoke] server failed to start");
    srv.logs.forEach((l) => console.error(l));
    await stopServer(srv.child); process.exit(1);
  }
  console.log("[ui-a11y-smoke] server up");

  const browser = await playwright.chromium.launch();
  const context = await browser.newContext({ serviceWorkers: "block" });
  const page = await context.newPage();

  try {
    await page.goto(BASE + "/index.html", { waitUntil: "load" });
    await page.waitForFunction(() => window.LinguistProQuiz && typeof window.LinguistProQuiz.open === "function", null, { timeout: 10000 });
    await sleep(800);
    await page.evaluate(() => {
      window.LinguistProQuiz.reset();
      for (const id of ["v3Phase6Modal", "v3OnboardingModal"]) {
        const m = document.getElementById(id);
        if (m && m.parentNode) m.parentNode.removeChild(m);
      }
    });

    // ── Case 7 setup — plant a known anchor button + focus it pre-open ─
    // We do this before Case 1 so the same modal session can verify both
    // initial-focus-inside (Case 1) and on-close focus restoration (Case 7).
    await page.evaluate(() => {
      const btn = document.createElement("button");
      btn.id = "a11y-anchor";
      btn.textContent = "Pre-open anchor";
      btn.style.cssText = "position:fixed;bottom:0;left:0;z-index:1;";
      document.body.appendChild(btn);
      btn.focus();
    });
    const anchorFocusedBeforeOpen = await page.evaluate(() =>
      document.activeElement && document.activeElement.id === "a11y-anchor");
    if (!anchorFocusedBeforeOpen) {
      console.error("[ui-a11y-smoke] precondition failed: anchor not focused before open");
      process.exit(1);
    }

    await page.evaluate(() => window.LinguistProQuiz.open());
    await page.waitForSelector("[data-quiz-panel]", { timeout: 5000 });
    await sleep(50); // let renderItem complete + initial focus settle

    // ── Case 1 — focus moved INSIDE the panel on open ────────────────────
    const c1 = await page.evaluate(() => {
      const panel = document.querySelector("[data-quiz-panel]");
      const active = document.activeElement;
      return {
        panelFound: !!panel,
        focusInsidePanel: !!panel && !!active && panel.contains(active),
        activeTag: active ? active.tagName : null,
        activeAttr: active ? active.getAttribute("data-quiz-radio") : null,
      };
    });
    test("Case 1: opening modal moves focus inside the panel (off the launcher anchor)",
         c1.panelFound && c1.focusInsidePanel,
         JSON.stringify(c1));

    // ── Case 5 — radios carry aria-describedby + aria-label ─────────────
    const c5 = await page.evaluate(() => {
      const radios = Array.from(document.querySelectorAll("[data-quiz-radio]"));
      const promptIds = new Set(radios.map((r) => r.getAttribute("aria-describedby")));
      const allHavePromptId = radios.every((r) => !!r.getAttribute("aria-describedby"));
      const allHaveLabel = radios.every((r) => {
        const lbl = r.getAttribute("aria-label");
        return typeof lbl === "string" && lbl.length > 0;
      });
      // The described-by id must resolve to a non-empty element.
      const promptEl = radios.length ? document.getElementById(radios[0].getAttribute("aria-describedby")) : null;
      const promptText = promptEl ? promptEl.textContent.trim() : "";
      return {
        radioCount: radios.length,
        allHavePromptId,
        allHaveLabel,
        uniquePromptIds: promptIds.size,
        promptElExists: !!promptEl,
        promptTextLen: promptText.length,
      };
    });
    test("Case 5: each radio has aria-describedby → existing non-empty prompt, plus aria-label",
         c5.radioCount === 4 &&
         c5.allHavePromptId &&
         c5.allHaveLabel &&
         c5.uniquePromptIds === 1 &&
         c5.promptElExists &&
         c5.promptTextLen > 0,
         JSON.stringify(c5));

    // ── Case 6 — progress div has role + aria-live + aria-label ─────────
    const c6 = await page.evaluate(() => {
      const p = document.querySelector("[data-quiz-progress]");
      return p ? {
        role: p.getAttribute("role"),
        live: p.getAttribute("aria-live"),
        atomic: p.getAttribute("aria-atomic"),
        labelLen: (p.getAttribute("aria-label") || "").length,
      } : null;
    });
    test("Case 6: progress div has role='status' + aria-live='polite' + non-empty aria-label",
         c6 && c6.role === "status" && c6.live === "polite" && c6.labelLen > 0,
         JSON.stringify(c6));

    // ── Case 2 — Tab from last focusable wraps to first ──────────────────
    // Focus the last focusable explicitly, press Tab, expect first.
    const c2 = await page.evaluate(() => {
      const panel = document.querySelector("[data-quiz-panel]");
      const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
      const items = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length < 2) return { ok: false, count: items.length };
      const first = items[0], last = items[items.length - 1];
      last.focus();
      return {
        ok: true,
        firstTag: first.tagName,
        firstAttr: first.getAttribute("data-quiz-radio") || first.getAttribute("data-quiz-close") || first.getAttribute("data-quiz-back") || first.getAttribute("data-quiz-next") || null,
        lastTag: last.tagName,
        lastAttr: last.getAttribute("data-quiz-radio") || last.getAttribute("data-quiz-close") || last.getAttribute("data-quiz-back") || last.getAttribute("data-quiz-next") || null,
        beforeTabActiveIsLast: document.activeElement === last,
      };
    });
    await page.keyboard.press("Tab");
    await sleep(40);
    const c2After = await page.evaluate(() => {
      const panel = document.querySelector("[data-quiz-panel]");
      const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
      const items = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      const first = items[0];
      return {
        activeIsFirst: document.activeElement === first,
        stillInPanel: panel.contains(document.activeElement),
      };
    });
    test("Case 2: Tab from last focusable wraps to first (forward focus trap)",
         c2.ok && c2.beforeTabActiveIsLast && c2After.activeIsFirst && c2After.stillInPanel,
         JSON.stringify({ before: c2, after: c2After }));

    // ── Case 3 — Shift+Tab from first focusable wraps to last ───────────
    const c3Before = await page.evaluate(() => {
      const panel = document.querySelector("[data-quiz-panel]");
      const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
      const items = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      items[0].focus();
      return { activeIsFirst: document.activeElement === items[0] };
    });
    await page.keyboard.down("Shift");
    await page.keyboard.press("Tab");
    await page.keyboard.up("Shift");
    await sleep(40);
    const c3After = await page.evaluate(() => {
      const panel = document.querySelector("[data-quiz-panel]");
      const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]):not([type='hidden']), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
      const items = Array.from(panel.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      const last = items[items.length - 1];
      return {
        activeIsLast: document.activeElement === last,
        stillInPanel: panel.contains(document.activeElement),
      };
    });
    test("Case 3: Shift+Tab from first focusable wraps to last (backward focus trap)",
         c3Before.activeIsFirst && c3After.activeIsLast && c3After.stillInPanel,
         JSON.stringify({ before: c3Before, after: c3After }));

    // ── Case 4 — result panel has aria-live + score+band in aria-label ──
    // Drive through 20 items with deterministic picks, then inspect result.
    const picks = ["a","b","c","d","a","b","c","d","a","b","c","d","a","b","c","d","a","b","c","d"];
    for (let i = 0; i < 20; i++) {
      await page.click(`[data-quiz-radio="${picks[i]}"]`);
      await sleep(15);
      await page.click('[data-quiz-next]'); await sleep(25);
    }
    await page.waitForSelector('[data-quiz-state="result"]', { timeout: 5000 });
    const c4 = await page.evaluate(() => {
      const result = document.querySelector('[data-quiz-state="result"]');
      if (!result) return { ok: false };
      const score = document.querySelector("[data-quiz-score]");
      const band  = document.querySelector("[data-quiz-band]");
      const scoreText = score ? score.textContent.trim() : "";
      const bandText  = band  ? band.textContent.trim()  : "";
      const live = result.getAttribute("aria-live");
      const role = result.getAttribute("role");
      const ariaLabel = result.getAttribute("aria-label") || "";
      // Pull the numeric score from the visible text (e.g. "75 / 100").
      const scoreNum = (scoreText.match(/\d+/) || [])[0] || "";
      // Pull the CEFR band from the visible text (first occurrence of A1..C1).
      const bandMatch = bandText.match(/\b(A1|A2|B1|B2|C1)\b/);
      const bandStr = bandMatch ? bandMatch[0] : "";
      return {
        role, live,
        ariaLabelContainsScore: scoreNum && ariaLabel.includes(scoreNum),
        ariaLabelContainsBand: bandStr && ariaLabel.includes(bandStr),
        scoreNum, bandStr, ariaLabel,
      };
    });
    test("Case 4: result wrapper has role='status' + aria-live='polite' + aria-label includes score + band",
         c4.role === "status" && c4.live === "polite" &&
         c4.ariaLabelContainsScore && c4.ariaLabelContainsBand,
         JSON.stringify(c4));

    // ── Case 7 — closing restores focus to the pre-open anchor ──────────
    await page.click('[data-quiz-close]');
    await sleep(80);
    const c7 = await page.evaluate(() => {
      const active = document.activeElement;
      const anchor = document.getElementById("a11y-anchor");
      return {
        anchorStillThere: !!anchor,
        activeIsAnchor: !!anchor && active === anchor,
        activeId: active ? active.id : null,
        activeTag: active ? active.tagName : null,
      };
    });
    test("Case 7: closing the modal restores focus to the pre-open anchor element",
         c7.anchorStillThere && c7.activeIsAnchor,
         JSON.stringify(c7));
  } finally {
    await context.close();
    await browser.close();
    await stopServer(srv.child);
  }

  console.log(`\n[ui-a11y-smoke] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error("[ui-a11y-smoke] fatal:", e); process.exit(1); });
