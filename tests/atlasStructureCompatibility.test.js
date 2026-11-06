'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { parseHTML } = require('linkedom');
const W = require('../public/js/atlas-words.js'), RM = require('../public/js/reader-morph.js');
const Reader = require('../public/js/atlas-reader.js');
const clone = x => JSON.parse(JSON.stringify(x));
const parent = 'a97001:p178:b001', last = 'a97001:p178:b002';
function fixture() {
  const old = { atlas_id: 'a97001', id: 's-test', content_pack_sha256: 'c'.repeat(64), terms: {}, pages: [{ page: 178,
    items: [{ id: parent, type: 'block', he: 'כוח מסה', he_niqqud: 'כּוֹחַ מַסָּה', ru: 'Сила. Масса.', kind: 'list_item' },
      { id: last, type: 'block', he: 'חומר', he_niqqud: 'חוֹמֶר', ru: 'Материал' }],
    figures: [{ id: 'fig', caption_he: 'כוח', caption_ru: 'Сила', bbox: [0, 0, 200, 100], crop: '/scan.png',
      regions: [{ id: 'region', bbox: [0, 0, 10, 10], label_he: 'כוח', label_ru: 'Сила', links: [parent] }] }],
    tables: [{ id: 'table', title_he: 'מסה', title_ru: 'Масса', cells: [{ row: 0, col: 0, he: 'כוח', he_niqqud: 'כוח', ru: 'Сила' }] }], editor: [] }] };
  const next = clone(old), oldRows = W.sectionItems(old), p = next.pages[0];
  next.structure_revision = 'd'.repeat(64);
  next.occurrence_compatibility = { source_revision: old.content_pack_sha256, rows: oldRows.map((r, i) => ({ id: r.id, order_index: i, he: r.he || '', he_niqqud: r.he_niqqud || '', ru: r.ru || '' })) };
  p.legacy_groups = [{ id: parent, children: [parent + ':s01', parent + ':s02'], original: clone(p.items[0]), source_revision: old.content_pack_sha256, legacy_order_index: 0 }];
  p.items.splice(0, 1, ...[['כוח', 'כּוֹחַ', 'Сила.'], ['מסה', 'מַסָּה', 'Масса.']].map((fields, i) => ({
    id: parent + ':s0' + (i + 1), type: 'block', kind: 'list_item', he: fields[0], he_niqqud: fields[1], ru: fields[2],
    structure: { parent_ref: parent, order: i + 1, depth: i, marker: String(i + 1) + '.', group: 'mechanics', review_status: 'source_reviewed', occurrence_order_index: oldRows.length + i }
  })));
  return { old, next };
}
function render(data) {
  const { document, window } = parseHTML('<html><body><main id="m"></main></body></html>');
  const R = Reader.factory(document), el = R.renderSection((_k, f) => f, data, {});
  document.querySelector('#m').appendChild(el);
  return { document, window, R, el };
}

test('each semantic child stays independent, old refs address a whole visible group and original exact snapshot', () => {
  const { next } = fixture(), before = clone(next), { el } = render(next);
  const nodes = Reader.resolveRefNodes(el, parent);
  assert.equal(nodes.length, 3);
  assert(nodes[0].classList.contains('atlas-legacy-group'));
  assert.deepEqual(nodes.slice(1).map(n => n.getAttribute('data-ref')), next.pages[0].legacy_groups[0].children);
  assert.equal(nodes[0].querySelectorAll('.atlas-row').length, 2);
  const snapshot = nodes[0].querySelector('.atlas-source-snapshot');
  assert.equal(snapshot.querySelector('[data-source-field="he_niqqud"]').textContent, 'כּוֹחַ מַסָּה');
  assert.equal(snapshot.querySelectorAll('[data-col], .atlas-row, [data-wg-row]').length, 0);
  assert.equal(nodes[2].getAttribute('data-depth'), '1');
  assert.equal(nodes[1].querySelector('[data-col="he"]').getAttribute('dir'), 'rtl');
  assert.deepEqual(next, before, 'rendering never mutates source or learner data');
});

