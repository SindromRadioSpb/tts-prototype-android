#!/usr/bin/env node
// funcword-profile-check.js — Phase: single-source-of-truth Pealim link + function-word
// invariant profile. Asserts on a real index.html in a browser:
//   • footer «перепроверка» link is DIRECT for content (pealim_id) AND function words
//     (function-links / stored id) — never a search when an exact page is known;
//   • the function-word accordion renders the PREMIUM invariant profile (vocalized form +
//     tap-to-hear cell + DIRECT Pealim link), incl. homograph-shadowed בטח→3600;
//   • footer URL == accordion link URL (single source of truth).
"use strict";
const path = require("path");
const { spawn, spawnSync } = require("child_process");
process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3235;
const BASE = `http://127.0.0.1:${PORT}`;
let pass = 0, fail = 0;
const t = (n, c, e) => { if (c) { pass++; console.log("  ✓ " + n); } else { fail++; console.log("  ✗ " + n + (e ? " — " + e : "")); } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function startServer() { return spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] }); }
async function stopServer(c) { if (!c || c.killed) return; c.kill("SIGTERM"); await new Promise(r => { const tm = setTimeout(() => r(), 4000); c.once("exit", () => { clearTimeout(tm); r(); }); }); if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" }); }
async function waitForReady(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

async function main() {
  const playwright = require("playwright");
  const srv = startServer();
  if (!(await waitForReady())) { console.error("server failed"); await stopServer(srv); process.exit(1); }
  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", e => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/index.html?v=funcword", { waitUntil: "domcontentloaded" });
    await sleep(1500);
    await pg.evaluate(async () => { try { if (window.PealimFunctionLinks) await window.PealimFunctionLinks.ensureReady(); } catch (_) {} });
    const r = await pg.evaluate(async () => {
      if (typeof window.v3WordCardRichHtml !== "function") return { miss: true };
      const attr = (h, n) => { const m = h.match(new RegExp(n + '="([^"]*)"')); return m ? m[1] : null; };
      const mount = (html) => { const c = document.createElement("div"); c.innerHTML = html; document.body.appendChild(c); return c; };
      // function word (homograph-shadowed adverb): direct id 3600, NOT noun 2927
      const betach = window.v3WordCardRichHtml({ id: "t", body_json: JSON.stringify({ word: "בטח", niqqud_variant: "בֶּטַח", root: "", lemma: "", pos: "adverb", part_of_speech: "adverb", pealim_id: "3600", meaning: "конечно" }) });
      const c1 = mount(betach);
      const footer = c1.querySelector("a.v3-wordcard-pealim");
      const footerHref = footer ? footer.getAttribute("href") : "";
      // open the accordion → render invariant profile
      const det = c1.querySelector("details.v3-wordcard-conj");
      let profHe = "", profHasTapCell = false, profRecheck = "", summary = "";
      if (det && window.v3WordCardLoadInflection) {
        det.setAttribute("open", ""); await window.v3WordCardLoadInflection(det); await new Promise(r => setTimeout(r, 800));
        const bodyEl = det.querySelector(".v3-conj-body");
        profHe = (bodyEl.querySelector(".v3-conj-he") || {}).textContent || "";
        profHasTapCell = !!bodyEl.querySelector('.v3-conj-cell[data-he][onclick]');
        profRecheck = (bodyEl.querySelector("a.v3-conj-recheck") || {}).getAttribute ? bodyEl.querySelector("a.v3-conj-recheck").getAttribute("href") : "";
        summary = (det.querySelector(".v3-wordcard-acc-summary") || {}).textContent || "";
      }
      // content word: footer direct via pealim_id
      const noun = window.v3WordCardRichHtml({ id: "t2", body_json: JSON.stringify({ word: "כותב", niqqud_variant: "כּוֹתֵב", root: "כתב", lemma: "כותב", pos: "noun", part_of_speech: "noun", pealim_id: "1234", meaning: "писатель" }) });
      const c2 = mount(noun);
      const nounFooter = (c2.querySelector("a.v3-wordcard-pealim") || {}).getAttribute ? c2.querySelector("a.v3-wordcard-pealim").getAttribute("href") : "";
      return { footerHref, profHe, profHasTapCell, profRecheck, summary, nounFooter };
    });
    if (r.miss) { t("v3WordCardRichHtml exposed", false); }
    else {
      t("בטח footer → DIRECT dict 3600 (not search, not noun 2927)", /\/dict\/3600-/.test(r.footerHref) && !/search/.test(r.footerHref), "footer=" + r.footerHref);
      t("בטח accordion renders invariant FORM בֶּטַח", !!r.profHe && r.profHe.replace(/[֑-ׇ]/g, "").trim() === "בטח", "he=" + r.profHe);
      t("בטח form cell is tap-to-hear", r.profHasTapCell, JSON.stringify(r));
      t("בטח accordion link == footer (single source, 3600)", /\/dict\/3600-/.test(r.profRecheck), "recheck=" + r.profRecheck);
      t("בטח summary = invariant 'Форма слова'", /Форма|форм|Word form|צורת/.test(r.summary), "summary=" + r.summary);
      t("content כותב footer → DIRECT dict 1234", /\/dict\/1234-/.test(r.nounFooter), "footer=" + r.nounFooter);
    }
    t("no pageerror", errs.length === 0, errs.join(" | "));
    await pg.close(); await ctx.close();
  } finally { await browser.close(); await stopServer(srv); }
  console.log(`\n[funcword-profile-check] ${pass}/${pass + fail} passed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(e => { console.error("fatal:", e); process.exit(1); });
