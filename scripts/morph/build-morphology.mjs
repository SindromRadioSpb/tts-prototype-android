#!/usr/bin/env node
// scripts/morph/build-morphology.mjs
//
// Phase 9.4.C-local build pipeline. Reads a Hebrew wordlist, runs each
// word through hspell -l via WSL/Linux, parses the output, applies a
// heuristic root derivation, normalizes the lookup key (see
// scripts/morph/normalize.mjs), and serialises the result to
//   public/morph/heb_morphology.bin       (compact JSON, gzipped by HTTP)
//   public/morph/heb_morphology.meta.json (provenance + checksum)
//
// Per docs/MORPHOLOGY_REQUIREMENTS_v3_2.md the build MUST be deterministic
// (#14), preserve multi-analysis entries (#4), and the output MUST share
// the same normalization invariant as the browser runtime (#15).
//
// Sources priority (first that exists is used):
//   1. ENV MORPH_WORDLIST=<path>           — explicit override (line-delimited)
//   2. .external/HebMorph/test-files/<*>   — sampled corpus shipped with HebMorph
//   3. public/morph/HEBREW_COMMON_ROOTS_SEED.json + common_words  — minimal stub
//      (~300 entries; gets us a functional Tier 1 even if hspell is absent)
//
// hspell access path:
//   - tries `hspell -l` on the local PATH first (Linux dev env)
//   - falls back to `wsl -d Ubuntu-24.04 -- bash -lc "hspell -l"` on Windows
//   - if neither works, emits a stub bin with only normalized seed entries
//     (Tier 1 still works, just narrower; Tier 2 still does the heavy lifting)
//
// Usage:
//   node scripts/morph/build-morphology.mjs                 # default
//   MORPH_WORDLIST=path.txt node scripts/morph/build-morphology.mjs
//   MORPH_HSPELL_VIA_WSL=1 node scripts/morph/build-morphology.mjs

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeHebrew } from './normalize.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

const OUTPUT_BIN  = path.join(ROOT, 'public/morph/heb_morphology.bin');
const OUTPUT_META = path.join(ROOT, 'public/morph/heb_morphology.meta.json');
const SEED_PATH   = path.join(ROOT, 'public/morph/HEBREW_COMMON_ROOTS_SEED.json');

// ───────────────────────────────────────────────────────────────────────────
// 1. Hebrew morphology heuristics — derive root from lemma when hspell doesn't
//    emit it explicitly.
// ───────────────────────────────────────────────────────────────────────────

const HEBREW_LETTER_RE = /[א-ת]/g;

// Strip leading single-letter morphological prefixes that may have attached
// to the lemma rather than been segmented out.
function stripLeadingPrefix(lemma) {
  if (!lemma || lemma.length < 4) return lemma;
  // ה־ definite article + הפעיל binyan past prefix
  if (/^ה[א-ת]{3}/.test(lemma)) return lemma.slice(1);
  // נ־ נפעל binyan past prefix
  if (/^נ[א-ת]{3}/.test(lemma)) return lemma.slice(1);
  return lemma;
}

// Apply binyan-specific stripping to recover 3-letter root from a lemma.
// This is a best-effort heuristic — modern Hebrew has many irregular roots.
// Result is paired with a confidence-ish 'derivation' field so the UI can
// flag low-trust extractions if it wants.
function deriveRoot(lemma) {
  if (!lemma) return { root: null, derivation: 'none' };
  // Strip niqqud + format chars + final letters via normalize
  const consonantOnly = normalizeHebrew(lemma).match(HEBREW_LETTER_RE);
  if (!consonantOnly) return { root: null, derivation: 'no-letters' };
  const letters = consonantOnly.join('');

  if (letters.length === 3) {
    return { root: letters, derivation: 'lemma=root' };
  }

  if (letters.length === 4) {
    // Common patterns: ה+3 (hifil past), נ+3 (nifal past), 3+ה (some nouns)
    if (letters[0] === 'ה') return { root: letters.slice(1), derivation: 'strip-hifil-h' };
    if (letters[0] === 'נ') return { root: letters.slice(1), derivation: 'strip-nifal-n' };
    if (letters[3] === 'ה') return { root: letters.slice(0, 3), derivation: 'strip-trailing-h' };
    // pi'el/pu'al: lemma has 3 consonants but doubled middle (e.g. דיבר from דבר)
    // — many of these are 4-letter in writing because of yod for chirik. Just
    // skip yod if present at position 1.
    if (letters[1] === 'י') return { root: letters[0] + letters[2] + letters[3], derivation: 'strip-yod-pi-el' };
    return { root: null, derivation: '4-letters-unclear' };
  }

  if (letters.length === 5) {
    // hitpa'el (התפעל) → strip הת
    if (letters[0] === 'ה' && letters[1] === 'ת') return { root: letters.slice(2), derivation: 'strip-hitpael' };
    // huf'al with doubled middle? skip yod
    return { root: null, derivation: '5-letters-unclear' };
  }

  // Longer → no confident derivation.
  return { root: null, derivation: 'too-long' };
}