test('non-contiguous children keep a group alias and all members without moving unrelated material', () => {
  const { next } = fixture();
  next.pages[0].items.splice(1, 0, { id: 'between', type: 'block', he: 'חומר אחר', ru: 'Другой материал' });
  const { el } = render(next), nodes = Reader.resolveRefNodes(el, parent);
  assert(nodes[0].classList.contains('atlas-legacy-alias'));
  assert.equal(nodes.length, 3);
  assert.equal(nodes[0].querySelectorAll('.atlas-row').length, 0);
  assert.equal(Reader.resolveRefNodes(el, 'between').length, 1);
});

test('missing Russian does not erase Hebrew, pointing or transliteration; editor notes stay separate', () => {
  const { next } = fixture();
  const p = next.pages[0]; delete p.items[0].ru; p.items[0].translit = 'koah'; p.items[0].translit_ru = 'коах';
  p.items.push({ id: 'pointed-only', type: 'block', he_niqqud: 'כּוֹחַ', ru: 'Сила' });
  p.items.push({ id: 'editor', type: 'block', kind: 'editor_note', he: 'כוח', ru: 'Примечание редактора' });
  p.items.push({ id: 'unreviewed', type: 'block', he: 'כוח', ru: 'Проверить', structure: { training_eligible: false } });
  const { el } = render(next), first = Reader.resolveRefNodes(el, p.items[0].id)[0];
  for (const text of ['כוח', 'כּוֹחַ', 'koah', 'коах']) assert(first.textContent.includes(text));
  assert(Reader.resolveRefNodes(el, 'pointed-only')[0].querySelector('.atlas-niqqud-sole'));
  const note = Reader.resolveRefNodes(el, 'editor')[0];
  assert.equal(note.tagName, 'ASIDE'); assert(!note.classList.contains('atlas-row')); assert.equal(note.querySelector('[data-col]'), null);
  const ctx = W.sectionContext('a97001', next, RM);
  for (const id of ['editor', 'unreviewed']) { assert(!ctx.items.has(id)); assert(!W.glossRows(ctx).some(r => r.id === id)); assert.equal(W.occurrence(ctx, id, 0, 'כוח', 'he'), null); }
});

test('duplicate-looking semantic children are not joined, hidden or replaced by matching tables', () => {
  const { next } = fixture();
  const p = next.pages[0]; p.items[1].he = p.items[0].he; p.items[1].ru = p.items[0].ru;
  p.items[0].kind = 'table_note'; p.items[1].kind = 'table_note';
  const { el } = render(next);
  for (const id of p.legacy_groups[0].children) assert(Reader.resolveRefNodes(el, id)[0].classList.contains('atlas-row'));
});

test('untouched block, table and figure occurrences retain exact old order and text identity after split', () => {
  const { old, next } = fixture(), a = W.sectionContext('a97001', old, RM), b = W.sectionContext('a97001', next, RM);
  assert.notEqual(a.textKey, b.textKey, 'current structural edition changes');
  for (const [id, it] of a.items) {
    if (id === parent) continue;
    const surface = RM.tokenize(it.he).filter(t => t.isWord)[0].text;
    const saved = W.occurrence(a, id, 0, surface, 'he');
    assert.deepEqual(W.verifyOccurrence(saved, b), W.verifyOccurrence(saved, a));
    assert.equal(W.occurrence(b, id, 0, surface, 'he').text_key, a.textKey);
    assert.equal(b.order.get(id), a.order.get(id));
  }
  const child = W.occurrence(b, parent + ':s01', 0, 'כוח', 'he');
  assert.equal(child.text_key, b.textKey); assert.equal(child.order_index, a.items.size);
  assert.equal(new Set(b.order.values()).size, b.order.size);
});

