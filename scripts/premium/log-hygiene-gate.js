"use strict";

// Gate: gate:log-hygiene — P8.6 §19 «нет сырого initData/ответов/prompt в логах».
// FAIL-CLOSED по построению (критика wf_2e4d3fe5 r14+r11: денилист по словам ловит только
// упоминания по имени — `console.log(req.body)` и `console.error(rawAnswer)` проходили бы):
// каждый АРГУМЕНТ каждого console.*-вызова в security-скоупе обязан быть доказуемо безопасным
// (строковый литерал без интерполяции, число, e/e.message-паттерн) ЛИБО вызов допущен
// content-keyed allowlist'ом (по стабильной подстроке-лейблу, НЕ по номеру строки — те гниют).
// Маркер-скоуп server.js: от банера CLG-P8.1 до webhook-секции; маркер пропал → FAIL.
// Self-test (teeth-of-the-teeth): синтетические утечки ОБЯЗАНЫ детектироваться, иначе exit 1.
// Exit: 0 = чисто, 1 = нарушение/самотест-провал.

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");

// Полные файлы: весь агентный слой + security-критичные репо (initData/токены/cookieValue).
const FULL_FILES = [];
for (const f of fs.readdirSync(path.join(ROOT, "agent"))) if (f.endsWith(".js")) FULL_FILES.push("agent/" + f);
for (const f of fs.readdirSync(path.join(ROOT, "agent", "telegram"))) if (f.endsWith(".js")) FULL_FILES.push("agent/telegram/" + f);
for (const f of fs.readdirSync(path.join(ROOT, "db"))) if (/^agent.*\.js$/.test(f)) FULL_FILES.push("db/" + f);
FULL_FILES.push("db/handoffRepo.js", "db/identityRepo.js", "db/channelLinkRepo.js");

// server.js — только miniapp-регион, вырезанный по СТРУКТУРНЫМ маркерам (не по номерам строк).
const SERVER_REGION = {
  file: "server.js",
  startMarker: "CLG-P8.1 — Telegram Mini App",
  endMarker: "── webhook: secret-middleware",
};

// Безопасные выражения-аргументы (whitelist, не денилист).
const SAFE_ARG = [
  /^"(?:[^"\\]|\\.)*"$/,                                    // "строковый литерал"
  /^'(?:[^'\\]|\\.)*'$/,
  /^`[^`$]*`$/,                                             // template БЕЗ ${}
  /^-?\d+(\.\d+)?$/,
  /^(e|e2|err|error)(\s*&&\s*(e|e2|err|error)\.(message|code|status))?$/,
  /^(e|e2|err|error)\.(message|code|status)$/,
  /^String\((e|e2|err|error)(\s*&&\s*(e|e2|err|error)\.(message|code))?\)(\.slice\(\s*0\s*,\s*\d+\s*\))?$/,
];

// Content-keyed allowlist: {fileSuffix, label} — вызов допущен, если его текст содержит label.
// Каждая запись = осознанное ревью, что интерполируемые значения — счётчики/enum (класс A).
const ALLOW = [
  { fileSuffix: "agent/reviewSession.js", label: "[tg-review] dictate" },        // конфиг-строка + счётчик кандидатов
  { fileSuffix: "agent/llm.js", label: "[agent-llm]" },                          // провайдер/квота: enum+числа
  { fileSuffix: "agent/runtime.js", label: "[agent]" },                          // ids/счётчики
  { fileSuffix: "agent/reviewer.js", label: "[agent-review]" },                  // e.message-обрезки
  { fileSuffix: "db/agentChallengeRepo.js", label: "[agent-challenge]" },        // challenge_id (id, не контент)
  { fileSuffix: "db/channelLinkRepo.js", label: "[telegram]" },                  // счётчики prune/cascade
];

// ── извлечение console.*(...) с балансом скобок (многострочные вызовы, строки, template) ──
function extractConsoleCalls(src) {
  const calls = [];
  const re = /console\.(log|error|warn|info|debug)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length, depth = 1, arg = "", args = [];
    let mode = null; // null | '"' | "'" | '`'
    for (; i < src.length && depth > 0; i++) {
      const c = src[i], prev = src[i - 1];
      if (mode) {
        arg += c;
        if (c === mode && prev !== "\\") mode = null;
        continue;
      }
      if (c === '"' || c === "'" || c === "`") { mode = c; arg += c; continue; }
      if (c === "(" || c === "[" || c === "{") { depth += c === "(" ? 1 : 0; arg += c; continue; }
      if (c === ")" ) { depth--; if (depth === 0) break; arg += c; continue; }
      if (c === "," && depth === 1) { args.push(arg); arg = ""; continue; }
      arg += c;
    }
    if (arg.trim()) args.push(arg);
    const line = src.slice(0, m.index).split("\n").length;
    calls.push({ line, method: m[1], args: args.map((a) => a.trim().replace(/\s+/g, " ")), text: src.slice(m.index, i + 1) });
  }
  return calls;
}