// ───────────────────────────────────────────────────────────────────────────
// 2. POS code translation (hspell -l uses ISO-8859-8 single-char codes that
//    transliterate to single Hebrew letters in UTF-8).
// ───────────────────────────────────────────────────────────────────────────

const POS_CODE_MAP = {
  'פ': 'verb',
  'ע': 'noun',
  'ת': 'adj',
  'ש': 'prep',
  'ז': 'masc', // wait — these are gender flags inside the analysis string
};

function classifyPos(firstCodeChar) {
  return POS_CODE_MAP[firstCodeChar] || 'other';
}

// Binyan inference from lemma surface (very approximate — better than
// nothing for v3.2; hspell-pulled binyan codes would supersede if found).
function inferBinyan(lemma) {
  if (!lemma) return null;
  const norm = normalizeHebrew(lemma);
  const letters = (norm.match(HEBREW_LETTER_RE) || []).join('');
  if (letters.length < 3) return null;
  if (letters.length === 3) return 'paal';
  if (/^ה[א-ת]{2}י[א-ת]$/.test(letters) || (letters[0] === 'ה' && letters.length === 4)) return 'hifil';
  if (letters[0] === 'נ' && letters.length === 4) return 'nifal';
  if (letters[0] === 'ה' && letters[1] === 'ת') return 'hitpael';
  if (letters[1] === 'י' && letters.length === 4) return 'piel';
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// 3. hspell -l output parser.
//
// Sample:
//   "מילה חוקית: שלום\n\tשלה(פ,ז,2,רבים,ציווי,...)\n\tשלום(ע,ז,יחיד)\n..."
// ───────────────────────────────────────────────────────────────────────────

function parseHspellOutput(text) {
  const blocks = text.split(/\r?\n/);
  const result = new Map(); // query → analyses[]
  let currentWord = null;
  let currentAnalyses = [];

  const flush = () => {
    if (currentWord && currentAnalyses.length) {
      result.set(currentWord, currentAnalyses);
    }
    currentWord = null;
    currentAnalyses = [];
  };

  for (const line of blocks) {
    if (!line) continue;
    // Analysis line starts with \t
    if (line.startsWith('\t') || line.startsWith(' ')) {
      const m = line.trim().match(/^([^(]+)\(([^)]*)\)/u);
      if (m) {
        const lemma = m[1].trim();
        const tags = m[2].split(',').map(s => s.trim()).filter(Boolean);
        const pos = classifyPos(tags[0] || '');
        const { root, derivation } = deriveRoot(lemma);
        currentAnalyses.push({
          lemma,
          root,
          binyan: pos === 'verb' ? inferBinyan(lemma) : null,
          pos,
          tags,
          derivation,
        });
      }
      continue;
    }
    // Header (recognised word): line ends with ":<space><word>" — capture
    // the last whitespace-delimited token after the colon.
    const headerMatch = line.match(/:\s*(\S+)\s*$/u);
    if (headerMatch && !line.startsWith('*')) {
      flush();
      currentWord = headerMatch[1];
      continue;
    }
    // Unrecognised word marker: "* <word>" — flush previous, skip.
    if (line.startsWith('*')) {
      flush();
      currentWord = null;
      continue;
    }
  }
  flush();
  return result;
}

// ───────────────────────────────────────────────────────────────────────────
// 4. hspell invocation strategies.
// ───────────────────────────────────────────────────────────────────────────

function detectHspellRunner() {
  // 1) Native hspell on PATH (Linux dev env)
  try {
    const r = spawnSync('hspell', ['-V'], { encoding: 'utf-8' });
    if (r.status === 0 && /Hspell/.test(r.stdout)) {
      return { kind: 'native', version: r.stdout.trim().split('\n')[0] };
    }
  } catch (_) { /* not on PATH */ }

  // 2) WSL fallback (Windows dev env)
  if (process.platform === 'win32' || process.env.MORPH_HSPELL_VIA_WSL === '1') {
    try {
      const r = spawnSync('wsl', ['-d', 'Ubuntu-24.04', '--', 'bash', '-lc', 'hspell -V 2>&1 | head -1'], {
        encoding: 'utf-8',
      });
      if (r.status === 0 && /Hspell/.test(r.stdout)) {
        return { kind: 'wsl', version: r.stdout.trim() };
      }
    } catch (_) { /* WSL unavailable */ }
  }

  return null;
}

function runHspellOnWords(words, runner) {
  if (!runner || !words.length) return new Map();
  const stdin = words.join('\n') + '\n';
  let r;
  if (runner.kind === 'native') {
    // hspell expects ISO-8859-8 stdin and emits ISO-8859-8 stdout. iconv
    // both sides.
    r = spawnSync('bash', ['-lc', 'iconv -f UTF-8 -t ISO-8859-8 | hspell -l | iconv -f ISO-8859-8 -t UTF-8'], {
      input: stdin, encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024,
    });
  } else {
    r = spawnSync('wsl', ['-d', 'Ubuntu-24.04', '--', 'bash', '-lc',
      'iconv -f UTF-8 -t ISO-8859-8 | hspell -l | iconv -f ISO-8859-8 -t UTF-8'], {
      input: stdin, encoding: 'utf-8', maxBuffer: 256 * 1024 * 1024,
    });
  }
  if (r.status !== 0) {
    console.warn('[morph-build] hspell failed:', r.stderr || r.error);
    return new Map();
  }
  return parseHspellOutput(r.stdout || '');
}

// ───────────────────────────────────────────────────────────────────────────
// 5. Wordlist sourcing.
// ───────────────────────────────────────────────────────────────────────────

function loadWordlist() {
  // Explicit override
  if (process.env.MORPH_WORDLIST) {
    const p = path.resolve(process.env.MORPH_WORDLIST);
    if (fs.existsSync(p)) {
      const lines = fs.readFileSync(p, 'utf-8').split(/\r?\n/);
      return { words: lines.map(s => s.trim()).filter(Boolean), source: 'env:' + p };
    }
  }
  // HebMorph corpus. Reads ALL files; deduplicates across them.
  // Worktree builds may not have .external present locally — fall back to
  // the canonical repo location (E:\projects\tts-prototype-android) where
  // the user prepared the external sources.
  let corpusDir = path.join(ROOT, '.external/HebMorph/test-files');
  if (!fs.existsSync(corpusDir)) {
    const alt = process.env.MORPH_EXTERNAL_ROOT ||
                'E:/projects/tts-prototype-android/.external/HebMorph/test-files';
    if (fs.existsSync(alt)) corpusDir = alt;
  }
  const maxFiles = Number(process.env.MORPH_CORPUS_MAX_FILES || 0) || 2000;
  if (fs.existsSync(corpusDir)) {
    const out = new Set();
    const allFiles = fs.readdirSync(corpusDir).slice(0, maxFiles);
    for (const f of allFiles) {
      const fp = path.join(corpusDir, f);
      if (!fs.statSync(fp).isFile()) continue;
      const txt = fs.readFileSync(fp, 'utf-8');
      const tokens = txt.match(/[א-ת]{2,}/g) || [];
      for (const t of tokens) out.add(t);
    }
    if (out.size > 50) return { words: [...out], source: 'hebmorph-test-files (' + allFiles.length + ' files)' };
  }
  // Final fallback: seed roots + their common_words
  if (fs.existsSync(SEED_PATH)) {
    const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8'));
    const out = new Set();
    for (const e of (seed.entries || [])) {
      if (e.root_3letter) out.add(e.root_3letter);
      for (const w of (e.common_words || [])) out.add(w);
    }
    return { words: [...out], source: 'seed-fallback' };
  }
  return { words: [], source: 'none' };
}

// ───────────────────────────────────────────────────────────────────────────
// 6. Build entry point.
// ───────────────────────────────────────────────────────────────────────────

function build() {
  const t0 = Date.now();
  console.log('[morph-build] starting pipeline');

  const { words, source } = loadWordlist();
  console.log(`[morph-build] wordlist source=${source}, count=${words.length}`);

  const runner = detectHspellRunner();
  console.log(`[morph-build] hspell runner: ${runner ? runner.kind + ' / ' + runner.version : 'NONE (stub-only mode)'}`);

  // Batch in chunks so hspell doesn't choke on huge stdin.
  const CHUNK = 1000;
  const allEntries = new Map(); // normalized-query → analyses[]

  if (runner && words.length) {
    for (let i = 0; i < words.length; i += CHUNK) {
      const chunk = words.slice(i, i + CHUNK);
      const parsed = runHspellOnWords(chunk, runner);
      for (const [word, analyses] of parsed) {
        const key = normalizeHebrew(word);
        if (!key) continue;
        if (!allEntries.has(key)) allEntries.set(key, []);
        const dest = allEntries.get(key);
        analyses.forEach((a, idx) => {
          dest.push({
            r: a.root,
            l: a.lemma,
            b: a.binyan,
            p: a.pos,
            s: 'hspell-1.4',
            k: dest.length, // rank-in-output
            u: word,        // original surface form (un-normalized)
            d: a.derivation, // root derivation hint (for diagnostics)
          });
        });
      }
      if ((i / CHUNK) % 5 === 0) {
        console.log(`[morph-build] processed ${i + chunk.length}/${words.length}`);
      }
    }
  }

  // Final stub-augmentation: ensure every seed root has at least one entry.
  if (fs.existsSync(SEED_PATH)) {
    const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf-8'));
    for (const e of (seed.entries || [])) {
      const key = normalizeHebrew(e.root_3letter || '');
      if (!key) continue;
      if (!allEntries.has(key)) allEntries.set(key, []);
      const dest = allEntries.get(key);
      // Avoid duplicates: only add if no analysis with same lemma exists.
      if (!dest.some(a => a.l === e.root_3letter)) {
        dest.push({
          r: e.root_3letter,
          l: e.root_3letter,
          b: null,
          p: 'root',
          s: 'seed',
          k: dest.length,
          u: e.root_3letter,
        });
      }
    }
  }

  // Convert Map → plain object for serialization (deterministic key order).
  const entries = {};
  const sortedKeys = [...allEntries.keys()].sort();
  let analysisCount = 0;
  for (const k of sortedKeys) {
    const arr = allEntries.get(k);
    entries[k] = arr;
    analysisCount += arr.length;
  }

  const dictPayload = {
    v: 1,
    entries,
  };

  const dictJson = JSON.stringify(dictPayload);
  const sha256 = crypto.createHash('sha256').update(dictJson).digest('hex');

  const meta = {
    format_version: 1,
    provider: 'local-hspell-prebuilt',
    data_provider: runner ? 'hspell-' + (runner.version.match(/Hspell\/C\s+(\S+)/)?.[1] || 'unknown') : 'seed-only',
    data_provider_license: 'AGPL-3.0',
    data_provider_copyright: 'Nadav Har\'El & Dan Kenigsberg, 2000-2017',
    entry_count: Object.keys(entries).length,
    analysis_count: analysisCount,
    build_timestamp: new Date().toISOString(),
    build_commit: tryGitHead(),
    dictionary_sha256: sha256,
    normalization_version: 1,
    wordlist_source: source,
    note: 'Pre-computed Hebrew morphology lookup index. See docs/MORPHOLOGY_REQUIREMENTS_v3_2.md',
  };

  fs.mkdirSync(path.dirname(OUTPUT_BIN), { recursive: true });
  fs.writeFileSync(OUTPUT_BIN, dictJson);
  fs.writeFileSync(OUTPUT_META, JSON.stringify(meta, null, 2) + '\n');

  const ms = Date.now() - t0;
  console.log(`[morph-build] done in ${ms}ms`);
  console.log(`              entries=${meta.entry_count}, analyses=${meta.analysis_count}`);
  console.log(`              dict=${OUTPUT_BIN} (${(dictJson.length / 1024).toFixed(1)} KB)`);
  console.log(`              meta=${OUTPUT_META}`);
}

function tryGitHead() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf-8', cwd: ROOT }).trim();
  } catch (_) {
    return null;
  }
}

build();