test('changed content never reuses legacy source identity even if ids and old ordinals remain', () => {
  const { old, next } = fixture(), a = W.sectionContext('a97001', old, RM);
  const saved = W.occurrence(a, last, 0, 'חומר', 'he');
  for (const field of ['he', 'he_niqqud', 'ru']) {
    const edited = clone(next); edited.pages[0].items[2][field] += ' אחרת';
    const b = W.sectionContext('a97001', edited, RM);
    assert.equal(W.verifyOccurrence(saved, b), null, field);
    assert.notEqual(W.occurrence(b, last, 0, 'חומר', 'he').text_key, saved.text_key, field);
  }
  const forged = { ...saved, sentence_ru: 'Другой текст' };
  assert.equal(W.verifyOccurrence(forged, a), null, 'snapshot mismatch is rejected even in same edition');
});

test('old merged occurrence is inspectable as historical only, never copied into child progress', () => {
  const { old, next } = fixture(), a = W.sectionContext('a97001', old, RM), b = W.sectionContext('a97001', next, RM);
  const saved = W.occurrence(a, parent, 1, 'מסה', 'he'), before = clone(saved);
  assert(!b.items.has(parent)); assert.equal(W.verifyOccurrence(saved, b), null);
  const historical = W.historicalOccurrence(saved, b);
  assert.equal(historical.kind, 'historical_group'); assert.equal(historical.learning_eligible, false);
  assert.equal(historical.original.he, 'כוח מסה'); assert.equal(historical.children.length, 2);
  assert.equal(W.occurrence(b, parent, 1, 'מסה', 'he'), null);
  assert.equal(W.historicalOccurrence({ ...saved, text_key: 'wrong' }, b), null);
  assert.deepEqual(saved, before);
});

test('old occurrence ordinals remain reserved even when an invalid child ordinal attempts reuse', () => {
  const { next } = fixture(); next.pages[0].items[0].structure.occurrence_order_index = 0;
  const ctx = W.sectionContext('a97001', next, RM);
  assert(ctx.order.get(parent + ':s01') >= next.occurrence_compatibility.rows.length);
  assert(!Array.from(ctx.order.values()).includes(0));
  const broken = clone(next); broken.occurrence_compatibility.rows.push(clone(broken.occurrence_compatibility.rows[0]));
  assert.throws(() => W.sectionContext('a97001', broken, RM), /compatibility/);
});

test('deep links and figure links highlight all children, while a direct child link stays independent', async () => {
  const { next } = fixture(), { document, window } = render(next);
  const root = document.createElement('main'); document.body.appendChild(root);
  const mounted = Reader.mount(root, { atlasId: 'a97001', fetchJson: async url => url.endsWith('index.json') ? { atlas_id: 'a97001', sections: [] } : next });
  await mounted.openSection(next.id, 178, { ref: parent });
  const section = root.querySelector('.atlas-section');
  const nodes = Reader.resolveRefNodes(root, parent);
  assert.equal(nodes.length, 3); assert(nodes.every(n => n.classList.contains('atlas-hit')));
  const region = root.querySelector('[data-region]');
  region.dispatchEvent(new window.Event('click', { bubbles: true }));
  assert(nodes.every(n => n.classList.contains('atlas-hl')));
  await mounted.openSection(next.id, 178, { ref: parent + ':s02' });
  assert.equal(root.querySelectorAll('.atlas-hit').length, 1);
  assert.equal(root.querySelector('.atlas-hit').getAttribute('data-ref'), parent + ':s02');
  mounted.destroy(); assert.equal(root.querySelector('.atlas-root'), null);
});

