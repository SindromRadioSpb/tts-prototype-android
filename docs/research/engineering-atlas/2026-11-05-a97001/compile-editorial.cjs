'use strict';
// Offline derived layers. Authored niqqud/translation remain the editable source.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../../..');
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'public/js/local-translit-bundle.js'), 'utf8'), context);
const engine = context.LocalTranslit;
const authoredRows = new Map();
const files = fs.readdirSync(__dirname).filter(n => n.endsWith('.author.json')).sort();
for (const name of files) {
  for (const row of JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8')).rows) {
    if (authoredRows.has(row[0])) throw new Error(`Duplicate authored row: ${row[0]}`);
    authoredRows.set(row[0], row);
  }
}
function resolve(id, visited = new Set()) {
  if (visited.has(id)) throw new Error(`Cyclic reuse: ${id}`);
  visited.add(id);
  const row = authoredRows.get(id);
  if (!row) throw new Error(`Missing authored reuse: ${id}`);
  return row.length === 2 && row[1].reuse ? resolve(row[1].reuse, visited) : row;
}
for (const name of files) {
  const authored = JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8'));
  const blocks = authored.rows.map(row => {
    let [suffix, he_niqqud, ru] = row;
    if (row.length === 2 && he_niqqud.reuse) {
      const previous = resolve(he_niqqud.reuse);
      [, he_niqqud, ru] = previous;
    }
    const item = {
      id: `a97001:${suffix}`,
      he: he_niqqud.replace(/[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/g, ''),
      he_niqqud,
      ru,
      translit: engine.transliterateWithProfile(he_niqqud, 'learner-latin'),
      translit_ru: engine.transliterateWithProfile(he_niqqud, 'ru-phonetic')
    };
    if (authored.notes?.[suffix]) item.editor_note_ru = authored.notes[suffix];
    if (!item.translit || !item.translit_ru) throw new Error(`Empty transliteration: ${item.id}`);
    return item;
  });
  const {rows, notes, ...meta} = authored;
  const output = {...meta, status: 'editorial_draft_source_visually_checked_not_owner_reviewed',
    transliteration_profiles: engine.TRANSLIT_PROFILE_VERSIONS, blocks};
  fs.writeFileSync(path.join(__dirname, name.replace('.author.json', '.json')), JSON.stringify(output, null, 2) + '\n');
  console.log(`${name}: ${blocks.length} blocks`);
}
