'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../public/js/course-hebrew.js');

test('stripMarks drops niqqud and bidi marks; maqaf becomes space', () => {
  assert.equal(H.stripMarks('\u202Bבְּבַקָּשָׁה\u200F'), 'בבקשה');
  assert.equal(H.stripMarks('בֵּית־סֵפֶר'), 'בית ספר');
  assert.equal(H.stripMarks('\u200B\u200C\u200D\u200E\u200F\u202A\u202B\u202C\u202D\u202E\u2066\u2067\u2068\u2069\uFEFF'), '');
});
test('tokens preserves foreign input and drops punctuation', () => {
  assert.deepEqual(H.tokens('  אֶפְשָׁר תֵּה,  בְּבַקָּשָׁה?! '), ['אפשר', 'תה', 'בבקשה']);
  assert.deepEqual(H.tokens('тэ бли сукар'), ['тэ', 'бли', 'сукар']);
  assert.deepEqual(H.tokens('tea 123'), ['tea', '123']);
  assert.deepEqual(H.tokens('אפשר\u200F תֵה־בלי סוכר ,, בבקשה'), ['אפשר', 'תה', 'בלי', 'סוכר', 'בבקשה']);
});
test('formKeys covers defective and full spelling without deriving plain', () => {
  assert.deepEqual(H.formKeys({ niqqud: 'סֻכָּר', plain: 'סוכר' }).sort(), ['סוכר', 'סכר']);
  assert.deepEqual(H.formKeys({ niqqud: 'בְּבַקָּשָׁה', plain: 'בבקשה' }), ['בבקשה']);
});
test('pairConsistent accepts matres-only differences and rejects typos', () => {
  for (const [niqqud, plain] of [['שֻׁלְחָן', 'שולחן'], ['לִכְתֹּב', 'לכתוב'], ['מִכְנָסַיִם', 'מכנסיים'], ['כַּוָּנָה', 'כוונה']]) {
    assert.equal(H.pairConsistent({ niqqud, plain }), true, plain);
  }
  assert.equal(H.pairConsistent({ niqqud: 'סֻכָּר', plain: 'סוגר' }), false);
});
