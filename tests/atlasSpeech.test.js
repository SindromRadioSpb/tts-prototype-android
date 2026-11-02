// AtlasSpeech: the Hebrew text of the atlas recordings (plan P3 §4.2–4.3, V1).
// The expected strings were read and checked by hand against the book's notation; a change here is a change of what
// the voice says and needs the owner's Hebrew review (D4) before a bake.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const Speech = require('../public/js/atlas-speech.js');
const lexicon = require('../atlas/a97002/speech-lexicon.json');

function formula(latex, vars) { return { id: 'a97002:p1:f01', type: 'formula', latex, vars: vars || [] }; }

const GOLD = [ [ "C=\\frac{F}{f}", "סִי שָׁוֶה אֶף גְּדוֹלָה חֶלְקֵי אֶף קְטַנָּה." ], [ "\\sin\\alpha=\\frac{a}{c}", "סִינוּס אַלְפָא שָׁוֶה אֵיי חֶלְקֵי סִי." ], [ "d_S=\\sqrt{\\frac{F_t}{(\\pi/4)[\\tau_S]n_{\\text{גזירה}}}}", "דִּי אֶס שָׁוֶה שֹׁרֶשׁ שֶׁל שֶׁבֶר, בַּמּוֹנֶה אֶף טִי, בַּמְּכַנֶּה פַּאי חֶלְקֵי 4 כָּפוּל טָאוּ אֶס מֻתָּר כָּפוּל אֶן גְּזִירָה." ], [ "d=10\\ \\mathrm{mm}", "דִּי שָׁוֶה 10 מִילִימֶטֶר." ], [ "[\\sigma_{lc}]=1.8\\frac{\\sigma_y}{S}", "סִיגְמָה אֶל סִי מֻתָּר שָׁוֶה 1.8 כָּפוּל סִיגְמָה וַאי חֶלְקֵי אֶס." ], [ "\\sigma_e=\\frac{4Q}{\\pi d_1^2}\\sqrt{1+3\\left[2\\frac{d_2}{d_1}\\tan(\\gamma+\\varphi^\\prime)\\right]^2}", "סִיגְמָה אִי שָׁוֶה שֶׁבֶר, בַּמּוֹנֶה 4 קְיוּ, בַּמְּכַנֶּה פַּאי כָּפוּל דִּי 1 בְּרִבּוּעַ סוֹף הַשֶּׁבֶר, כָּפוּל שֹׁרֶשׁ שֶׁל 1 וְעוֹד 3 כָּפוּל סוֹגְרַיִם, 2 כָּפוּל דִּי 2 חֶלְקֵי דִּי 1 כָּפוּל טַנְגֶּנְס סוֹגְרַיִם, גַּמָּה וְעוֹד פִי תָּג סוֹף סוֹגְרַיִם, בְּרִבּוּעַ." ], [ "\\varphi^\\prime=\\operatorname{Shift\\ tan}\\left(\\frac{\\mu}{\\cos30^\\circ}\\right)=7.9^\\circ", "פִי תָּג שָׁוֶה שִׁיפְט טַנְגֶּנְס סוֹגְרַיִם, שֶׁבֶר, בַּמּוֹנֶה מְיוּ, בַּמְּכַנֶּה קוֹסִינוּס 30 מַעֲלוֹת שָׁוֶה 7.9 מַעֲלוֹת." ], [ "r_i=\\sqrt{(b/2)^2+(h/2)^2}", "אָר אַיי שָׁוֶה שֹׁרֶשׁ שֶׁל סוֹגְרַיִם, בִּי חֶלְקֵי 2 סוֹף סוֹגְרַיִם, בְּרִבּוּעַ וְעוֹד סוֹגְרַיִם, אֵייץ' חֶלְקֵי 2 סוֹף סוֹגְרַיִם, בְּרִבּוּעַ." ], [ "C_{tot}=C_1+C_2+\\cdots+C_n", "סִי טוֹטָאל שָׁוֶה סִי 1 וְעוֹד סִי 2 וְעוֹד וְכָךְ הָלְאָה וְעוֹד סִי אֶן." ], [ "H=\\frac{M_t\\,n_{rot}}{9550000}", "אֵייץ' שָׁוֶה שֶׁבֶר, בַּמּוֹנֶה אֶם טִי כָּפוּל אֶן רוֹט, בַּמְּכַנֶּה 9550000." ], [ "i_{tot}=\\frac{n_{out}}{n_{in}}=\\frac{15}{3000}=\\frac1{200}", "אַיי טוֹטָאל שָׁוֶה אֶן אָאוּט חֶלְקֵי אֶן אִין שָׁוֶה 15 חֶלְקֵי 3000 שָׁוֶה 1 חֶלְקֵי 200." ], [ "\\alpha_{rad}=\\alpha\\frac\\pi{180}", "אַלְפָא רַדְיָאנִים שָׁוֶה אַלְפָא כָּפוּל פַּאי חֶלְקֵי 180." ], [ "k_\\varepsilon=0.9\\left[1.88-3.2\\left(\\frac1{Z_{in}}\\pm\\frac1{Z_{out}}\\right)\\right]", "קֵיי אֶפְּסִילוֹן שָׁוֶה 0.9 כָּפוּל סוֹגְרַיִם, 1.88 פָּחוֹת 3.2 כָּפוּל סוֹגְרַיִם, 1 חֶלְקֵי זֶד אִין פְּלוּס מִינוּס 1 חֶלְקֵי זֶד אָאוּט." ], [ "D=\\sqrt[3]{114.6\\cdot10^6\\frac{Hf\\sin\\alpha}{n_{rot}\\mu\\pi[p]}+d^3}", "דִּי גְּדוֹלָה שָׁוֶה שֹׁרֶשׁ שְׁלִישִׁי שֶׁל 114.6 כָּפוּל 10 בַּחֲזָקַת 6 כָּפוּל שֶׁבֶר, בַּמּוֹנֶה אֵייץ' כָּפוּל אֶף כָּפוּל סִינוּס אַלְפָא, בַּמְּכַנֶּה אֶן רוֹט כָּפוּל מְיוּ כָּפוּל פַּאי כָּפוּל פִּי מֻתָּר סוֹף הַשֶּׁבֶר, וְעוֹד דִּי קְטַנָּה בַּחֲזָקַת 3." ], [ "\\sigma_b=\\frac{10M_b}{D^3(1-\\beta^4)}\\le[\\sigma_b]", "סִיגְמָה בִּי שָׁוֶה שֶׁבֶר, בַּמּוֹנֶה 10 אֶם בִּי, בַּמְּכַנֶּה דִּי בַּחֲזָקַת 3 כָּפוּל סוֹגְרַיִם, 1 פָּחוֹת בֵּיתָא בַּחֲזָקַת 4 קָטָן אוֹ שָׁוֶה לְ־ סִיגְמָה בִּי מֻתָּר." ], [ "\\varphi=\\tan^{-1}\\left(\\frac{h/2}{b/2}\\right)=53.2^\\circ", "פִי שָׁוֶה אַרְקְטַנְגֶּנְס סוֹגְרַיִם, שֶׁבֶר, בַּמּוֹנֶה אֵייץ' חֶלְקֵי 2, בַּמְּכַנֶּה בִּי חֶלְקֵי 2 שָׁוֶה 53.2 מַעֲלוֹת." ], [ "\\Sigma r_i=r_i^2i_r=42.5^2\\cdot4=7225\\ mm^2", "סְכוּם אָר אַיי שָׁוֶה אָר אַיי בְּרִבּוּעַ כָּפוּל אַיי אָר שָׁוֶה 42.5 בְּרִבּוּעַ כָּפוּל 4 שָׁוֶה 7225 מִילִימֶטֶר רָבוּעַ." ], [ "X_d^u=20_{-0.1}^{+0.4}", "אֶקְס דִּי יוּ שָׁוֶה 20 סְטִיָּה עֶלְיוֹנָה פְּלוּס 0.4 סְטִיָּה תַּחְתּוֹנָה מִינוּס 0.1." ], [ "A_{max}=50_{max}-30_{min}+12_{max}=32.3", "אֵיי מַקְסִימוּם שָׁוֶה 50 מַקְסִימוּם פָּחוֹת 30 מִינִימוּם וְעוֹד 12 מַקְסִימוּם שָׁוֶה 32.3." ], [ "d=20\\ \\mathrm{mm}\\quad p=2.5\\ \\mathrm{mm}", "דִּי שָׁוֶה 20 מִילִימֶטֶר, פִּי שָׁוֶה 2.5 מִילִימֶטֶר." ], [ "F=9167\\ \\mathrm N", "אֶף שָׁוֶה 9167 נְיוּטוֹן." ], [ "\\rho_e=250\\ \\mathrm{N/mm}", "רוֹ אִי שָׁוֶה 250 נְיוּטוֹן לְמִילִימֶטֶר." ], [ "n_{out}=500\\ \\mathrm{rpm}", "אֶן אָאוּט שָׁוֶה 500 סִבּוּבִים לְדַקָּה." ], [ "\\beta=\\mathrm{Shift}\\,\\sin\\left[\\frac{D-d}{2A}\\right]", "בֵּיתָא שָׁוֶה שִׁיפְט סִינוּס סוֹגְרַיִם, שֶׁבֶר, בַּמּוֹנֶה דִּי גְּדוֹלָה פָּחוֹת דִּי קְטַנָּה, בַּמְּכַנֶּה 2 אֵיי." ], [ "D_e=m_t(Z+2\\cos\\beta)", "דִּי אִי שָׁוֶה אֶם טִי כָּפוּל סוֹגְרַיִם, זֶד וְעוֹד 2 כָּפוּל קוֹסִינוּס בֵּיתָא." ], [ "P_0=x_0F_r+y_0F_a", "פִּי 0 שָׁוֶה אֶקְס 0 כָּפוּל אֶף אָר וְעוֹד וַאי 0 כָּפוּל אֶף אֵיי." ], [ "\\sigma_e=7.5\\ \\mathrm{MPa}>[\\sigma_e]=6\\ \\mathrm{MPa}", "סִיגְמָה אִי שָׁוֶה 7.5 מֶגָה פַּסְקָל גָּדוֹל מִן סִיגְמָה אִי מֻתָּר שָׁוֶה 6 מֶגָה פַּסְקָל." ], [ "L=L_hn_{rot}\\cdot60\\cdot10^{-6}=720\\ \\mathrm{mil\\ rev}", "אֶל שָׁוֶה אֶל אֵייץ' כָּפוּל אֶן רוֹט כָּפוּל 60 כָּפוּל 10 בַּחֲזָקַת מִינוּס 6 שָׁוֶה 720 מִילְיוֹן סִבּוּבִים." ], [ "R_a\\,[\\mu\\mathrm{m}]", "אָר אֵיי מִיקְרוֹן." ], [ "x=3\\%", "אֶקְס שָׁוֶה 3 אָחוּז." ], [ "\\eta=\\frac{H_{out}}{H_{in}}<1\\\\H_{in}=\\frac{M_tn_{rot}}{9550000}", "אֵיטָה שָׁוֶה אֵייץ' אָאוּט חֶלְקֵי אֵייץ' אִין קָטָן מִן 1. אֵייץ' אִין שָׁוֶה שֶׁבֶר, בַּמּוֹנֶה אֶם טִי כָּפוּל אֶן רוֹט, בַּמְּכַנֶּה 9550000." ], [ "v_f=f n", "וִי אֶף שָׁוֶה אֶף כָּפוּל אֶן." ], [ "Z_k:\\ 12,13,14", "זֶד קֵיי: 12, 13, 14." ] ];

