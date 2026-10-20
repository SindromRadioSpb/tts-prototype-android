'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../public/js/learning-field-provenance');

test('source is per field, never inferred from vowels or translation provider', () => {
  assert.equal(P.field({ he_niqqud: 'שָׁאוּל', translation_provider: 'Dicta' }, 'he_niqqud').authority, 'unknown');
  const row = { edit_meta_json: JSON.stringify({ _studio_material: { imported: true, field_meta: {
    he_niqqud: { authority: 'provider', provider: 'OpenAI assistant', status: 'current' },
    ru: { authority: 'provider', provider: 'Other' }
  } } }) };
  assert.match(P.label(row, 'he_niqqud'), /OpenAI assistant.*архиве/);
  assert.equal(P.field(row, 'ru').source, 'Other');
  assert.equal(P.field(row, 'translit').authority, 'unknown');
});

test('manual and unknown do not become Dicta; malformed or invalidated metadata stays honest', () => {
  assert.match(P.label({ field_meta: { he_niqqud: { authority: 'user' } } }, 'he_niqqud'), /ручная/);
  assert.match(P.label({ edit_meta_json: '{broken' }, 'he_niqqud'), /неизвестен/);
  assert.match(P.label({ field_meta: { he_niqqud: { provider: 'Dicta', status: 'invalidated' } } }, 'he_niqqud'), /перепроверки/);
  assert.equal(P.field({ meta_json: { niqqud_derived: { value: 'שָׁאוּל', provider: 'Dicta' } }, he_niqqud: 'אַחֵר' }, 'he_niqqud').authority, 'unknown');
  const edited={edit_meta_json:{edited:{he_niqqud:true},_studio_material:{field_meta:{he_niqqud:{authority:'provider',provider:'OpenAI assistant'}}}}};
  assert.match(P.label(edited,'he_niqqud'),/ручная/,'a legacy manual edit takes precedence over old provider attribution');
});

test('legacy restoration adds only missing value-matched metadata and preserves manual edits', () => {
  const source={hebrew_niqqud:'שָׁאוּל',russian:'Шауль',edit_meta:{_studio_material:{field_meta:{
    he_niqqud:{provider:'OpenAI assistant',authority:'provider'},ru:{provider:'Other',authority:'provider'}
  }}}};
  const local={he_niqqud:'שָׁאוּל',ru:'Шауль',edit_meta_json:JSON.stringify({edited:{ru:true},private_note:'keep'})};
  const next=P.mergeImported(local,source);
  assert.equal(next.private_note,'keep');
  assert.equal(next._studio_material.field_meta.he_niqqud.provider,'OpenAI assistant');
  assert.equal(next._studio_material.field_meta.ru,undefined);
  assert.equal(P.mergeImported({...local,he_niqqud:'אַחֵר'},source),null);
  assert.equal(P.mergeImported({...local,edit_meta_json:JSON.stringify(next)},source),null,'idempotent');
});
