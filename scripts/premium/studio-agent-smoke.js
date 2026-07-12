#!/usr/bin/env node
"use strict";
// smoke:studio-agent — конформность клиента PAS слайса B (B0/B1): весь агент-код Студии
// в /js/studio-agent.js; index.html даёт только script-теги + эмиссию кнопки + host-bridge.
//   Структурные гейты: script-теги (cloud-sync + studio-agent) · row-agent-btn в renderTable ·
//     StudioAgentHost-bridge · SW precache + CACHE_VERSION==package.json · #cloud-триггер Зала ·
//     бамп texts.updated_at в мутаторах local-db (критика wf_7f300c39: перманентный стейл);
//   Рендер-дисциплина: РОВНО ОДНО innerHTML-присваивание (статический шаблон), ноль
//     template-интерполяций в файле (LLM-текст — только textContent) · dir="rtl" в шаблоне;
//   Locale-parity: каждый tt('studio.agent.*')-ключ файла обязан жить в ru/en/he
//     (t() возвращает ключ при промахе — fallback НЕДОСТИЖИМ, память tt-fallback-dead).
// Run: node scripts/premium/studio-agent-smoke.js   (exit 0 = green, 1 = failures)

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO = path.resolve(__dirname, "..", "..");
const read = (p) => fs.readFileSync(path.join(REPO, p), "utf8");

const failures = [];
const eq = (c, m) => { if (!c) failures.push(m); };

// ── 1. синтаксис нового модуля ────────────────────────────────────────────────
const chk = spawnSync(process.execPath, ["--check", path.join(REPO, "public", "js", "studio-agent.js")], { encoding: "utf8" });
eq(chk.status === 0, "node --check studio-agent.js failed: " + (chk.stderr || ""));

const agentJs = read("public/js/studio-agent.js");
const indexHtml = read("public/index.html");
const swJs = read("public/sw.js");
const localDb = read("public/db/local-db.js");
const libraryUi = read("public/js/library-ui.js");
const pkg = JSON.parse(read("package.json"));

// ── 2. index.html: касания исчерпываются тегами + кнопкой + bridge ───────────
eq(indexHtml.includes('<script src="/js/studio-agent.js"></script>'), "index.html must load /js/studio-agent.js");
eq(indexHtml.includes('<script src="/js/cloud-sync.js"></script>'), "index.html must load /js/cloud-sync.js (CS.me consents)");
eq(indexHtml.includes("window.StudioAgentHost"), "index.html must define StudioAgentHost bridge");
// renderTable ЗАМОРОЖЕН byte-parity гейтом (smoke:reader-parity golden) — кнопка
// НЕ эмитится в index.html, а инжектится post-render обёрткой (паттерн studio-karaoke)
eq(!indexHtml.includes('class="row-agent-btn"'), "index.html must NOT emit row-agent-btn (renderTable is parity-frozen; injection lives in studio-agent.js)");
eq(agentJs.includes("injectRowButtons"), "studio-agent.js must inject row buttons post-render");
eq(agentJs.includes("room-mode"), "injection must skip room-mode (reading view; parity gate boots ?room=1)");
eq(/window\.renderTable\s*=/.test(agentJs), "studio-agent.js must wrap window.renderTable");
eq(agentJs.includes("_v3_sentenceId") && agentJs.includes("_v3_textId"), "injection must gate on library-linked rows");

// ── 3. SW: precache + версия ─────────────────────────────────────────────────
eq(swJs.includes('"/js/studio-agent.js"'), "sw.js must precache /js/studio-agent.js");
const mVer = swJs.match(/CACHE_VERSION\s*=\s*"v([\d.]+)"/);
eq(!!mVer && mVer[1] === pkg.version, "sw.js CACHE_VERSION (v" + (mVer && mVer[1]) + ") must equal package.json version (" + pkg.version + ")");