test('formulas read from the dictionary — ' + GOLD.length + ' shapes', () => {
  assert.ok(GOLD.length >= 30);
  for (const [latex, said] of GOLD) {
    const r = Speech.speak(formula(latex), lexicon);
    assert.equal(r.ok, true, latex + ': ' + r.reason);
    assert.equal(r.text, said, latex);
  }
});

test('unknown commands, unbalanced brackets and empty formulas give no recording, with the reason', () => {
  const FAIL = [["\\begin{gathered}=\\\\=\\end{gathered}","NOTHING_TO_READ"],["\\foo{x}=1","UNKNOWN_COMMAND:foo"],["a=(b","PARSE:unclosed )"]];
  for (const [latex, reason] of FAIL) assert.deepEqual(Speech.speak(formula(latex), lexicon), { ok: false, reason, skip: /^NOTHING_TO_READ/.test(reason) }, latex);
  assert.match(Speech.speak(formula('x=\\frac{a}{b}'), { ...lexicon, words: { ...lexicon.words, over: undefined } }).reason, /LEXICON_MISSING:words.over/);
});

test('no raw LaTeX reaches the voice', () => {
  for (const [, said] of GOLD) assert.doesNotMatch(said, /\\|[{}_^]|frac|sqrt|mathrm/, said);
});

