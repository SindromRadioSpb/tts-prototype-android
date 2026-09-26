"use strict";

// 2026-09-26 (владелец): после F5 Студия не возвращала к последней проигранной строке —
// карточка, открытая «Открыть»/из Медиатеки, хранила openMode "open", и восстановление
// не читало text_progress. Плюс выделение строки — по палитре D (тхелет), в обеих темах.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8").replace(/\r\n/g, "\n");
const studio = read("public/index.html");
const core = read("public/css/reader-core.css");
const room = read("public/library.html");

test("F5 restore always resumes, and prefers durable progress over the entry anchor", () => {
  assert.match(studio, /origin: st\.origin \|\| "restore",\n\s+openMode,\n(?:\s+\/\/.*\n)+\s+resume: true,/,
    "restore must resume even for a card opened with openMode \"open\"");
  assert.match(studio, /const preferProgress = !!\(opts && opts\.fromRestore\);\nif \(resumeRowIdx !== null && !preferProgress\)/);
  assert.match(studio, /v3ApplyResumeSelection\(renderToken, Number\(idx\)\);\n\s+\} else if \(resumeRowIdx !== null\) \{\n\s+v3ApplyResumeSelection\(renderToken, resumeRowIdx\);/,
    "the entry anchor remains the fallback when no progress exists");
});

test("row highlight follows palette D in every theme: tehelet rail, no amber", () => {
  for (const [name, src] of [["reader-core.css", core], ["index.html", studio]]) {
    const rails = src.match(/--row-rail-selected:\s*[^;]+;/g) || [];
    assert.ok(rails.length >= 3, name + ": light, system-dark and explicit-dark rails");
    for (const r of rails) assert.match(r, /rgba\((27, 79, 184|127, 166, 245),/, name + ": " + r);
    assert.doesNotMatch(src, /--row-rail-selected:\s*rgba\((255, 180, 0|252, 191, 73)/);
    const playing = src.match(/--row-hl-playing:\s*[^;]+;/g) || [];
    const selected = src.match(/--row-hl-selected:\s*[^;]+;/g) || [];
    assert.ok(playing.length >= 3 && playing.length === selected.length);
    playing.forEach((p, i) => assert.notEqual(p.replace("playing", ""), selected[i].replace("selected", ""),
      name + ": the sounding row is distinguishable from the working row"));
  }
  assert.doesNotMatch(studio, /rgba\(255, 193, 7, 0\.28\)/, "Studio media row is no longer yellow");
  assert.match(room, /tr\.rm-row-current:not\(\.row-error\) td\.rtl \{\n\s+background-color: var\(--row-hl-selected\)/,
    "Room working row uses the D «row» fill; playback deepens it");
});
