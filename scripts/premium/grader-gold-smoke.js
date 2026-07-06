#!/usr/bin/env node
"use strict";
// smoke:grader-gold — гейт P7.0b (TELEGRAM_P7_DECISION §P7.0b; R17-B гейты 3/4/5/7):
//   1) gold-набор (рукописный, fixtures/grader/grader-gold-v1.json) — порог 100%;
//   2) derived-свип по shipped-датасету pealim-infl-v12 (детерминированная выборка
//      парадигм; lemma_niqqud как expected, ответ = plain-лемма И огласованная) — ≥99%;
//   3) провенанс: все 7 полей владельца на каждом вердикте;
//   4) детерминизм: два вызова → byte-equal JSON;
//   5) D1-интеграция: production-провал на рецептивно-сильных rows → Hard(2) через
//      ОБЩИЙ grade-policy; АННУЛИРОВАННЫЙ production-успех отфильтрован (P7.0a) →
//      Hard восстанавливается; рецептивный провал → Again(1); correct → Good(3);
//   6) MNAR: empty/unsupported → gradable=false, grade=null;
//   7) R17-B deterministic-first структурно: agent/grader.js НЕ импортирует llm.
// Run: node scripts/premium/grader-gold-smoke.js [--gate]

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const REPO = path.resolve(__dirname, "..", "..");
const G = require(path.join(REPO, "agent", "grader.js"));
const GOLD = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "grader", "grader-gold-v1.json"), "utf8"));

const failures = [];
const eq = (c, m) => { if (!c) failures.push(m); };

