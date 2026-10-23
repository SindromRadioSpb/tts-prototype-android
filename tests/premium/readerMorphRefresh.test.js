"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { parseHTML } = require("linkedom");

const source = fs.readFileSync(path.resolve(__dirname, "../../public/js/reader-morph.js"), "utf8");

function fixture() {
  const { window, document } = parseHTML('<html><body><div id="mount"><table id="proTable">' +
    '<tbody id="first"><tr data-row-idx="0"><td data-col="he">שלום עולם</td><td data-col="niqqud">שָׁלוֹם עוֹלָם</td></tr></tbody>' +
    '<tbody id="second"><tr data-row-idx="1"><td data-col="he">ספר טוב</td><td data-col="niqqud">סֵפֶר טוֹב</td></tr></tbody>' +
    '</table></div><div id="outside"><table><tbody><tr data-row-idx="0"><td data-col="he">שלום עולם</td></tr></tbody></table></div></body></html>');
  const context = vm.createContext({ window, document, setTimeout, clearTimeout });
  vm.runInContext(source, context);
  const rows = [{ he: "שלום עולם", he_niqqud: "שָׁלוֹם עוֹלָם" }, { he: "ספר טוב", he_niqqud: "סֵפֶר טוֹב" }];
  return { R: window.ReaderMorph, window, document, mount: document.getElementById("mount"), opts: { getRow: i => rows[i] } };
}

test("deferred morphology hydrates only the requested row group and preserves wrapped words", () => {
  const f = fixture();
  const handle = f.R.attach(f.mount, { ...f.opts, deferWrap: true });
  const first = f.document.getElementById("first"), second = f.document.getElementById("second");
  assert.equal(f.mount.querySelectorAll(".rm-w").length, 0);
  const originalText = first.textContent;
  handle.refresh(first);
  assert.equal(first.querySelectorAll(".rm-w").length, 4);
  assert.equal(second.querySelectorAll(".rm-w").length, 0);
  assert.equal(first.textContent, originalText);
  const word = first.querySelector(".rm-w");
  word.classList.add("rm-w-active");
  handle.refresh(first);
  assert.equal(first.querySelector(".rm-w"), word);
  assert.ok(word.classList.contains("rm-w-active"));
  handle.refresh(second);
  assert.equal(second.querySelectorAll(".rm-w").length, 4);
  assert.equal(first.querySelector(".rm-w"), word);
  handle.detach();
});

test("default attachment still wraps all rows; detached or foreign scopes cannot be hydrated", () => {
  const f = fixture();
  const eager = f.R.attach(f.mount, f.opts);
  assert.equal(f.mount.querySelectorAll(".rm-w").length, 8);
  eager.detach();

  const g = fixture();
  const lazy = g.R.attach(g.mount, { ...g.opts, deferWrap: true, cellSelector: 'td[data-col="he"]' });
  lazy.refresh(g.document.getElementById("outside"));
  assert.equal(g.document.querySelectorAll(".rm-w").length, 0);
  const removed = g.document.getElementById("second");
  removed.remove();
  lazy.refresh(removed);
  assert.equal(removed.querySelectorAll(".rm-w").length, 0);
  lazy.detach();
  lazy.refresh();
  lazy.refresh(g.document.getElementById("first"));
  assert.equal(g.mount.querySelectorAll(".rm-w").length, 0);
  lazy.detach();
});

test("late row hydration preserves media replay identity, its listener and NBSP even on empty text", () => {
  for (const empty of [false, true]) {
    const f = fixture();
    const row = f.document.querySelector('tr[data-row-idx="1"]');
    const cell = row.querySelector('td[data-col="niqqud"]');
    if (empty) cell.textContent = '';
    const originalText = cell.textContent;
    const glue = f.document.createTextNode('\u00a0');
    const replay = f.document.createElement('button');
    replay.className = 'smk-row-replay'; replay.textContent = '▶︎';
    let plays = 0;
    replay.addEventListener('click', () => { plays++; });
    const getRow = i => empty && i === 1 ? { he: '', he_niqqud: '' } : f.opts.getRow(i);
    const handle = f.R.attach(f.mount, { getRow, deferWrap: true });
    cell.append(glue, replay); // MediaHost wins the race with background hydration.
    handle.refresh(row);
    assert.equal(cell.textContent, originalText + '\u00a0▶︎');
    assert.equal(cell.querySelector('.smk-row-replay'), replay);
    assert.equal(replay.previousSibling, glue);
    replay.click();
    assert.equal(plays, 1);
    handle.refresh(row);
    assert.equal(cell.textContent, originalText + '\u00a0▶︎');
    assert.equal(replay.previousSibling, glue);
    handle.detach();
  }
});