// ── 4. рендер-дисциплина studio-agent.js ─────────────────────────────────────
// РОВНО ДВА статических шаблона: explain-модал (B1) + material-sheet (B2)
const innerCount = (agentJs.match(/\.innerHTML\s*=/g) || []).length;
eq(innerCount === 2, "studio-agent.js must have EXACTLY TWO innerHTML assignments (static modal templates B1+B2), got " + innerCount);
eq(!/\$\{/.test(agentJs), "studio-agent.js must not use template interpolation (server text is textContent-only)");
eq(agentJs.includes('dir="rtl"') && agentJs.includes('lang="he"'), "modal template must mark the Hebrew sentence dir=rtl lang=he");
eq(agentJs.includes("AbortController"), "explain request must be abortable (30s timeout + close)");
eq(!/\.fullSync\s*\(/.test(agentJs), "studio-agent.js must NOT call fullSync (адресный artifacts/put only — критика wf_7f300c39)");
eq(agentJs.includes("/api/learner/artifacts/put"), "state-5/6 must heal via targeted artifacts/put");
eq(agentJs.includes("sentence_row_id"), "explain payload must carry sentence_row_id (live anchor)");

// ── 5. local-db: бамп updated_at в мутаторах рядов ───────────────────────────
for (const fn of ["updateSentence", "deleteSentence", "resetSentence", "reorderSentences"]) {
  const i = localDb.indexOf("export async function " + fn + "(");
  eq(i > 0, "local-db.js must export " + fn);
  if (i > 0) {
    const next = localDb.indexOf("export async function", i + 10);
    const body = localDb.slice(i, next > 0 ? next : i + 4000);
    eq(body.includes("_touchTextUpdatedAt"), fn + " must bump texts.updated_at (иначе облачная копия устаревает навсегда)");
  }
}

// ── 6. Зал: deep-link #cloud (лестница шагов 2–3 не полутупик) ───────────────
eq(libraryUi.includes("'#cloud'"), "library-ui.js must handle the #cloud hash deep-link");

// ── 6b. PAS-B3: [Открыть в Студии] — критика wf_7f300c39 ────────────────────
const draftFnIdx = libraryUi.indexOf("async function _draftOpenInStudio");
eq(draftFnIdx > 0, "library-ui.js must define _draftOpenInStudio");
const draftFn = libraryUi.slice(draftFnIdx, draftFnIdx + 3000);
eq(draftFn.includes("'/index.html#/t/'") && !draftFn.includes("?room=1"),
  "draft deep-link must target FULL Studio (без ?room=1 — room-mode прячет перевод-пайплайн)");
eq(draftFn.includes("closeLocalDB"), "draft nav must close the OPFS DB first (SQLITE_CANTOPEN-race)");
eq(draftFn.includes("source_meta_json: JSON.stringify"), "createText source_meta_json must be stringified (иначе провенанс молча теряется)");
eq(draftFn.includes("agent_draft"), "draft text must carry source='agent_draft' provenance");

// ── 7. locale-parity: каждый studio.agent.* ключ — в ru/en/he; плюс room.explain.draft*
// ключи Зала (PAS-B3) — tt-fallback недостижим при живом t(), промах = сырой ключ в UI
const usedKeys = [...new Set([
  ...[...agentJs.matchAll(/tt\('(studio\.agent\.[\w.]+)'/g)].map((m) => m[1]),
  ...[...libraryUi.matchAll(/tt\('(room\.explain\.draft[\w.]*)'/g)].map((m) => m[1]),
])];
eq(usedKeys.length >= 20, "expected >=20 agent locale keys, found " + usedKeys.length);
function loadLocale(file) {
  const src = read("public/i18n/locales/" + file);
  const sandbox = { window: {} };
  new Function("window", src)(sandbox.window);
  return sandbox.window.I18N_LOCALES;
}
for (const loc of ["ru", "en", "he"]) {
  let table = null;
  try { table = loadLocale(loc + ".js")[loc]; } catch (e) { failures.push("locale " + loc + ".js failed to eval: " + e.message); continue; }
  for (const key of usedKeys) {
    const val = key.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), table);
    eq(typeof val === "string" && val.length > 0, "locale " + loc + " is missing key " + key);
  }
}

// ── итог ─────────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error("smoke:studio-agent FAILED (" + failures.length + "):");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("smoke:studio-agent OK — " + (7 + usedKeys.length * 3) + "+ assertions green (keys: " + usedKeys.length + " ×3 locales)");
process.exit(0);