// ── 7) структурный ассерт: грейдер не знает про LLM ──────────────────────────
const src = fs.readFileSync(path.join(REPO, "agent", "grader.js"), "utf8");
eq(!/require\([^)]*llm/.test(src) && !/generate\s*\(/.test(src),
  "R17-B deterministic-first: agent/grader.js must not import/use the LLM layer");

// ── 1) gold: 100% ─────────────────────────────────────────────────────────────
let goldPass = 0;
for (const c of GOLD.cases) {
  const r = G.gradeAnswer({ expected: c.expected, answer: c.answer, channel: "dictate:typed", prevState: null, rows: [] });
  const w = c.want || {};
  let ok = r.decision === w.decision;
  if (ok && w.gradable !== undefined) ok = r.gradable === w.gradable;
  if (ok && w.correct !== undefined) ok = r.correct === w.correct;
  if (ok && w.matched_variant !== undefined) ok = r.provenance.matched_variant === w.matched_variant;
  if (ok && w.reason !== undefined) ok = r.provenance.reason === w.reason;
  if (ok) goldPass++;
  else failures.push(`gold[${c.name}]: want ${JSON.stringify(w)} got ` +
    JSON.stringify({ decision: r.decision, gradable: r.gradable, correct: r.correct, matched_variant: r.provenance.matched_variant, reason: r.provenance.reason }));
  // 3) провенанс: 7 полей владельца присутствуют на КАЖДОМ вердикте; expected_form_id =
  // ПЕРЕДАННЫЙ item_key байт-в-байт (asserted, не re-derived — критика: ре-резолв дал бы
  // ключ-диалект, не совпадающий с ключом реальной review-строки)
  const p = r.provenance;
  eq(p && "policy_version" in p && "normalizer_version" in p && "resolver_version" in p
    && "expected_form_id" in p && "matched_variant" in p && "decision" in p && "reason" in p
    && p.expected_form_id === (c.expected.item_key != null ? c.expected.item_key : null),
    `gold[${c.name}]: provenance must carry all 7 owner fields with expected_form_id == passed item_key`);
  // 6) MNAR: не-грейдабельные вердикты не несут grade
  if (r.gradable === false) eq(r.grade === null && r.correct === null,
    `gold[${c.name}]: non-gradable verdict must carry grade=null (MNAR: caller writes nothing)`);
}
eq(goldPass === GOLD.cases.length, `GOLD THRESHOLD: ${goldPass}/${GOLD.cases.length} — порог 100%`);

// ── 4) детерминизм ────────────────────────────────────────────────────────────
{
  const c = GOLD.cases[0];
  const a = JSON.stringify(G.gradeAnswer({ expected: c.expected, answer: c.answer, channel: "read:mc", prevState: null, rows: [] }));
  const b = JSON.stringify(G.gradeAnswer({ expected: c.expected, answer: c.answer, channel: "read:mc", prevState: null, rows: [] }));
  eq(a === b, "determinism: same input must produce byte-equal output");
}

// ── 5) D1-интеграция (общий grade-policy + P7.0a withoutAnnulled) ─────────────
const EXP = { form: "שָׁלוֹם", lemma: "שלום", item_key: "שלום#noun" };
const prevState = { stability: 5, difficulty: 5 };   // память есть
const rcv = (n, g) => ({ id: "r" + n, kind: "review", grade: g, channel: "read:mc", reviewed_at: "2026-01-0" + n + "T10:00:00.000Z", meta_json: "{}" });
// (а) production-провал (near_miss) на рецептивно-сильном → Hard(2), политика применена
{
  const r = G.gradeAnswer({ expected: EXP, answer: "שלוש", channel: "dictate:typed", prevState, rows: [rcv(1, 3), rcv(2, 3)] });
  eq(r.decision === "near_miss" && r.grade === 2 && r.policy && r.policy.applied === true && r.policy.grade_policy,
    "D1: near_miss on receptive-strong word must map to Hard(2) with policy provenance, got " + JSON.stringify({ d: r.decision, g: r.grade, p: r.policy }));
}
// (б) АННУЛИРОВАННЫЙ production-успех не считается доказанной компетенцией (P7.0a):
//     без фильтра hasProductionSuccess=true навсегда отключил бы смягчение
{
  const prodOk = { id: "p1", kind: "review", grade: 3, channel: "dictate:typed", reviewed_at: "2026-01-03T10:00:00.000Z", meta_json: "{}" };
  const annul = { id: "annul:p1", kind: "annul", grade: null, channel: null, reviewed_at: "2026-01-04T10:00:00.000Z", meta_json: JSON.stringify({ annul_of: "p1" }) };
  const withA = G.gradeAnswer({ expected: EXP, answer: "שלוש", channel: "dictate:typed", prevState, rows: [rcv(1, 3), rcv(2, 3), prodOk, annul] });
  eq(withA.grade === 2 && withA.policy.applied === true,
    "P7.0a×D1: annulled production-success must be filtered → Hard(2) restored, got " + JSON.stringify(withA.policy));
  const noA = G.gradeAnswer({ expected: EXP, answer: "שלוש", channel: "dictate:typed", prevState, rows: [rcv(1, 3), rcv(2, 3), prodOk] });
  eq(noA.grade === 1 && noA.policy.applied === false,
    "control: with a LIVE production-success the mitigation must NOT apply (Again), got " + JSON.stringify(noA.policy));
}
// (в) рецептивный провал → Again(1); (г) correct → Good(3)
{
  const rf = G.gradeAnswer({ expected: EXP, answer: "שלוש", channel: "read:mc", prevState, rows: [rcv(1, 3)] });
  eq(rf.grade === 1, "receptive fail must be Again(1)");
  const rc = G.gradeAnswer({ expected: EXP, answer: "שלום", channel: "dictate:typed", prevState, rows: [] });
  eq(rc.grade === 3 && rc.correct === true, "correct must be Good(3)");
}
// (д) skip — явный отказ («Не знаю» P7.2): grade 1 БЕЗ D1-смягчения даже на
// рецептивно-сильном слове (R17-B «отказ не смягчается»); gradable=true — пишется
{
  const rs = G.gradeAnswer({ expected: EXP, answer: "", skipped: true, channel: "dictate:typed", prevState, rows: [rcv(1, 3), rcv(2, 3)] });
  eq(rs.decision === "skip" && rs.gradable === true && rs.grade === 1 && rs.policy.applied === false,
    "explicit skip must be gradable Again(1) with NO mitigation, got " + JSON.stringify({ d: rs.decision, g: rs.grade, p: rs.policy }));
}
// (е) словарь каналов P7.2 (критика: 'telegram*' не узнался бы grade-policy → D1 мёртв,
// production-успехи падали бы в receptive): бот ОБЯЗАН писать '<семья>:<tg-режим>'
{
  const GP = require(path.join(REPO, "public", "js", "grade-policy.js"));
  eq(GP.isProductionChannel("dictate:tg") === true && GP.isProductionChannel("reverse:tg") === true
    && GP.isProductionChannel("read:tg") === false && GP.isProductionChannel("telegram") === false,
    "P7.2 channel vocabulary: '<family>:<tg-mode>' must classify via the EXISTING family prefixes ('telegram' bare is NOT a family)");
}
// (ж) провенанс-полям есть где жить: серверный ingest-allowlist принимает
// идентификаторные ключи грейдера (критика: раньше реджектил 6 из 7 → строка бы падала)
{
  const LLR = require(path.join(REPO, "db", "learnerLogRepo.js"));
  const need = ["policy_version", "normalizer_version", "resolver_version", "matched_variant", "decision", "expected_form_id", "reason", "grader", "grade_policy", "raw_grade"];
  eq(need.every((k) => LLR.META_ALLOW.has(k)),
    "META_ALLOW must accept all grader provenance identifier keys: " + need.filter((k) => !LLR.META_ALLOW.has(k)).join(","));
}

// ── 2) derived-свип по датасету — С ЗУБАМИ (урок independent-oracle: самосовпадение
// одной нормализации тавтологично; негативы обязательны). Клетки реальных парадигм:
//   позитив: ответ == огласованная клетка → correct (100%);
//   негатив: ответ == скелет ДРУГОЙ клетки той же парадигмы → exact-false-accept
//   ЗАПРЕЩЁН (matched_variant='form' на негативе = 0); проклитик-маркированные
//   акцепты — унаследованная измеренная дыра, репортится + ограничена сверху.
{
  const ds = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(REPO, "public", "data", "inflection", "pealim-infl-v12.json.gz"))));
  const STEP = 20;   // детерминированная выборка: каждая 20-я парадигма
  let posTotal = 0, posPass = 0, negTotal = 0, negAccepted = 0, negExactAccepts = 0;
  const sampleFails = [], negMarked = {};
  for (let i = 0; i < ds.paradigms.length; i += STEP) {
    const p = ds.paradigms[i];
    if (!p || !p.lemma || !p.cells) continue;
    const cellKeys = Object.keys(p.cells).sort();
    if (!cellKeys.length) continue;
    const cellA = p.cells[cellKeys[0]];
    if (!cellA || !cellA.he) continue;
    const expected = { form: cellA.he, lemma: p.lemma, item_key: p.lemma + "#" + (p.pos || "") };
    // позитив: сам себя (огласованная клетка)
    posTotal++;
    const rp = G.gradeAnswer({ expected, answer: cellA.he, channel: "dictate:typed", prevState: null, rows: [] });
    if (rp.decision === "correct") posPass++;
    else if (sampleFails.length < 8) sampleFails.push({ lemma: p.lemma, cell: cellKeys[0], decision: rp.decision, reason: rp.provenance.reason });
    // негатив: первая клетка с ДРУГИМ скелетом
    const aSkel = G.normalizeAnswer(cellA.he);
    for (let k = 1; k < cellKeys.length; k++) {
      const cellB = p.cells[cellKeys[k]];
      if (!cellB || !cellB.he) continue;
      const bSkel = G.normalizeAnswer(cellB.he);
      if (!bSkel || bSkel === aSkel) continue;
      negTotal++;
      const rn = G.gradeAnswer({ expected, answer: bSkel, channel: "dictate:typed", prevState: null, rows: [] });
      if (rn.correct === true) {
        negAccepted++;
        if (rn.provenance.matched_variant === "form") negExactAccepts++;
        negMarked[rn.provenance.matched_variant] = (negMarked[rn.provenance.matched_variant] || 0) + 1;
      }
      break;
    }
  }
  eq(posPass === posTotal, `SWEEP positives: ${posPass}/${posTotal} — клетка против себя обязана быть correct; fails: ` + JSON.stringify(sampleFails));
  eq(negExactAccepts === 0, `SWEEP negatives: ${negExactAccepts} НЕмаркированных (matched_variant='form') false-accept — точный матч не имеет права принять чужую клетку`);
  const negRate = negTotal ? negAccepted / negTotal : 0;
  eq(negRate <= 0.10, `SWEEP negatives: accept-rate ${(negRate * 100).toFixed(2)}% > 10% — унаследованная проклитик-дыра шире замеренной: ` + JSON.stringify(negMarked));
  console.log(`[grader-gold] sweep: pos ${posPass}/${posTotal} · neg accepted ${negAccepted}/${negTotal} (${(negRate * 100).toFixed(2)}%, все маркированы: ${JSON.stringify(negMarked)}) · gold: ${goldPass}/${GOLD.cases.length}`);
}

const TOTAL = 2 + GOLD.cases.length * 2 + 1 + 8 + 3;   // llm-guard+gold-threshold · per-case (вердикт+провенанс) · детерминизм · D1/skip/каналы/META (а,б×2,в,г,д,е,ж) · свип×3
if (failures.length) {
  console.error(`smoke:grader-gold FAIL (${TOTAL - failures.length}/${TOTAL})`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exitCode = 1;
} else {
  console.log(`smoke:grader-gold OK (${TOTAL}/${TOTAL}) — P7.0b: gold 100% (${GOLD.cases.length} кейсов: точный/огласовки/финальные/проклитики/лемма/ktiv-candidate/lev1/wrong/empty/не-иврит) · датасет-свип ≥99% · провенанс 7 полей на каждом вердикте · детерминизм byte-equal · D1 через общий grade-policy (Hard на рецептивно-сильном; annulled production-успех отфильтрован P7.0a) · MNAR (empty/unsupported без grade) · LLM структурно недостижим`);
}
