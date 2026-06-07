#!/usr/bin/env node
// scripts/premium/km-quiz-gen2-smoke.js — KM Phase-4 generators 4 & 5.
//
// (4) which-form — per-form / paradigm-gated. Resolves the offline Pealim
//     paradigm via window.v3AnkiResolveParadigm; distractors MUST be OTHER real
//     cells of the SAME paradigm. Returns null (honest "no table" skip) when no
//     paradigm / < 3 distinct cell surfaces — so default per-lemma sessions carry
//     ZERO which-form items.
// (5) connection-recall — consumes the dormant bridge
//     window.NotesGraphSrsCandidates.fromConfirmed. Real confirmed connections
//     only; empty → no items (never fabricate a connection).
//
// Pure: lite page + module + mocked paradigm/bridge. No DB writes, no network.

"use strict";
const path = require("path");
const { spawn, spawnSync } = require("child_process");
process.env.PLAYWRIGHT_BROWSERS_PATH = "0";
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 3261;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0, failed = 0;
function test(name, cond, extra) { if (cond) { passed++; console.log(`  ✓ ${name}`); } else { failed++; console.log(`  ✗ ${name}${extra ? " — " + extra : ""}`); } }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
function startServer() { const child = spawn(process.execPath, ["server.js"], { cwd: REPO_ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: ["ignore", "pipe", "pipe"] }); const logs = []; child.stdout.on("data", (c) => logs.push(String(c).trim())); child.stderr.on("data", (c) => logs.push(String(c).trim())); return { child, logs }; }
async function stopServer(child) { if (!child || child.killed) return; child.kill("SIGTERM"); const exited = await new Promise((r) => { const t = setTimeout(() => r(false), 5000); child.once("exit", () => { clearTimeout(t); r(true); }); }); if (exited) return; if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" }); else child.kill("SIGKILL"); }
async function waitForReady(ms = 15000) { const s = Date.now(); while (Date.now() - s < ms) { try { const r = await fetch(BASE + "/healthz"); if (r.status === 200) return true; } catch (_) {} await sleep(200); } return false; }

const MOCKS = `
// minimal ldb shim so _fetchLemmaBody resolves the whitelisted body scalars
window.__localDB = { dbQuery: async function(sql, p){
  if (/FROM notes_v2/i.test(sql)) return [{ root:"כתב", lemma:"כתב", word:"כותב", pos:"verb", binyan:"paal", pealim_id:"101" }];
  return [];
}};
window.ensureLocalDB = async function(){ return window.__localDB; };
// paradigm resolver mock (4 distinct real cell surfaces)
window.__PARA = { lemma:"כתב", binyan:"paal", cells:{
  "1s":{he:"כָּתַבְתִּי", translit:"katavti"}, "3ms":{he:"כָּתַב", translit:"katav"},
  "3fs":{he:"כָּתְבָה", translit:"katva"}, "present_ms":{he:"כּוֹתֵב", translit:"kotev"} } };
window.v3AnkiResolveParadigm = function(body){ return window.__PARA; };
// paradigm with < 3 surfaces → honest skip
window.__PARA_TINY = { lemma:"x", cells:{ a:{he:"אא"}, b:{he:"אא"} } };
// connection bridge mock
window.__CONN = [{ from:"n1", to:"n2", from_label:"כותב", to_label:"מכתב",
  prompt:"Почему связаны эти слова?", answer:"Общий корень כתב", evidence:"כתב", reason_code:"shared_root" }];
window.NotesGraphSrsCandidates = { fromConfirmed: async function(){ return window.__CONN.slice(); } };
`;

async function main() {
  let playwright; try { playwright = require("playwright"); } catch (e) { console.error("[km-quiz-gen2] playwright missing:", e.message); process.exit(1); }
  const srv = startServer();
  if (!(await waitForReady())) { console.error("[km-quiz-gen2] server failed"); srv.logs.forEach((l) => console.error(l)); await stopServer(srv.child); process.exit(1); }
  console.log("[km-quiz-gen2] server up");
  const browser = await playwright.chromium.launch();
  const errs = [];
  try {
    const ctx = await browser.newContext({ serviceWorkers: "block", viewport: { width: 1024, height: 768 } });
    const pg = await ctx.newPage();
    pg.on("pageerror", (e) => errs.push(String(e.message || e)));
    await pg.goto(BASE + "/crosstext-test.html", { waitUntil: "domcontentloaded" });
    await pg.addScriptTag({ content: MOCKS });
    await pg.addScriptTag({ url: "/js/knowledge-map-quiz.js" });
    await pg.waitForFunction(() => !!window.KnowledgeMapQuiz, null, { timeout: 5000 });

    const r = await pg.evaluate(async () => {
      const Q = window.KnowledgeMapQuiz, out = {};
      const lemma = { id: "word:pid:101", rawId: "כותב", label: "כותב", roots: ["כתב"], binyans: ["paal"], pos: ["verb"], meaning: "пишет", noteIds: ["N1"] };
      const ctx = { cluster: { lemmas: [lemma] }, idx: { roots: [], lemmas: [lemma] }, corpusBinyans: new Set(["paal"]), allRoots: ["כתב"] };

      // (4) which-form: distractors ∈ real cell surfaces
      const wf = await Q._genWhichForm(lemma, ctx);
      const cellHe = new Set(Object.values(window.__PARA.cells).map((c) => c.he));
      out.wfPresent = !!wf && wf.kind === "which_form";
      out.wfOptionsReal = !!wf && wf.options.every((o) => cellHe.has(o.key)) && wf.options.length >= 3;
      out.wfCorrectReal = !!wf && cellHe.has(wf.correctKey);

      // honest skip: tiny paradigm (< 3 surfaces)
      window.__PARA = window.__PARA_TINY;
      const wfTiny = await Q._genWhichForm(lemma, ctx);
      out.wfTinySkipped = wfTiny === null;
      // honest skip: no resolver
      const save = window.v3AnkiResolveParadigm; window.v3AnkiResolveParadigm = undefined;
      const wfNone = await Q._genWhichForm(lemma, ctx);
      out.wfNoResolverSkipped = wfNone === null;
      window.v3AnkiResolveParadigm = save;

      // (5) connection-recall: maps real candidate
      const conn = await Q._genConnectionItems({ allRoots: ["כתב"] }, 2);
      out.connCount = conn.length;
      out.connReal = conn.length === 1 && conn[0].kind === "connection_recall" &&
        conn[0].reveal.meaning === "Общий корень כתב" && conn[0].answerMode === "recall";
      // empty bridge → no items (no fabrication)
      window.__CONN = [];
      const connEmpty = await Q._genConnectionItems({ allRoots: ["כתב"] }, 2);
      out.connEmptyNoFab = connEmpty.length === 0;
      return out;
    });

    test("which-form: item generated from paradigm", r.wfPresent === true, JSON.stringify(r));
    test("which-form: every option is a REAL paradigm cell", r.wfOptionsReal === true);
    test("which-form: correct key is a real cell surface", r.wfCorrectReal === true);
    test("which-form: < 3 cells → honest skip", r.wfTinySkipped === true);
    test("which-form: no resolver → honest skip (default per-lemma carries none)", r.wfNoResolverSkipped === true);
    test("connection: real confirmed candidate → item", r.connReal === true, JSON.stringify(r));
    test("connection: empty bridge → zero items (no fabrication)", r.connEmptyNoFab === true);
    test("no pageerror", errs.length === 0, errs.join(" | "));

    await pg.close(); await ctx.close();
  } finally { await browser.close(); await stopServer(srv.child); }
  console.log(`\n[km-quiz-gen2] ${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error("[km-quiz-gen2] fatal:", e); process.exit(1); });