test('unaligned symbol rows remain visible and link to shared source, neither becomes generated learning', async () => {
  const { next } = fixture(), p = next.pages[0], child = p.items[0];
  delete child.he; delete child.he_niqqud; delete child.ru;
  child.structure.symbol = 'RB'; child.structure.training_eligible = false;
  p.items.splice(2, 0, { id: 'shared', type: 'block', kind: 'shared_source_context', he: 'כוח מסה', ru: 'Сила и масса',
    structure: { parent_ref: parent, applies_to: [child.id], training_eligible: false } });
  const { document, window } = render(next), root = document.createElement('main'); document.body.appendChild(root);
  const reader = Reader.mount(root, { atlasId: 'a97001', fetchJson: async () => next });
  await reader.openSection(next.id, 178, {});
  const row = Reader.resolveRefNodes(root, child.id)[0];
  assert(row.textContent.includes('RB')); assert(row.textContent.includes('Требуется выравнивание'));
  const button = row.querySelector('[data-structure-target="shared"]'); assert(button);
  button.dispatchEvent(new window.Event('click', { bubbles: true }));
  const source = Reader.resolveRefNodes(root, 'shared')[0]; assert(source.classList.contains('atlas-hl'));
  assert.equal(source.querySelector('[data-col]'), null);
  const ctx = W.sectionContext('a97001', next, RM);
  assert(!ctx.items.has(child.id)); assert(!ctx.items.has('shared'));
  reader.destroy();
});

test('a structural revision invalidates prepared AI without regenerating or clearing manual corrections', async () => {
  const { window, document } = parseHTML('<html><body></body></html>');
  global.window = window; global.document = document; window.ReaderMorph = RM; window.indexedDB = undefined;
  const aiPath = require.resolve('../public/js/word-gloss-ai.js'); delete require.cache[aiPath]; require(aiPath);
  const AI = window.WordGlossAI, Contract = require('../public/js/atlas-context-contract.js');
  const { old, next } = fixture();
  for (const sec of [old, next]) for (const page of sec.pages) for (const item of page.items) item.he_niqqud = item.he;
  next.occurrence_compatibility.rows.forEach(row => { row.he_niqqud = row.he; });
  const before = W.sectionContext('a97001', old, RM), after = W.sectionContext('a97001', next, RM);
  const oldRows = W.glossRows(before), rows = W.glossRows(after);
  const expected = Contract.describe(oldRows, AI), updated = Contract.describe(rows, AI);
  const revision = await Contract.revision(expected), newRevision = await Contract.revision(updated);
  assert.notEqual(revision, newRevision);
  const layer = { schema: AI.LAYER_SCHEMA, contract: Contract.CONTRACT, atlas: old.atlas_id, section: old.id, source_revision: revision,
    coverage_mode: 'complete', provenance: { kind: 'prepared_ai', producer: 'synthetic-test-only', review_scope: 'test fixture' },
    rows: expected.map(row => ({ row_id: row.id, order_index: row.order_index, key: row.key, model: 'test', glosses: row.words.map(() => ({ gloss: 'слово' })), mwe: [] })) };
  assert.equal(Contract.validate(layer, updated, { atlas: next.atlas_id, section: next.id, revision: newRevision }).ok, false);
  await AI.remember(layer, oldRows);
  const row = document.createElement('div'); row.setAttribute('data-ref', last);
  row.innerHTML = '<div data-col="he">' + RM.wrapCellHtml('חומר', null, {}) + '</div>';
  W.bindGlossRow(row, after);
  assert.equal(AI.wordAt(row, 0), null, 'cached prepared answer is gated until the new revision is accepted');
  await AI.setOccurrenceGloss(row, 0, 'Ручная правка');
  assert.equal(AI.wordAt(row, 0).gloss, 'Ручная правка');
  AI._mem.clear(); delete global.window; delete global.document;
});

test('parent caveats stay visible as group editorial notes and carry provenance in child scientific context', () => {
  const { next } = fixture();
  next.pages[0].legacy_groups[0].original.ambiguity_note = 'Числовые данные требуют сверки.';
  next.pages[0].legacy_groups[0].original.note = 'Примечание относится ко всей группе.';
  const { el } = render(next), group = Reader.resolveRefNodes(el, parent)[0];
  const note = group.querySelector('.atlas-group-note'); assert(note); assert(note.textContent.includes('Числовые данные'));
  assert.equal(note.querySelector('.atlas-row, [data-col]'), null);
  const ctx = W.sectionContext('a97001', next, RM), child = ctx.items.get(parent + ':s01');
  assert.equal(child.source_context.group_notes.ref, parent);
  assert(child.source_context.scientific_notes.includes('Примечание относится ко всей группе.'));
});

