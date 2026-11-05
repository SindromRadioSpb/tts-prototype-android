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
for (const name of fs.readdirSync(__dirname).filter(n => n.endsWith('.author.json')).sort()) {
  const authored = JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8'));
  const blocks = authored.rows.map(row => {
    let [suffix, he_niqqud, ru] = row;
    if (row.length === 2 && he_niqqud.reuse) {
      const previous = authoredRows.get(he_niqqud.reuse);
      if (!previous) throw new Error(`Missing authored reuse: ${he_niqqud.reuse}`);
      [, he_niqqud, ru] = previous;
    }
    authoredRows.set(suffix, [suffix, he_niqqud, ru]);
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
