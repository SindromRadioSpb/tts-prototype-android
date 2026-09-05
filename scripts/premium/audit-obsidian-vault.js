#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");

function arg(name) { const i = process.argv.indexOf("--" + name); return i < 0 ? "" : String(process.argv[i + 1] || ""); }
function walk(root) { const out = []; for (const entry of fs.readdirSync(root, { withFileTypes: true })) { const target = path.join(root, entry.name); if (entry.isDirectory()) out.push(...walk(target)); else out.push(target); } return out; }
function existsTarget(from, target) {
  const clean = String(target || "").trim(); if (!clean || clean === "..." || /^https?:/i.test(clean)) return true;
  const candidate = path.resolve(path.dirname(from), clean.replaceAll("/", path.sep));
  return [candidate, candidate + ".md", candidate + ".base"].some(fs.existsSync);
}
const root = path.resolve(arg("vault"));
if (!arg("vault") || !fs.existsSync(root)) throw new Error("VAULT_REQUIRED");
const files = walk(root), markdown = files.filter(file => file.endsWith(".md")), broken = [], operatorTitles = [];
for (const file of markdown) {
  const text = fs.readFileSync(file, "utf8");
  if (/^title:\s*["']?Position\s+\d+/mi.test(text)) operatorTitles.push(path.relative(root, file));
  for (const match of text.matchAll(/!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)) {
    if (!existsTarget(file, match[1])) broken.push({ file: path.relative(root, file), target: match[1] });
  }
}
const textRoot = path.join(root, "_LinguistPro", "texts");
const textIds = fs.existsSync(textRoot) ? fs.readdirSync(textRoot, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name) : [];
const incomplete = textIds.filter(id => ["Текст.md", "Учебный маршрут.md", "Фразы.md", "Лексика.base", "Разбор.base"].some(name => !fs.existsSync(path.join(textRoot, id, name))));
const manifestPath = path.join(root, "_LinguistPro", "corpus-manifest.json"), manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : null;
const report = { schema: "linguistpro-obsidian-vault-audit-v1", root, files: files.length, markdown: markdown.length,
  texts: textIds.length, audio: files.filter(file => /[\\/]_LinguistPro[\\/]media[\\/]audio[\\/]/.test(file)).length,
  broken_wikilinks: broken, operator_titles: operatorTitles, incomplete_texts: incomplete,
  manifest_texts: manifest && Number(manifest.text_count), pass: !!manifest && Number(manifest.text_count) === textIds.length && !broken.length && !operatorTitles.length && !incomplete.length };
console.log(JSON.stringify(report, null, 2));
if (!report.pass) process.exit(1);