test('an extraction punctuation repair cannot append text to a structured predecessor', () => {
  const { next } = fixture(), p = next.pages[0];
  p.items[1].he = 'מסה ('; p.items[1].ru = 'Масса (';
  p.items.splice(2, 0, { id: 'punctuation', type: 'block', he: ')', ru: ')' });
  const { el } = render(next), node = Reader.resolveRefNodes(el, p.items[1].id)[0];
  assert.equal(node.querySelector('[data-col="he"]').textContent, 'מסה (');
  assert.equal(node.querySelector('.atlas-ru').textContent, 'Масса (');
});

function mixedMarksPage(pageNumber, figures) {
  const ref = 'a97001:p' + pageNumber + ':b001';
  const items = ['advantages', 'advantages', 'limitations', 'limitations'].map((group, i) => ({
    id: ref + ':s0' + (i + 1), type: 'block', kind: 'prose', y: 100 + i * 20,
    he: 'כוח ' + (i + 1), ru: 'Строка ' + (i + 1),
    structure: { parent_ref: ref, marker: '•', group: 'a97001:p' + pageNumber + ':' + group, order: i }
  }));
  return { page: pageNumber, items, figures: figures || [] };
}
function marginMark(id, kind, y) {
  return { id, number: null, bbox: [500, y, 530, y + 25],
    caption_he: kind === 'pro' ? 'יתרונות' : 'חסרונות', caption_ru: kind === 'pro' ? 'Преимущества' : 'Недостатки' };
}

test('p130/p135 explicit advantages and limitations stay separate without pictograms and with prose kinds', () => {
  for (const pageNumber of [130, 135]) {
    const page = mixedMarksPage(pageNumber), { R } = render({ pages: [] });
    const before = clone(page), layout = R.layoutPage(page);
    assert.deepEqual(Object.keys(layout.groups), ['0', '2']);
    assert.equal(layout.groups[0].kind, 'pro'); assert.equal(layout.groups[0].end, 1);
    assert.equal(layout.groups[2].kind, 'con'); assert.equal(layout.groups[2].end, 3);
    const el = R.renderPage((_k, f) => f, page, {}), groups = el.querySelectorAll('.atlas-mark-group');
    assert.equal(groups.length, 2);
    assert.deepEqual(Array.from(groups).map(g => [g.getAttribute('data-mark'), g.querySelectorAll('.atlas-row').length]), [['pro', 2], ['con', 2]]);
    assert(!el.querySelector('[data-mark="mixed"]'));
    assert.deepEqual(page, before);
  }
});

test('p130/p135 source group wins over swapped and duplicate margin signs, including a sign in the middle', () => {
  for (const pageNumber of [130, 135]) {
    const page = mixedMarksPage(pageNumber, [marginMark('wrong-con', 'con', 100), marginMark('duplicate-pro', 'pro', 120), marginMark('wrong-pro', 'pro', 140), marginMark('duplicate-con', 'con', 160)]);
    const { R } = render({ pages: [] }), layout = R.layoutPage(page);
    assert.deepEqual(Object.keys(layout.groups), ['0', '2']);
    assert.deepEqual([layout.groups[0].kind, layout.groups[0].end, layout.groups[2].kind, layout.groups[2].end], ['pro', 1, 'con', 3]);
    assert.deepEqual(layout.groups[0].marks, [{ kind: 'pro' }]);
    assert.deepEqual(layout.groups[2].marks, [{ kind: 'con' }]);
  }
});

