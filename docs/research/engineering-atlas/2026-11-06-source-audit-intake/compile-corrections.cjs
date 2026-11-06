'use strict';
// Derive pronunciation and MathML from reviewed correction fields, never from audit guesses.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../../../..');
const file = path.join(root, 'scripts/atlas/corrections/a97001.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
// Keep one final reviewed set per object, including the union of its observation IDs.
const merged = new Map();
data.structure = data.structure.filter(op => {
  if (!op.audit_ids || op.op !== 'set') return true;
  const key = JSON.stringify([op.section, op.page, op.collection || 'items', op.id]);
  const previous = merged.get(key);
  if (!previous) { merged.set(key, op); return true; }
  Object.assign(previous.fields, op.fields);
  previous.audit_ids = [...new Set([...previous.audit_ids, ...op.audit_ids])];
  return false;
});
const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'public/js/local-translit-bundle.js'), 'utf8'), context);
const katex = require('katex');
for (const op of data.structure) {
  if (!op.audit_ids) continue;
  for (const fields of [op.fields, ...(op.with || [])].filter(Boolean)) {
    if (fields.he_niqqud) {
      fields.he = fields.he_niqqud.replace(/[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/g, '');
      fields.translit = context.LocalTranslit.transliterateWithProfile(fields.he_niqqud, 'learner-latin');
      fields.translit_ru = context.LocalTranslit.transliterateWithProfile(fields.he_niqqud, 'ru-phonetic');
    }
    if (fields.latex) {
      const html = katex.renderToString(fields.latex, {output: 'mathml', displayMode: true, throwOnError: true, strict: 'ignore'});
      fields.mathml = html.slice(html.indexOf('<math'), html.lastIndexOf('</math>') + 7);
      fields.math_error = null;
    }
  }
}
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log('Compiled reviewed source-audit correction fields.');