test('upper and lower case of one letter are told apart only when both are present', () => {
  assert.match(Speech.speak(formula('C=\\frac{F}{f}'), lexicon).text, /אֶף גְּדוֹלָה .* אֶף קְטַנָּה/);
  assert.doesNotMatch(Speech.speak(formula('F=ma'), lexicon).text, /גְּדוֹלָה|קְטַנָּה/);
  // «Nmm» is a unit, its letters are not symbols
  assert.doesNotMatch(Speech.speak(formula('M_t=185915\\,Nmm'), lexicon).text, /גְּדוֹלָה|קְטַנָּה/);
});

test('«where …» names only symbols of the formula, once, with the unit', () => {
  const item = formula('H=\\frac{M_t v_c}{30D\\eta}', [
    { latex: 'H', he: 'הֶסְפֵּק', unit: 'kW' }, { latex: 'M_t', he: 'מומנט סיבוב', unit: 'N*mm' },
    { latex: 'M_t', he: 'מומנט סיבוב', unit: 'N*mm' }, { latex: 'Q', he: 'כוח', unit: 'N' }, { latex: 'D', he: '', unit: 'mm' }]);
  const said = Speech.speak(item, lexicon).text;
  assert.match(said, /כַּאֲשֶׁר: אֵייץ' – הֶסְפֵּק, קִילוֹוָט; אֶם טִי – מומנט סיבוב, נְיוּטוֹן מִילִימֶטֶר\.$/);
  assert.doesNotMatch(said, /כוח/);
});

const PROSE = [ [ "נִתָּן לְשַׁנּוֹת אֶת מַרְכִּיבֵי הַהֶסְפֵּק (מוֹמֶנְט הַסִּבוּב – Mt, מְהִירוּת הַסִּבוּב – n_rot) עַל יְדֵי שִׁנּוּי.", "English-free notation inside prose", "נִתָּן לְשַׁנּוֹת אֶת מַרְכִּיבֵי הַהֶסְפֵּק מוֹמֶנְט הַסִּבוּב – אֶם טִי, מְהִירוּת הַסִּבוּב – אֶן רוֹט עַל יְדֵי שִׁנּוּי." ], [ "• תִּמְסֹרֶת מַפְחִיתָה (reducer) – שִׁמּוּשׁ בְּגַלְגַּל מֵנִיעַ קָטָן.", "bullet and English gloss dropped", "תִּמְסֹרֶת מַפְחִיתָה – שִׁמּוּשׁ בְּגַלְגַּל מֵנִיעַ קָטָן." ], [ "רְכִיב כּוֹחַ יוּגְדַּר \"+\" (חִיּוּבִי) כַּאֲשֶׁר הַכּוֹחַ מְכוּוָן עִם כִּיווּן הַצִּיר.", "quoted sign", "רְכִיב כּוֹחַ יוּגְדַּר פְּלוּס חִיּוּבִי כַּאֲשֶׁר הַכּוֹחַ מְכוּוָן עִם כִּיווּן הַצִּיר." ], [ "קֹטֶר מַסְמְרָה dS = √(F/((π/4)·[τS]·nגְּזִירָה·i))", "formula in prose with a Hebrew index", "קֹטֶר מַסְמְרָה דִּי אֶס שָׁוֶה שֹׁרֶשׁ שֶׁל סוֹגְרַיִם, אֶף חֶלְקֵי סוֹגְרַיִם, פַּאי חֶלְקֵי 4 כָּפוּל טָאוּ אֶס מֻתָּר כָּפוּל אֶן גְּזִירָה כָּפוּל אַיי, סוֹף סוֹגְרַיִם, סוֹף סוֹגְרַיִם" ], [ "קְבוּעַ קְפִיץ יָחִיד C = 50 N/mm.", "unit after a number", "קְבוּעַ קְפִיץ יָחִיד סִי שָׁוֶה 50 נְיוּטוֹן לְמִילִימֶטֶר." ], [ "פְּלָדַת מְהִירַת חִתּוּךְ – High-Speed Steel)", "trailing English name", "פְּלָדַת מְהִירַת חִתּוּךְ –" ], [ "תְּנַאי חֹזֶק לְהִתְעַיְּפוּת σ = √((280/m)³·ka·Hin·(1 ± i)·Ee·kd/(nin·Zin²·λ)) ≤ [σ]", "nested groups and allowed value", "תְּנַאי חֹזֶק לְהִתְעַיְּפוּת סִיגְמָה שָׁוֶה שֹׁרֶשׁ שֶׁל סוֹגְרַיִם, סוֹגְרַיִם, 280 חֶלְקֵי אֶם, סוֹף סוֹגְרַיִם בַּחֲזָקַת 3 כָּפוּל קֵיי אֵיי כָּפוּל אֵייץ' אִין כָּפוּל סוֹגְרַיִם, 1 פְּלוּס מִינוּס אַיי, סוֹף סוֹגְרַיִם כָּפוּל אִי אִי כָּפוּל קֵיי דִּי חֶלְקֵי סוֹגְרַיִם, אֶן אִין כָּפוּל זֶד אִין בְּרִבּוּעַ כָּפוּל לַמְדָּה, סוֹף סוֹגְרַיִם, סוֹף סוֹגְרַיִם קָטָן אוֹ שָׁוֶה לְ־ סִיגְמָה" ] ];

test('Hebrew prose: notation inside is read, English glosses and bullets are not', () => {
  for (const [text, why, said] of PROSE) assert.equal(Speech.proseSpeech(text, lexicon), said, why);
  assert.doesNotMatch(PROSE[1][2], /reducer|•/);
  assert.match(PROSE[3][2], /אֶן גְּזִירָה/);
});

test('blocks: kinds that are read, pointed text required, nothing-to-read is not a gap', () => {
  const block = (kind, he_niqqud) => ({ id: 'a97002:p1:b001', type: 'block', kind, he: 'x', he_niqqud, ru: 'x' });
  assert.equal(Speech.speak(block('prose', 'שָׁלוֹם'), lexicon).text, 'שָׁלוֹם');
  assert.deepEqual(Speech.speak(block('prose', ''), lexicon), { ok: false, reason: 'NO_NIQQUD' });
  assert.deepEqual(Speech.speak(block('other', 'שָׁלוֹם'), lexicon), { ok: false, reason: 'NOT_READ' });
  assert.deepEqual(Speech.speak(block('heading', '1'), lexicon), { ok: false, reason: 'NOTHING_TO_READ', skip: true });
  // cantillation goes, pointing stays
  assert.equal(Speech.speak(block('prose', 'שָׁל֑וֹם'), lexicon).text, 'שָׁלוֹם');
});

test('overrides exclude an item or give its exact text', () => {
  const item = formula('a=b');
  assert.deepEqual(Speech.speak(item, lexicon, { items: { [item.id]: { exclude: true, reason: 'owner' } } }), { ok: false, reason: 'EXCLUDED:owner' });
  assert.deepEqual(Speech.speak(item, lexicon, { items: { [item.id]: { text: ' אֵיי  שָׁוֶה בִּי ' } } }), { ok: true, text: 'אֵיי שָׁוֶה בִּי', override: true });
});

test('the fingerprint changes with the text a recording depends on, and only with it', () => {
  const a = { id: 'x', type: 'block', kind: 'prose', he: 'א', he_niqqud: 'אָ', ru: 'а', translit: 'a' };
  const same = Speech.sourceOf(a);
  assert.equal(Speech.sourceOf({ ...a, ru: 'другое', translit: 'b', he: 'ב' }), same);
  assert.notEqual(Speech.sourceOf({ ...a, he_niqqud: 'אַ' }), same);
  const f = formula('a=b', [{ latex: 'a', he: 'צלע', unit: 'mm', ru: 'сторона' }]);
  assert.equal(Speech.sourceOf({ ...f, vars: [{ ...f.vars[0], ru: 'другое' }] }), Speech.sourceOf(f));
  assert.notEqual(Speech.sourceOf({ ...f, vars: [{ ...f.vars[0], unit: 'cm' }] }), Speech.sourceOf(f));
  assert.notEqual(Speech.sourceOf({ ...f, latex: 'a=c' }), Speech.sourceOf(f));
});

test('the browser loads the same module: sourceOf is identical without CommonJS', () => {
  const code = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'atlas-speech.js'), 'utf8');
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox);
  const item = formula('\\sigma_e=\\frac{F}{A}', [{ latex: 'F', he: 'כוח', unit: 'N' }]);
  assert.equal(sandbox.window.AtlasSpeech.sourceOf(item), Speech.sourceOf(item));
  assert.equal(sandbox.window.AtlasSpeech.speak(item, lexicon).text, Speech.speak(item, lexicon).text);
});