test('geometric list grouping stops at explicit group boundaries; unrelated or unknown groups stay unassigned', () => {
  const page = mixedMarksPage(135, [marginMark('legacy-pro', 'pro', 80)]);
  page.items.forEach(it => { it.kind = 'list_item'; });
  page.items.unshift({ id: 'legacy-list', type: 'block', kind: 'list_item', y: 80, he: 'חומר', ru: 'Материал' });
  page.items.splice(3, 0, { id: 'interruption', type: 'block', kind: 'list_item', y: 130, he: 'תוכן אחר', ru: 'Другой текст' });
  page.items.push({ id: 'unknown-suffix', type: 'block', kind: 'list_item', y: 190, he: 'מסה', ru: 'Масса', structure: { group: 'other:advantages-extra' } });
  const { R } = render({ pages: [] }), layout = R.layoutPage(page);
  assert.deepEqual(Object.keys(layout.groups), ['0', '1', '4']);
  assert.deepEqual(Object.values(layout.groups).map(g => [g.kind, g.end]), [['pro', 0], ['pro', 2], ['con', 5]]);
  const el = R.renderPage((_k, f) => f, page, {});
  for (const id of ['interruption', 'unknown-suffix']) assert.equal(Reader.resolveRefNodes(el, id)[0].closest('.atlas-mark-group'), null);
});

