#!/usr/bin/env node
'use strict';
// Builds public/js/local-translit-bundle.js (window.LocalTranslit) from db/premium/translit.js.
//
// Memory (Modern release Ф6, 2026-10-23): havarotjs ships its private class fields down-levelled to 37 module-level
// WeakMap/WeakSet tables (one per field). V8 never shrinks such a table after its keys die, so transliterating a long
// text left the capacity of millions of dead entries behind: ≈200 MB retained after a 2 440-row text, for the rest of
// the page's life. In the browser bundle those tables become per-object slots (a private Symbol property on the
// object itself), so the data dies with the object. The library's logic and output are unchanged (checked by
// scripts/premium/translit-bundle-parity.js against the plain build). The server keeps the original modules.
//   node scripts/build-local-translit.js [--out public/js/local-translit-bundle.js] [--plain]
const path = require('path');
const fs = require('fs');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('out', path.join(ROOT, 'public/js/local-translit-bundle.js')));
const plain = process.argv.includes('--plain');

const SLOT = 'class __LpPrivateSlot{constructor(){this.k=Symbol("private")}has(o){return o!==null&&(typeof o==="object"||typeof o==="function")&&Object.prototype.hasOwnProperty.call(o,this.k)}get(o){return o[this.k]}set(o,v){o[this.k]=v;return this}add(o){o[this.k]=true;return this}}\n';

const slots = {
  name: 'private-fields-as-slots',
  setup(build) {
    build.onLoad({ filter: /[\\/]node_modules[\\/]havarotjs[\\/].*\.js$/ }, async (args) => {
      const src = await fs.promises.readFile(args.path, 'utf8');
      const tables = (src.match(/new Weak(?:Map|Set)\(\)/g) || []).length;
      if (!tables) return { contents: src, loader: 'js' };
      return { contents: SLOT + src.replace(/new Weak(?:Map|Set)\(\)/g, 'new __LpPrivateSlot()'), loader: 'js' };
    });
  },
};

esbuild.build({
  entryPoints: [path.join(ROOT, 'db/premium/translit.js')], bundle: true, format: 'iife', globalName: 'LocalTranslit', minify: true,
  outfile: out, nodePaths: [path.join(ROOT, 'node_modules'), path.resolve(ROOT, '..', '..', 'node_modules')], logLevel: 'error',
  plugins: plain ? [] : [slots],
}).then(() => {
  const bundle = fs.readFileSync(out, 'utf8');
  if (!plain && /new Weak(?:Map|Set)\b/.test(bundle)) throw new Error('a WeakMap/WeakSet table is left in the bundle');
  console.log(JSON.stringify({ out: path.relative(ROOT, out), bytes: bundle.length, slots: !plain }));
}).catch((e) => { console.error(e.message); process.exit(1); });
