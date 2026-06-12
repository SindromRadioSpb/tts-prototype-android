#!/usr/bin/env node
"use strict";
// smoke:reader-context — Tier-3 «точный режим» (context disambiguation) gate.
// Proves end-to-end, in a real browser @380px:
//   1) with a contextProvider wired (browser→Dicta), tapping a homograph (הַיּוֹם in a
//      "today" sentence) surfaces the «контекст (Dicta)» badge + the adverbial reading
//      «сегодня» — i.e. context fixes what the offline path alone cannot;
//   2) when Dicta is unreachable (host aborted), the SAME tap silently falls back to the
//      offline card (normal badge, card still opens, no pageerror) — honest degradation.
// Network-dependent for (1): SKIPS gracefully (exit 0) if Dicta is unreachable.
// Run:  node scripts/premium/reader-context-smoke.js

const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3288, BASE = "http://127.0.0.1:" + PORT;
const SHOT = path.join(REPO, ".tmp", "reader-context-380.png");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function startServer() {
  const c = spawn(process.execPath, ["server.js"], { cwd: REPO, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] });
  const logs = []; c.stdout.on("data", (x) => logs.push(String(x))); c.stderr.on("data", (x) => logs.push(String(x)));
  return { c, logs };
}
async function stop(c) {
  if (!c || c.killed) return; c.kill("SIGTERM");
  const ok = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); c.once("exit", () => { clearTimeout(t); r(true); }); });
  if (!ok && process.platform === "win32") spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { stdio: "ignore" });
}
async function ready(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

// the test row: "היום אני הולך לעבודה" — היום is the day/today homograph; in this frame it
// is the adverb «today», which the offline path alone resolves to the noun «день».
const ROW = { he: "היום אני הולך לעבודה", he_niqqud: "הַיּוֹם אֲנִי הוֹלֵךְ לַעֲבוֹדָה" };

(async () => {
  let pw; try { pw = require("playwright"); } catch (e) { console.error("no playwright"); process.exit(1); }
  const srv = startServer();
  if (!(await ready())) { console.error("server failed"); console.error(srv.logs.join("")); await stop(srv.c); process.exit(1); }
  const b = await pw.chromium.launch();
  const failures = [];
  const fail = (m) => failures.push(m);
  const eq = (cond, m) => { if (!cond) fail(m); };
  try {
    const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    await ctx.addInitScript(() => { try { localStorage.setItem("app.locale", "ru"); } catch (_) {} });
    const pg = await ctx.newPage();
    const pageErrors = []; pg.on("pageerror", (e) => pageErrors.push(String(e)));
    await pg.goto(BASE + "/library.html", { waitUntil: "load" });
    await pg.waitForFunction(() => !!window.ReaderMorph && !!window.ReaderDicta && !!window.InflectionDict && !!window.NotesAutoGen, { timeout: 20000 });

    // Is Dicta reachable from this host? (probe)
    const probe = await pg.evaluate(async () => { try { const r = await window.ReaderDicta.analyzeSentence("הַיּוֹם אֲנִי הוֹלֵךְ"); return { ok: r.ok && !r.degraded, n: (r.tokens || []).length }; } catch (e) { return { ok: false, err: String(e) }; } });

    // helper: build a mount + attach reader-morph with the given contextProvider, tap היום, return card facts
    async function tapHaYom(useDicta) {
      return await pg.evaluate(async (opts) => {
        document.querySelectorAll("#rm-mount").forEach((n) => n.remove());
        const mount = document.createElement("div"); mount.id = "rm-mount";
        mount.innerHTML = '<table id="proTable"><tbody><tr data-row-idx="0">' +
          '<td data-col="he" class="rtl rtl-he">' + opts.he + '</td>' +
          '<td data-col="niqqud" class="rtl rtl-he-niqqud">' + opts.heN + '</td></tr></tbody></table>';
        document.body.appendChild(mount);
        const rows = [{ he: opts.he, he_niqqud: opts.heN }];
        const attachOpts = { getRow: (i) => rows[i] };
        if (opts.useDicta) attachOpts.contextProvider = async (sentence, surface) => {
          try { const r = await window.ReaderDicta.analyzeSentence(sentence); if (!r.ok || r.degraded) return null; const t = window.ReaderDicta.tokenForSurface(r.tokens, surface); return (t && t.niqqud) ? { niqqud: t.niqqud, posDicta: t.posDicta, lemma: t.lemma } : null; } catch (_) { return null; }
        };
        if (window.__rmH) { try { window.__rmH.detach(); } catch (_) {} }
        window.__rmH = window.ReaderMorph.attach(mount, attachOpts);
        const span = mount.querySelector('td[data-col="he"] .rm-w');  // first word = היום
        span.click();
        // wait for the sheet to render the card (prov badge present)
        for (let i = 0; i < 60; i++) { if (document.querySelector(".rm-sheet.rm-open .rm-prov")) break; await new Promise((r) => setTimeout(r, 100)); }
        const body = document.querySelector(".rm-sheet-body");
        return {
          text: body ? body.textContent : "",
          isContext: !!document.querySelector(".rm-prov-context"),
          provClass: (document.querySelector(".rm-prov") || {}).className || "",
        };
      }, { he: ROW.he, heN: ROW.he_niqqud, useDicta });
    }

    if (!probe.ok) {
      console.log("reader-context: Dicta unreachable from this host (probe n=" + (probe.n || 0) + ") — SKIP positive assertions.");
    } else {
      // 1) context ON → «контекст (Dicta)» badge + adverbial «сегодня»
      const on = await tapHaYom(true);
      eq(on.isContext, "context-mode tap on הַיּוֹם should show the «контекст (Dicta)» badge, got prov=" + on.provClass);
      eq(/сегодня/.test(on.text), "context reading of הַיּוֹם should be «сегодня», card text: " + JSON.stringify(on.text.slice(0, 80)));
      try { fs.mkdirSync(path.dirname(SHOT), { recursive: true }); } catch (_) {}
      await pg.screenshot({ path: SHOT });
    }

    // 2) degradation: abort the Dicta host → same tap must silently fall back to offline
    await ctx.route("**/nakdan-5-1.loadbalancer.dicta.org.il/**", (r) => r.abort());
    const off = await tapHaYom(true);
    eq(!off.isContext, "with Dicta aborted, the tap must NOT show a context badge (silent offline fallback), got prov=" + off.provClass);
    eq(off.text && off.text.length > 0, "with Dicta aborted, the card must still open (offline), got empty");

    eq(pageErrors.length === 0, "no pageerror, got: " + pageErrors.join(" | "));

    console.log("reader-context: " + (probe.ok ? "context-badge + сегодня + " : "(positive skipped) ") + "degraded→offline-fallback + no-pageerror");
    if (probe.ok) console.log("screenshot → " + path.relative(REPO, SHOT));
    if (failures.length) {
      console.error("\nFAIL (" + failures.length + "):");
      for (const f of failures) console.error("  ✗ " + f);
      await b.close(); await stop(srv.c); process.exit(1);
    }
    console.log("PASS — reader-context smoke green" + (probe.ok ? "" : " (positive assertions skipped — Dicta offline)"));
  } finally { await b.close(); await stop(srv.c); }
})().catch((e) => { console.error("fatal", e); process.exit(1); });
