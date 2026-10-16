#!/usr/bin/env node
"use strict";
// O3 — the owner's blind adjudication sheet: every wrong/disputed keyed case + seeded controls, 50 in all.
// Candidate lemmas (program's and examiners') are shown WITHOUT meanings and in random order — nothing says which is
// the program's. Output: a local HTML page (not published) with a «copy answers» button; answers come back as text.
// node make-owner-sheet.js <audit-dir>
const fs = require("node:fs");
const path = require("node:path");
const { loose } = require("./score.js");

const dir = process.argv[2];
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry32(20261017);
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const POS = { noun: "сущ.", verb: "глагол", adjective: "прил.", adverb: "нареч.", propernoun: "имя", numeral: "числ.", pronoun: "мест.", preposition: "предлог",
  NOUN: "сущ.", VERB: "глагол", AUX: "глагол", ADJ: "прил.", ADV: "нареч.", PROPN: "имя", NUM: "числ.", PRON: "мест.", ADP: "предлог", X: "", SCONJ: "союз", CCONJ: "союз" };
const S = JSON.parse(fs.readFileSync(path.join(dir, "sample.json"), "utf8"));
const byId = new Map(S.items.map((it) => [it.id, it]));
const rows = JSON.parse(fs.readFileSync(path.join(dir, "scored.json"), "utf8")).filter((r) => /^S[1-4]$/.test(r.stratum));
const hard = rows.filter((r) => r.vote === "wrong" || r.vote === "disputed");
const controls = shuffle(rows.filter((r) => r.vote === "right")).slice(0, Math.max(0, 50 - hard.length));
const picked = shuffle(hard.concat(controls));
const sheet = [], key = [];
picked.forEach((r, i) => {
  const it = byId.get(r.id), no = i + 1;
  const appLemma = String(r.key || "").startsWith("dl:") ? String(r.key).slice(3).split("#")[0] : r.lemma;
  const appPos = String(r.key || "").startsWith("dl:") ? String(r.key).slice(3).split("#")[1] || r.pos : r.pos;
  const cands = [];
  const add = (lemma, pos, who) => {
    if (!lemma) return;
    // one option per word: an examiner without a part of speech (Dicta here) joins the option with the same lemma
    const L = loose(lemma), P = POS[pos] || "";
    const c = cands.find((x) => x.L === L && (x.pos === P || !P || !x.pos));
    if (c) { c.who.push(who); if (!c.pos) c.pos = P; } else cands.push({ L, lemma, pos: P, who: [who] });
  };
  add(appLemma, appPos, "app"); add(r.stanza_lemma, r.stanza_upos, "stanza"); add(r.dicta_lemma_ctx, "", "dicta"); add(r.llm_lemma, r.llm_upos, "llm");
  const order = shuffle(cands);
  const letters = "абвгде";
  sheet.push({ no, sentence: it.tokens_niqqud, index: it.index, title: it.text_title, options: order.map((c, j) => ({ letter: letters[j], lemma: c.lemma, pos: c.pos })) });
  key.push({ no, id: r.id, stratum: r.stratum, vote: r.vote, control: r.vote === "right", options: order.map((c, j) => ({ letter: letters[j], lemma: c.lemma, pos: c.pos, who: c.who })) });
});
fs.writeFileSync(path.join(dir, "owner-sheet.key.json"), JSON.stringify(key, null, 1));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const items = sheet.map((q) => {
  const words = q.sentence.map((w, j) => j === q.index ? `<mark>${esc(w)}</mark>` : esc(w)).join(" ");
  const opts = q.options.map((o) => `<label><input type="radio" name="q${q.no}" value="${o.letter}"> ${o.letter}) <b lang="he" dir="rtl">${esc(o.lemma)}</b> <span class="pos">${esc(o.pos)}</span></label>`)
    .concat([`<label><input type="radio" name="q${q.no}" value="и"> и) имя / иностранное слово</label>`,
      `<label><input type="radio" name="q${q.no}" value="д"> д*) другое: <input type="text" class="other" data-q="${q.no}" lang="he" dir="rtl" size="10"></label>`,
      `<label><input type="radio" name="q${q.no}" value="?"> ?) не знаю</label>`]).join("");
  return `<section><h2>${q.no}</h2><p class="src">${esc(q.title)}</p><p class="he" lang="he" dir="rtl">${words}</p><p class="ask">Какое слово (лемма) выделено — в этом предложении?</p><div class="opts">${opts}</div></section>`;
}).join("\n");
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Слепая проверка слов</title>
<style>:root{--bg:#fbfaf7;--fg:#1f2328;--muted:#6b6f76;--mark:#ffe58a;--card:#fff;--line:#e4e1da}
@media (prefers-color-scheme:dark){:root{--bg:#16181c;--fg:#e8e6e1;--muted:#9aa0a8;--mark:#6b5a12;--card:#1e2126;--line:#30343a}}
body{background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif;margin:0 auto;max-width:860px;padding:16px}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin:14px 0}
h2{margin:0;font-size:15px;color:var(--muted)}.src{margin:2px 0;color:var(--muted);font-size:13px}
.he{font-size:24px;line-height:1.7;margin:8px 0}mark{background:var(--mark);color:inherit;padding:0 3px;border-radius:4px}
.opts label{display:block;padding:4px 0;cursor:pointer}.opts b{font-size:21px}.pos{color:var(--muted);font-size:13px}
.ask{margin:4px 0;font-size:14px}#out{width:100%;height:90px}button{font:inherit;padding:10px 16px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer}</style></head>
<body><h1>Слепая проверка: какое это слово?</h1>
<p>50 слов из ваших текстов. Для каждого выберите лемму, которая верна <b>в этом предложении</b>. Варианты перемешаны; какой из них дала программа, не указано. Если ни один не подходит — «другое» и впишите слово; не уверены — «не знаю» (это честный ответ, не ошибка).</p>
${items}
<p><button id="copy">Собрать ответы</button> <span id="cnt"></span></p><textarea id="out" readonly></textarea>
<p>Скопируйте строку из поля и пришлите её в чат.</p>
<script>
document.getElementById("copy").onclick=function(){var a=[],n=0;for(var i=1;i<=${sheet.length};i++){var c=document.querySelector('input[name="q'+i+'"]:checked');var v=c?c.value:"-";if(v==="д"){var t=document.querySelector('.other[data-q="'+i+'"]');v="д:"+(t&&t.value||"");}if(c)n++;a.push(i+v);}
var o=document.getElementById("out");o.value=a.join(" ");o.select();try{navigator.clipboard.writeText(o.value)}catch(e){}document.getElementById("cnt").textContent="отвечено "+n+" из ${sheet.length}";};
</script></body></html>`;
fs.writeFileSync(path.join(dir, "owner-sheet.html"), html);
console.log("sheet", sheet.length, "hard", hard.length, "controls", controls.length);
