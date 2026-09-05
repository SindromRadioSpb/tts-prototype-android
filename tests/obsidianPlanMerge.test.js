"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Preview = require("../public/js/obsidian-lexical-preview.js");

function plan(id, title, shared = "same") {
  return { schema: "linguistpro-obsidian-package-plan-v2", text_id: id, text_title: title,
    text_folder: title, text_path: `_LinguistPro/Тексты/${title}`,
    receipt: { audio: { expected_count: 1, included_count: 1 }, active_resolution_occurrences: id === "a" ? 2 : 0 },
    files: [
      { path: "_LinguistPro/Путеводитель.md", kind: "guide", bytes: shared.length, content: shared },
      { path: `_LinguistPro/Тексты/${title}/Текст.md`, kind: "text", bytes: title.length, content: title },
    ], external_files: [{ path: "_LinguistPro/Аудио/key.mp3", asset_key: "key", size_bytes: 3 }] };
}

test("multi-text Obsidian plan deduplicates shared references and audio", () => {
  const merged = Preview.mergeObsidianPlans([plan("a", "А"), plan("b", "Б")], { title: "Песни" });
  assert.equal(merged.text_count, 2);
  assert.equal(merged.files.filter(file => file.path === "_LinguistPro/Путеводитель.md").length, 1);
  assert.equal(merged.external_files.length, 1);
  assert.match(merged.files.find(file => file.path.endsWith("Корпус.md")).content, /Всего текстов: \*\*2\*\*/);
  assert.match(merged.files.find(file => file.path.endsWith("Корпус.md")).content, /Тексты\/А\/Текст/);
  assert.equal(JSON.parse(merged.files.find(file => file.path.endsWith("corpus-manifest.json")).content).texts[0].unresolved, 2);
});

test("multi-text merge fails closed on a conflicting shared file", () => {
  assert.throws(() => Preview.mergeObsidianPlans([plan("a", "А"), plan("b", "Б", "different")]), /file collision/);
});
