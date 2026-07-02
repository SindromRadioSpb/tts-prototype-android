#!/usr/bin/env node
"use strict";
// smoke:studio-corpus — Studio↔Room compat Ф1 (BRR_STUDIO_ROOM_COMPAT_2026_07_02.md, D-B + S-A).
// In a real browser over the STUDIO (index.html), OPFS seeded in-session:
//   1) mig 061 applied (text_user_meta exists); upsert/get round-trips;
//   2) Library v3 corpus pills: default «Мои» hides the corpus text; «Бен-Иегуда» shows it
//      with the 🏛 канон badge, «Открыть в Зале» (deep-link), enrich disabled, delete relabeled;
//   3) metadata modal on a corpus text: TITLE read-only; save writes the OVERLAY (canon row
//      untouched) — verified via getTextUserMeta + the canon title staying intact;
//   4) smart-chip queries see the overlay's manual_smart_tag (mastered via overlay).
// Run: node scripts/premium/studio-corpus-smoke.js

const path = require("path");
const { spawn, spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const PORT = 3298, BASE = "http://127.0.0.1:" + PORT;
const SHOT = path.join(REPO, ".tmp", "studio-corpus-380.png");
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

(async () => {
  let pw; try { pw = require("playwright"); } catch (e) { console.error("no playwright"); process.exit(1); }
  const srv = startServer();
  if (!(await ready())) { console.error("server failed"); console.error(srv.logs.join("")); await stop(srv.c); process.exit(1); }
  const b = await pw.chromium.launch();
  const failures = [];
  const ok = (cond, msg) => { if (!cond) failures.push(msg); };
  try {
    const ctx = await b.newContext({ serviceWorkers: "block", viewport: { width: 380, height: 844 } });
    const pg = await ctx.newPage();
    const pageErrors = []; pg.on("pageerror", (e) => pageErrors.push(String(e)));
    await pg.goto(BASE + "/?v=smoke", { waitUntil: "load" });
    await pg.waitForFunction(() => typeof window.v3LibrarySetCorpus === "function" && !!document.getElementById("v3LibraryCorpusPills"), { timeout: 30000 })
      .catch(() => failures.push("Studio did not expose the corpus pills / setter"));
    // dismiss the first-run local-mode onboarding overlay (it covers the library in screenshots)
    await pg.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("button, a"));
      const later = btns.find((b) => /Начать с чистого листа/.test(b.textContent || ""));
      if (later) later.click();
    }).catch(() => {});
    await sleep(400);

    // 1) seed OPFS: own text + corpus-meta text; overlay round-trip (mig 061)
    const seed = await pg.evaluate(async () => {
      const db = await import("/db/local-db.js");
      await db.initLocalDB();
      await db.createText({ id: "sc-own", text_key: "sc-own", title: "Свой студийный текст", source_text: "x", level: "alef" });
      await db.createText({ id: "sc-corpus", text_key: "sc-corpus-key", title: "CANON WORK TITLE", source_text: "y", source_meta_json: JSON.stringify({ corpus: { byehuda_id: "424242" } }) });
      await db.upsertTextUserMeta("sc-corpus-key", { level: "bet", tags_json: JSON.stringify(["мой-тег"]), topic: "Личная тема", manual_smart_tag: "mastered" });
      const m = await db.getTextUserMeta("sc-corpus-key");
      const mastered = await db.getMasteredTexts();
      return { level: m && m.level, tag: m && m.manual_smart_tag, masteredHasCorpus: mastered.indexOf("sc-corpus") !== -1 };
    }).catch((e) => { failures.push("seed/mig061 failed: " + e.message); return null; });
    if (seed) {
      ok(seed.level === "bet" && seed.tag === "mastered", "overlay upsert/get round-trip broken: " + JSON.stringify(seed));
      ok(seed.masteredHasCorpus, "getMasteredTexts does not see the OVERLAY manual_smart_tag (union missing)");

      // 2) library: default «Мои» hides corpus; «Бен-Иегуда» shows it with canon affordances
      await pg.evaluate(() => { window.v3LibraryOpen ? window.v3LibraryOpen() : (typeof v3LibraryOpen === "function" && v3LibraryOpen()); });
      await pg.waitForFunction(() => { const l = document.getElementById("v3LibraryList"); return l && l.textContent.includes("Свой студийный текст"); }, { timeout: 20000 })
        .catch(() => failures.push("library list did not render own text"));
      let listText = await pg.evaluate(() => (document.getElementById("v3LibraryList") || {}).textContent || "");
      ok(!listText.includes("CANON WORK TITLE"), "default «Мои» pill leaked the corpus text");
      await pg.evaluate(() => window.v3LibrarySetCorpus("benyehuda"));
      await sleep(300);
      listText = await pg.evaluate(() => (document.getElementById("v3LibraryList") || {}).textContent || "");
      ok(listText.includes("CANON WORK TITLE"), "«Бен-Иегуда» pill did not show the corpus text");
      const card = await pg.evaluate(() => {
        const list = document.getElementById("v3LibraryList");
        const cards = list ? Array.from(list.querySelectorAll(".v3-lib-card, [class*='lib-card']")) : [];
        const c = cards.find((x) => x.textContent.includes("CANON WORK TITLE"));
        if (!c) return null;
        const open = c.querySelector('button[data-act="open"]');
        const resume = c.querySelector('button[data-act="resume"]');
        const enrich = c.querySelector('button[data-act="enrich"]');
        const del = c.querySelector('button[data-act="delete"]');
        return {
          badge: !!c.querySelector(".v3-lib-corpus-badge"),
          openLabel: open ? open.textContent.trim() : "",
          resumeHidden: resume ? resume.style.display === "none" : false,
          enrichDisabled: enrich ? enrich.disabled : false,
          delLabel: del ? del.textContent.trim() : "",
        };
      });
      ok(card && card.badge, "corpus card lacks the 🏛 канон badge");
      ok(card && /Зале|Room/.test(card.openLabel), "corpus card open button is not «Открыть в Зале»: " + (card && card.openLabel));
      ok(card && card.resumeHidden, "corpus card still shows «Продолжить» (Studio open path)");
      ok(card && card.enrichDisabled, "corpus card enrich is NOT disabled (canon protection missing)");
      ok(card && /устройства|device/.test(card.delLabel), "corpus card delete is not relabeled «Убрать с устройства»: " + (card && card.delLabel));

      // 3) modal: title read-only; save writes the OVERLAY, canon row untouched
      await pg.evaluate(() => { window.v3TextMetaOpen("sc-corpus"); });
      await sleep(400);
      const modal = await pg.evaluate(() => {
        const ttl = document.getElementById("v3TextMetaTitle");
        const lvl = document.getElementById("v3TextMetaLevel");
        return ttl ? { ro: ttl.readOnly, title: ttl.value, level: lvl ? lvl.value : "" } : null;
      });
      ok(modal && modal.ro, "corpus modal TITLE is not read-only");
      ok(modal && modal.level === "bet", "corpus modal did not prefill the OVERLAY level: " + (modal && modal.level));
      await pg.evaluate(() => { const l = document.getElementById("v3TextMetaLevel"); if (l) l.value = "gimel"; });
      await pg.evaluate(() => { window.v3TextMetaSave ? window.v3TextMetaSave() : v3TextMetaSave(); });
      await sleep(700);
      const after = await pg.evaluate(async () => {
        const db = await import("/db/local-db.js");
        const m = await db.getTextUserMeta("sc-corpus-key");
        const t = await db.getTextById("sc-corpus");
        return { overlayLevel: m && m.level, canonTitle: t && t.title, canonLevel: t && t.level };
      });
      ok(after && after.overlayLevel === "gimel", "modal save did not write the overlay level: " + JSON.stringify(after));
      ok(after && after.canonTitle === "CANON WORK TITLE", "canon row TITLE was modified (must stay untouched)");
      ok(after && !after.canonLevel, "canon row level was modified (must stay untouched)");
      // screenshot: dismiss the (late-appearing) onboarding overlay, make sure the library with
      // the «Бен-Иегуда» pill + canon card is what the frame actually shows
      await pg.evaluate(() => {
        const btns = Array.from(document.querySelectorAll("button, a"));
        const later = btns.find((b) => /Начать с чистого листа|Решу позже/.test(b.textContent || ""));
        if (later) later.click();
      }).catch(() => {});
      await sleep(300);
      await pg.evaluate(() => { window.v3LibraryOpen ? window.v3LibraryOpen() : (typeof v3LibraryOpen === "function" && v3LibraryOpen()); });
      await sleep(300);
      await pg.evaluate(() => window.v3LibrarySetCorpus && window.v3LibrarySetCorpus("benyehuda"));
      await sleep(400);
      await pg.evaluate(() => { const p = document.getElementById("v3LibraryCorpusPills"); if (p && p.scrollIntoView) p.scrollIntoView({ block: "start" }); });
      await sleep(300);
      await pg.screenshot({ path: SHOT });
    }
    ok(!pageErrors.length, "pageerror(s): " + pageErrors.join(" | "));
  } finally { await b.close(); await stop(srv.c); }

  if (failures.length) { console.error("FAIL — " + failures.length + " assertion(s):"); for (const f of failures) console.error("  ✗ " + f); process.exit(1); }
  console.log("screenshot → " + path.relative(REPO, SHOT));
  console.log("PASS — studio-corpus smoke green (pills + canon badge/actions + overlay modal @380px)");
})().catch((e) => { console.error("fatal:", e && e.stack || e); process.exit(1); });
