// Build-time LaTeX -> MathML for the atlas reader (no maths library in the browser, works offline).
//   node scripts/atlas/render-math.cjs <in.json {key: latex}> <out.json {key: {mathml, error}}>
'use strict';
const fs = require('node:fs');
const katex = require('katex');

const [, , input, output] = process.argv;
const formulas = JSON.parse(fs.readFileSync(input, 'utf8'));
const out = {};
for (const [key, latex] of Object.entries(formulas)) {
  try {
    const html = katex.renderToString(String(latex), { output: 'mathml', displayMode: !key.startsWith('inline:'), throwOnError: true, strict: 'ignore' });
    // KaTeX wraps MathML in <span class="katex">; the reader needs only the <math> element.
    const math = html.slice(html.indexOf('<math'), html.lastIndexOf('</math>') + '</math>'.length);
    out[key] = { mathml: math, error: null };
  } catch (err) {
    out[key] = { mathml: null, error: String(err && err.message || err).slice(0, 300) };
  }
}
fs.writeFileSync(output, JSON.stringify(out));
