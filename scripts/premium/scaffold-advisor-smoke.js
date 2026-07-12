#!/usr/bin/env node
"use strict";
// smoke:scaffold-advisor — гейт PAS-D2 (спека PAS_SLICE_D_SPEC v2).
//   D2b pure (scaffold-advisor.js): таблица advise — full+ready→N · adaptive+show+in-zone+
//     !loadFlag→R · ⚡loadFlag=true→null (второй канал честности, критика L2-7) · hard-zone→null ·
//     offered-ключи→null (ветеранов не переспрашиваем) · приоритет N>R · личный текст
//     (coverage=null)→R не предлагается.
//   D2a pure (format.goalLine + buildDescriptor): default_* → goal-строка; skill-driven/manual/
//     ahead → "" (дедуп с explain по построению, критика L2-16); withExplanation фолбэк;
//     buildDescriptor: goal_line есть ТОЛЬКО при default_* и взаимоисключающ с explain.
// Run: node scripts/premium/scaffold-advisor-smoke.js   (exit 0 = green)

const path = require("path");
const REPO = path.resolve(__dirname, "..", "..");

const failures = [];
const eq = (c, m) => { if (!c) failures.push(m); };

// ── D2b: advise-таблица ────────────────────────────────────────────────────────
const SA = require(path.join(REPO, "public", "js", "scaffold-advisor.js"));
const base = { niqqudMode: "adaptive", ruMode: "off", fadeReady: false, fadeGradOffered: false, ruRevealOffered: false, coverage: null };

eq(SA.advise({ ...base, niqqudMode: "full", fadeReady: true }).rule === "N", "full+ready → N");
eq(SA.advise({ ...base, niqqudMode: "full", fadeReady: false }) === null, "full+not-ready → null (гейт уверенности не ослаблен)");
eq(SA.advise({ ...base, niqqudMode: "full", fadeReady: true, fadeGradOffered: true }) === null, "offered-ключ N → null");
eq(SA.advise({ ...base, ruMode: "show", coverage: { zone: "in", loadFlag: false } }).rule === "R", "show+in-zone+!loadFlag → R");
eq(SA.advise({ ...base, ruMode: "show", coverage: { zone: "easy", loadFlag: false } }).rule === "R", "easy-zone → R");
eq(SA.advise({ ...base, ruMode: "show", coverage: { zone: "in", loadFlag: true } }) === null, "loadFlag=true → null (имена/архаика — второй канал честности)");
eq(SA.advise({ ...base, ruMode: "show", coverage: { zone: "hard", loadFlag: false } }) === null, "hard-zone → null");
eq(SA.advise({ ...base, ruMode: "show", coverage: null }) === null, "личный текст (нет coverage) → R не предлагается");
eq(SA.advise({ ...base, ruMode: "show", coverage: { zone: "in", loadFlag: false }, ruRevealOffered: true }) === null, "offered-ключ R → null");
eq(SA.advise({ ...base, ruMode: "reveal", coverage: { zone: "in", loadFlag: false } }) === null, "уже reveal → null");
eq(SA.advise({ niqqudMode: "full", fadeReady: true, fadeGradOffered: false, ruMode: "show", ruRevealOffered: false, coverage: { zone: "in", loadFlag: false } }).rule === "N",
  "оба применимы → приоритет N>R");

// ── D2a: goalLine + withExplanation ───────────────────────────────────────────
const format = require(path.join(REPO, "agent", "telegram", "format.js"));
eq(format.goalLine("default_context", "ru").includes("Цель"), "default_context → ru goal-строка");
eq(format.goalLine("default_dictation", "en").includes("Goal"), "default_dictation → en goal-строка");
eq(format.goalLine("default_recall", "ru").length > 0, "default_recall → goal-строка");
eq(format.goalLine("reading_strong_close_dictation_gap", "ru") === "", "flagship → БЕЗ goal (explain уже несёт цель)");
eq(format.goalLine("recent_struggle_prefer_cued", "ru") === "", "struggle → БЕЗ goal");
eq(format.goalLine("user_choice", "ru") === "", "manual → БЕЗ goal");
eq(format.goalLine("ahead_of_schedule", "ru") === "", "ahead → БЕЗ goal");
eq(format.goalLine("receptive_fallback", "ru") === "", "receptive_fallback → БЕЗ goal");
eq(format.withExplanation("PROMPT", "default_context", "cloze", "ru").startsWith("📚"), "бот: default_* prompt получает goal-префикс");
eq(format.withExplanation("PROMPT", "reading_strong_close_dictation_gap", "dictate", "ru").indexOf("знакомо при чтении") >= 0,
  "бот: flagship prompt сохраняет explain-префикс (не goal)");
// goal-строка НЕ содержит чисел (унифицированные счётчики R3.x не лгут)
eq(!/\d/.test(format.goalLine("default_context", "ru")), "goal-строка без чисел");

// ── D2a: композиция дескриптора (goal_line взаимоисключающ с explain) ─────────
const rs = require(path.join(REPO, "agent", "reviewSession.js"));
const dDefault = rs.buildDescriptor({ kind: "reverse", select_reason: "default_recall", gloss: "g" }, { lng: "ru" });
eq(dDefault.goal_line && dDefault.goal_line.includes("Цель") && !dDefault.explain,
  "descriptor default_recall: goal_line есть, explain пуст");
const dFlag = rs.buildDescriptor({ kind: "dictate", select_reason: "reading_strong_close_dictation_gap", assetKey: "a".repeat(64) }, { lng: "ru" });
eq(dFlag.explain && !dFlag.goal_line, "descriptor flagship: explain есть, goal_line НЕТ (дедуп по построению)");
const dManual = rs.buildDescriptor({ kind: "reverse", select_reason: "user_choice", gloss: "g" }, { lng: "ru" });
eq(!dManual.explain && !dManual.goal_line, "descriptor manual: ни explain, ни goal_line");
const dEn = rs.buildDescriptor({ kind: "reverse", select_reason: "default_recall", gloss: "g" }, { lng: "en" });
eq(dEn.goal_line && dEn.goal_line.includes("Goal"), "descriptor en-локализован");

if (failures.length) {
  console.error("\nsmoke:scaffold-advisor FAILED (" + failures.length + "):");
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
}
console.log("smoke:scaffold-advisor OK — D2b advise-таблица (11) + D2a goalLine/withExplanation (10) + descriptor-композиция (4)");
process.exit(0);