function violationsIn(rel, src) {
  const out = [];
  for (const call of extractConsoleCalls(src)) {
    const allowed = ALLOW.some((a) => rel.replace(/\\/g, "/").endsWith(a.fileSuffix) && call.text.includes(a.label));
    if (allowed) continue;
    const bad = call.args.filter((a) => !SAFE_ARG.some((re) => re.test(a)));
    if (bad.length) out.push({ file: rel, line: call.line, bad, text: call.text.slice(0, 160) });
  }
  return out;
}

// ── self-test: классификатор ОБЯЗАН ловить канонические утечки ──
const FIXTURES_MUST_FAIL = [
  'console.log("dbg", rawAnswer);',
  "console.error(req.body);",
  "console.log(`init ${v.user}`);",
  'console.error("challenge:", caps.shown_stimulus);',
  'console.warn("ans", b.answer, "exp", chal.expected_surface);',
];
const FIXTURES_MUST_PASS = [
  'console.error("[miniapp] review route failed:", e && e.message);',
  'console.log("[ops-sweep] done");',
  "console.error('x', e.message);",
];

(function main() {
  let selfTestOk = true;
  for (const f of FIXTURES_MUST_FAIL) if (violationsIn("fixture.js", f).length === 0) { selfTestOk = false; console.error("  ✗ self-test: НЕ поймана утечка: " + f); }
  for (const f of FIXTURES_MUST_PASS) if (violationsIn("fixture.js", f).length !== 0) { selfTestOk = false; console.error("  ✗ self-test: ложный сигнал на безопасном: " + f); }
  if (!selfTestOk) { console.error("gate:log-hygiene FAIL (self-test)"); process.exit(1); }

  const all = [];
  for (const rel of FULL_FILES) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) continue;
    all.push(...violationsIn(rel, fs.readFileSync(p, "utf8")));
  }
  const srv = fs.readFileSync(path.join(ROOT, SERVER_REGION.file), "utf8");
  const si = srv.indexOf(SERVER_REGION.startMarker), ei = srv.indexOf(SERVER_REGION.endMarker);
  if (si < 0 || ei < 0 || ei <= si) { console.error("gate:log-hygiene FAIL: маркеры miniapp-региона server.js не найдены (fail-closed)"); process.exit(1); }
  const offsetLines = srv.slice(0, si).split("\n").length - 1;
  for (const v of violationsIn("server.js[miniapp]", srv.slice(si, ei))) { v.line += offsetLines; all.push(v); }

  if (all.length) {
    console.error(`gate:log-hygiene FAIL (${all.length} violation(s)):`);
    for (const v of all) console.error(`  ✗ ${v.file}:${v.line} args=[${v.bad.join(" | ")}]\n     ${v.text}`);
    process.exit(1);
  }
  console.log("gate:log-hygiene OK — console.* в security-скоупе: только литералы/e.message/allowlist (self-test 8/8)");
  process.exit(0);
})();