function localeLabels(lang) {
  const fs = require('node:fs'), vm = require('node:vm'), sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/i18n/locales/' + lang + '.js'), 'utf8'), sandbox);
  const values = sandbox.window.I18N_LOCALES[lang];
  return { values, T: (key, fallback) => key.split('.').reduce((obj, part) => obj && obj[part], values) || fallback };
}
// This checks the shipped layer selectors against the DOM, not pixel visibility.
function hiddenByReadingLayer(node) {
  const fs = require('node:fs'), css = fs.readFileSync(require.resolve('../public/css/atlas-reader.css'), 'utf8');
  const layers = css.slice(css.indexOf('/* columns (the Room'), css.indexOf('/* a bilingual book:')).replace(/\/\*[\s\S]*?\*\//g, '');
  const hidden = Array.from(layers.matchAll(/([^{}]+)\{([^{}]*)\}/g)).filter(m => /display:\s*none\s*;/.test(m[2])).flatMap(m => m[1].split(',').map(s => s.trim()));
  for (let at = node; at && at.matches; at = at.parentElement) if (hidden.some(selector => at.matches(selector))) return true;
  return false;
}

test('held groups show localized status and a concrete reason without original notes; exact review notes are safe details', () => {
  const { next } = fixture(), group = next.pages[0].legacy_groups[0], oldRef = group.id;
  group.id = 'a97001:p128:b004'; group.review_status = 'needs_review';
  group.review_notes = ['The source combines the definitions.', '<img src=x onerror="evil()"> & exact audit note', 'The source combines the definitions.'];
  delete group.original.ambiguity_note; delete group.original.note;
  next.pages[0].items.filter(it => it.structure?.parent_ref === oldRef).forEach(it => { it.structure.parent_ref = group.id; });
  for (const lang of ['ru', 'en', 'he']) {
    const { T, values } = localeLabels(lang), { document } = parseHTML('<html><body><main class="atlas-root"></main></body></html>');
    const el = Reader.factory(document).renderSection(T, next, {}); document.querySelector('main').appendChild(el);
    const hold = Reader.resolveRefNodes(el, group.id)[0].querySelector('.atlas-review-hold'), reason = hold.querySelector('.atlas-hold-reason');
    assert.equal(hold.querySelector('strong').textContent, values.atlas.structure.learningHeld);
    assert.equal(reason.textContent, values.atlas.structure.holdReason.diameters);
    assert(!reason.closest('details, [hidden]')); assert(!hold.closest('details, [hidden]'));
    assert.equal(hold.querySelectorAll('.atlas-review-details li').length, 2);
    assert(hold.querySelector('.atlas-review-details').textContent.includes(group.review_notes[1]));
    assert.equal(hold.querySelector('img, script, [data-col], [data-wg-row], .atlas-row'), null);
    assert(!reason.textContent.includes('exact audit note'));
    for (let mask = 0; mask < 16; mask++) {
      Reader.applyLayers(el, { he: !!(mask & 1), niqqud: !!(mask & 2), translit: !!(mask & 4), ru: !!(mask & 8), script: 'cyr' });
      assert(!hiddenByReadingLayer(reason), lang + ' hold is not a hidden language layer');
    }
  }
});

test('original caveats and review notes are deduplicated without losing either source', () => {
  const { next } = fixture(), group = next.pages[0].legacy_groups[0];
  group.review_status = 'needs_review'; group.original.ambiguity_note = 'Общее предупреждение'; group.original.note = 'Общее предупреждение';
  group.review_notes = ['Общее предупреждение', 'Точная причина проверки', 'Точная причина проверки'];
  const { el } = render(next), hold = Reader.resolveRefNodes(el, parent)[0].querySelector('.atlas-group-note');
  assert.equal(hold.querySelectorAll('.atlas-original-caveat').length, 1);
  assert.equal(hold.querySelectorAll('.atlas-review-details li').length, 1);
  assert.equal(hold.textContent.split('Общее предупреждение').length - 1, 1);
  assert.equal(hold.textContent.split('Точная причина проверки').length - 1, 1);
});

test('a standalone held concept has a visible safe reason, not only a collapsed editor note', () => {
  const { next } = fixture(), page = next.pages[0], reason = 'Название и определение противоречат друг другу. <script>evil()</script>';
  page.items.push({ id: 'held-concept', type: 'block', he: 'מונח', ru: 'Термин', training_eligible: false, concept_review_note: reason });
  page.editor.push({ about: 'block', ref: 'held-concept', text: 'Термин требует редакторской проверки: ' + reason });
  const { el } = render(next), row = Reader.resolveRefNodes(el, 'held-concept')[0], hold = row.querySelector('.atlas-concept-hold');
  assert(hold); assert.equal(hold.querySelector('.atlas-hold-reason').textContent, reason);
  assert(!hold.closest('details, [hidden]')); assert.equal(hold.querySelector('script, [data-col], [data-wg-row]'), null);
  assert.equal(el.textContent.split(reason).length - 1, 1, 'the generated editor-note copy is not repeated');
  assert(!W.sectionContext('a97001', next, RM).items.has('held-concept'));
});

test('editorial source language fields follow column controls while the review notice remains visible', () => {
  const { next } = fixture();
  next.pages[0].items.push({ id: 'editor-layers', kind: 'editor_note', he: 'כוח', he_niqqud: 'כּוֹחַ', ru: 'Сила', translit: 'koah',
    training_eligible: false, concept_review_note: 'Нужно проверить формулировку.' });
  const { el, document } = render(next); document.querySelector('#m').className = 'atlas-root';
  const row = Reader.resolveRefNodes(el, 'editor-layers')[0];
  Reader.applyLayers(el, { he: false, niqqud: true, ru: false, translit: false, script: 'lat' });
  assert(hiddenByReadingLayer(row.querySelector('.atlas-ru')));
  assert(hiddenByReadingLayer(row.querySelector('.atlas-he:not(.atlas-niqqud)')));
  assert(hiddenByReadingLayer(row.querySelector('.atlas-translit')));
  assert(!hiddenByReadingLayer(row.querySelector('.atlas-niqqud')));
  assert(!hiddenByReadingLayer(row.querySelector('.atlas-hold-reason')));
  Reader.applyLayers(el, { he: true, niqqud: false, ru: true, translit: true, script: 'lat' });
  assert(!hiddenByReadingLayer(row.querySelector('.atlas-ru')));
  assert(!hiddenByReadingLayer(row.querySelector('.atlas-he:not(.atlas-niqqud)')));
  assert(hiddenByReadingLayer(row.querySelector('.atlas-niqqud')));
  assert(!hiddenByReadingLayer(row.querySelector('.atlas-hold-reason')));
});