test("clearing colours preserves a contextual tooltip that replaced the old due tooltip", async () => {
  const f = fixture();
  const handle = f.R.attach(f.mount, f.opts);
  const words = Array.from(f.mount.querySelectorAll('.rm-w'));
  words.forEach(word => { word.classList.add('rm-w-due'); word.setAttribute('data-rm-due-tip', '1'); });
  words[0].setAttribute('title', 'сочетание: в контексте');
  words[0].setAttribute('data-gloss', 'готовый перевод');
  words[1].setAttribute('title', 'К повторению — тапни и вспомни перевод');
  await f.R.decorateWords(f.mount, {}, { color: false, fadeMode: 'full' });
  assert.equal(words[0].getAttribute('title'), 'сочетание: в контексте');
  assert.equal(words[0].getAttribute('data-gloss'), 'готовый перевод');
  assert.equal(words[1].getAttribute('title'), null);
  assert.equal(words[0].hasAttribute('data-rm-due-tip'), false);
  handle.detach();
});

test("large repeated occurrence batches load each sentence once in source order and retain cache semantics", async () => {
  const f = fixture(), calls = [];
  f.R.setPlaceLoader(async ids => { calls.push(Array.from(ids)); return new Map(); });
  const ids = Array.from({ length: 2500 }, (_, i) => "sentence-" + i);
  const occurrences = ids.flatMap(id => Array(24).fill(id));
  await f.R.ensurePlaces(occurrences);
  assert.deepEqual(calls, [ids]);
  await f.R.ensurePlaces(occurrences);
  assert.equal(calls.length, 1, "cached missing parses do not trigger repeated reads");
  f.R.invalidatePlaces("sentence-1729");
  await f.R.ensurePlaces(occurrences);
  assert.deepEqual(calls[1], ["sentence-1729"]);
  await f.R.ensurePlaces(["", null, 7, "7", "__proto__", "__proto__"]);
  assert.deepEqual(calls[2], ["7", "__proto__"]);
});

test("a cancelled word resolution cannot clear newer decorations or replace their due statistics", async () => {
  for (const rejectResolution of [false, true]) {
    const f = fixture();
    let release, reject, started;
    const pending = new Promise((resolve, fail) => { release = resolve; reject = fail; });
    const resolving = new Promise(resolve => { started = resolve; });
    let holdFirst = true;
    f.window.InflectionDict = { ensureReady: async () => ({ paradigms: [], index: {} }) };
    f.window.NotesAutoGen = {
      buildResolverMaps: () => ({ cell: new Map() }),
      pickBaseParadigm: () => {
        if (!holdFirst) return null;
        holdFirst = false; started(); return pending;
      },
      resolveContentUnit: () => ({ channel: "form-first", pealim_id: "1", meaning: "fixture", status: "ok", confidence: 1 }),
      lemmaKey: () => "pid:1",
    };
    const handle = f.R.attach(f.mount, f.opts);
    const scope = f.document.getElementById("first");
    scope.querySelectorAll(".rm-w").forEach(word => word.classList.add("rm-w-known"));
    const initial = scope.innerHTML;
    let current = true;
    const stale = f.R.decorateWords(scope, { "pid:1": "known" }, {
      color: true, dueSet: new Set(["pid:1"]), isCurrent: () => current,
    });
    await resolving;
    assert.equal(scope.innerHTML, initial, "pending resolution must not erase the visible status");
    current = false;
    await f.R.decorateWords(scope, { "pid:1": "l1" }, { color: true, dueSet: new Set() });
    assert.equal(scope.querySelectorAll(".rm-w-l1").length, 4);
    const painted = scope.innerHTML, stats = f.R.dueMarkStats();
    assert.equal(stats.marked, 0);
    assert.ok(stats.at > 0);
    if (rejectResolution) reject(new Error("cancelled resolver")); else release(null);
    await stale;
    assert.equal(scope.innerHTML, painted);
    assert.deepEqual(f.R.dueMarkStats(), stats);
    await f.R.decorateWords(scope, {}, { color: false, isCurrent: () => false });
    assert.equal(scope.innerHTML, painted, "cancelled clear-only passes also preserve the current display");
    handle.detach();
  }
});

test('unchanged learner colours do not rewrite word classes, while a real status change still updates every word', async () => {
  const f = fixture();
  f.window.InflectionDict = { ensureReady: async () => ({ paradigms: [], index: {} }) };
  f.window.NotesAutoGen = { buildResolverMaps: () => ({ cell: new Map() }), pickBaseParadigm: () => null,
    resolveContentUnit: () => ({ channel: 'form-first', pealim_id: '1', meaning: 'fixture', status: 'ok', confidence: 1 }), lemmaKey: () => 'pid:1' };
  const handle = f.R.attach(f.mount, f.opts), scope = f.document.getElementById('first');
  await f.R.decorateWords(scope, { 'pid:1': 'known' }, { color: true });
  let changes = 0;
  const observer = new f.window.MutationObserver(entries => { changes += entries.filter(e => e.target.classList.contains('rm-w')).length; });
  observer.observe(scope, { subtree: true, attributes: true, attributeFilter: ['class'] });
  await f.R.decorateWords(scope, { 'pid:1': 'known' }, { color: true });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(changes, 0); assert.equal(scope.querySelectorAll('.rm-w-known').length, 4);
  await f.R.decorateWords(scope, { 'pid:1': 'l2' }, { color: true });
  assert.equal(scope.querySelectorAll('.rm-w-known').length, 0); assert.equal(scope.querySelectorAll('.rm-w-l2').length, 4);
  observer.disconnect(); handle.detach();
});
