// scripts/premium/studio-retell-smoke.js
// W2-S11 T8 — детерминированный смоук-гейт (офлайн, CI-safe): pure-API зеркала LEVELS,
// StudioRetell API-поверхность, паспорт без audio/captions, wiring-маркеры в index.html/
// sw.js/локалях/routes.js (config-string-match — feedback_config_string_match_by_construction).
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..", "..");
const SR = require(path.join(ROOT, "public/js/studio-retell.js"));
const IR = require(path.join(ROOT, "ingest/retell.js"));
let fails = 0;
function check(name, ok) { console.log((ok ? "✓ " : "✗ ") + name); if (!ok) fails++; }

check("LEVELS зеркала совпадают", JSON.stringify(SR.LEVELS) === JSON.stringify(IR.LEVELS));
check("StudioRetell экспортирует полный API", ["openFromComposer", "close", "run", "estimateRetellCost", "buildRetellPassport", "estimateTextCoverage", "aggregateCoverage"].every((k) => typeof SR[k] === "function"));
const p = SR.buildRetellPassport({ originLabel: "x", level: "B1", model: "m", retellText: "א." });
check("паспорт без audio/captions", p.audio === undefined && p.captions === undefined && p.kind === "retell");

const idx = fs.readFileSync(path.join(ROOT, "public/index.html"), "utf8");
check("index.html: модал v3RetellModal", idx.includes('id="v3RetellModal"'));
check("index.html: кнопка композера v3RetellEntryBtn", idx.includes('id="v3RetellEntryBtn"'));
check("index.html: v3AttachImportSource копирует im.retell", /if \(im\.retell\) v3LastGeminiMeta\.source\.retell = im\.retell/.test(idx));
check("index.html: KIND retell в панели провенанса", idx.includes("provKindRetell"));
check("index.html: script-тег studio-retell.js", idx.includes('src="/js/studio-retell.js"'));

const sw = fs.readFileSync(path.join(ROOT, "public/sw.js"), "utf8");
check("sw.js: precache studio-retell.js", sw.includes('"/js/studio-retell.js"'));

for (const loc of ["ru", "en", "he"]) {
  const l = fs.readFileSync(path.join(ROOT, "public/i18n/locales", loc + ".js"), "utf8");
  check("локаль " + loc + ": studio.retell.*", l.includes("retell:") && l.includes("providerHint") && l.includes("confirmReplaceUnsaved"));
  check("локаль " + loc + ": textMeta.provKindRetell", l.includes("provKindRetell"));
}

const routes = fs.readFileSync(path.join(ROOT, "ingest/routes.js"), "utf8");
check("routes: /api/ingest/retell зарегистрирован с limiter", /app\.post\("\/api\/ingest\/retell", limiter/.test(routes));

console.log(fails ? `FAIL: ${fails}` : "OK");
process.exit(fails ? 1 : 0);