test('the dictionary is complete for its own grammar and keeps the reviewed Materials letters', () => {
  for (const k of ['equals', 'over', 'times', 'plus', 'minus', 'negative', 'squared', 'cubed', 'power', 'sqrt', 'cbrt', 'fraction',
    'numerator', 'denominator', 'end_fraction', 'end_root', 'open', 'close', 'prime', 'degrees', 'allowed', 'etc', 'sum', 'upper',
    'lower', 'where', 'tol_upper', 'tol_lower', 'plus_sign', 'comes_from', 'gives', 'to', 'diameter', 'percent']) assert.ok(lexicon.words[k], k);
  assert.equal(Object.keys(lexicon.latin).length, 26);
  assert.equal(lexicon.latin.F, 'אֶף'); assert.equal(lexicon.greek.sigma, 'סִיגְמָה'); assert.equal(lexicon.units.MPa, 'מֶגָה פַּסְקָל');
  for (const v of Object.values(lexicon.greek_chars)) assert.ok(lexicon.greek[v], v);
});

const DATA = path.join(__dirname, '..', 'data', 'atlas', 'a97002');
test('the whole book: every shown formula is read, ≥ 98 % of the readable blocks, within the cost ceiling', { skip: !fs.existsSync(path.join(DATA, 'sections')) }, () => {
  const tts = require('../scripts/atlas/atlas-tts.cjs');
  const report = tts.inventory({ data: DATA });
  assert.equal(report.formulas.voiced, report.formulas.total);
  assert.ok(report.blocks.voiced / report.blocks.total >= 0.98, JSON.stringify(report.blocks));
  assert.equal(report.gate_cost, 'PASS');
  assert.ok(report.longest_input_bytes <= report.max_input_bytes);
});
