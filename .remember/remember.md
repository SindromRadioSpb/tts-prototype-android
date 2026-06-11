# Handoff — BRR Reading Room (2026-06-11, learner-loop SHIPPED)

> READ FIRST: this buffer + `docs/planning/BRR_P1_009_WORD_STATUS_AND_NIQQUD_AUDIT.md` +
> `docs/planning/BRR_P1_011_TAP_MORPHOLOGY_PLAN.md` (canonical plans, in-repo).
> Project = LinguistPro (Node PWA, bilingual HE↔RU). Prod: https://linguistpro.kolosei.com
> Roles R1–R9 auto-apply (canon `docs/PROJECT_ROLES.md`). Owner invariant: "бескомпромиссное
> качество, без заглушек". R1: machine ≠ human, **TTS ≠ native** — honest provenance.

## Owner norms (standing)
- **Commit + push autonomously, timely, no reminders** (push main → Coolify auto-deploy);
  gates green before push; **prod-verify after** (poll sw.js CACHE_VERSION, then a Playwright tap).
- **SW**: bump `public/sw.js` CACHE_VERSION on ANY shell asset change. **index.html — DO NOT TOUCH**
  (Reading Room work uses library.html; шарят OPFS-движок).
- **Big features → start by owner command; recon-first design (this file / docs/planning) на утверждение
  before code** (as A2/A3/P1-011/P1-009 were done). Forks → options by roles + recommendation; owner decides.
- **Plans in-repo:** mirror plan to `docs/planning/<TICKET>.md` (committed), not only `.claude/plans/`
  (memory `feedback_plans_in_repo`). New role beyond R1–R9 → propose first.
- **Verify on PROD, not just locally.** Recon-first MEASURE before coding (it killed a useless fix this session).

## Git — main = HEAD = `a2dba17`, clean (code), all pushed. Prod SW = `v3.10.28-room-conj`.
This session shipped (chronological), each PROD-verified:
- `6d1582f` BRR-P1-011 — light tap-morphology in the Room (SW v3.10.23).
- `ca08b57` BRR-P1-009 Stage 1 — note-capture + word-status colouring + niqqud-audit (SW v3.10.26).
- `2a8db43` BRR-P1-009 Stage 2 — **1:1 rich card** (root family + Pealim inflection table + per-form audio) (SW v3.10.28).
- (+ docs commits 4127c3b, 21581c4, a2dba17; owner's corpus-v5/v6 publish commits interleaved.)

## ✅ DONE + PROD (do not redo) — the Reading-Room learner-loop is COMPLETE
Tap a Hebrew word in `library.html` → **rich word-card 1:1 with the Studio** →
- morphology (root/binyan/POS/RU-gloss) + honest provenance badge (точно/вероятно/подобрано/не определено);
- **«Слова от этого корня»** (root family, dict-derived) + **«Спряжение / Склонение»** (full Pealim
  table, vocalized + transliterated per cell, **tap a form → speak it** = browser-TTS, R1: forms from
  Pealim, voice = TTS);
- **«Сохранить»** → creates a `word_study` note (Studio pipeline reused, idempotent) + lifecycle badge;
- **«🎨 Статус слов»** toggle (opt-in) colours words known=green/learning=amber/new=blue, **confidence-gated**
  (only exact|likely resolves; ambiguous/unvocalized stay neutral — no fabrication).
Loop: read → tap → understand+save → colour → Anki → i+1-ready. **index.html UNTOUCHED.**

### Key files (Reading Room learner layer)
- `public/js/reader-morph.js` — resolver (form-first over offline Pealim 9279) + word-wrap (parity-safe
  post-render) + bottom-sheet card + save/lifecycle + `paintLearningStatus` + rootIndex/paradigm on card.
- `public/js/inflection-render.js` — **faithful port** of Studio `v3RenderInflectionParadigm`+pronoun+
  `v3ConjSpeak` (index.html keeps its own copy, like reader-core vs renderTable).
- `public/js/library-ui.js` — glue: openReader→attach; `roomSaveWord`/`roomLookupNote` (createCanonicalNote
  source:'curated'+addNoteOccurrence); `getKnownWordStates`/`applyWordStatus`; toggle; toast.
- `public/db/local-db.js` — NEW `getKnownWordStates()` (lemmaKey→state). Reuse: `getLearningStateOverlay`,
  `findNoteByDedupKey`/`createCanonicalNote`/`addNoteOccurrence`/`getWordNoteLifecycle`/`getLemmaInflection`.
- `public/library.html` — CSS (card/status/conj-table/toast) + scripts. i18n `room.morph.*` (ru/en/he).
- `scripts/premium/audit-corpus-niqqud.js` (`audit:corpus-niqqud`) — per-work niqqud %, flags <60%.

### Reuse map (no rewrite): `window.NotesAutoGen` (assembleBody/dedupKey/lemmaKey/normVowels/formVariants),
`window.InflectionDict` (ensureReady/lookup, OPFS, lazy 3.3MB gz), `window.PealimFunctionLinks`,
`window.InflectionRender`, `window.ReaderMorph`. The resolver's pidMap holds full paradigms (cells) in memory.

## Gates (green on HEAD)
`smoke:reader-morph` (14 unit + browser) · `smoke:reader-notes` (save→note→lifecycle→status) ·
`smoke:reader-parity` (builder byte-identical — PROOF index.html builder untouched) · `smoke:corpus-nav` 33 ·
`smoke:corpus-room` 18 · `smoke:room` 14 · `smoke:room-mode` 23 · `audit:autogen-quality` (0 R1) ·
`audit:corpus-niqqud` · `test:api-smoke`. Norm: @380px RTL screenshot before commit.

## Measured insight (важно для качества резолва)
«Tap doesn't always surface the right Pealim word» — MEASURED: cause is **niqqud DATA coverage**
(56.6% overall, BIMODAL: 110/633 works <60% vocalized), NOT the algorithm/alignment (alignment-fix
measured 0%), NOT competitors (Pealim = same isolated form-first; no one does context-aware tap-resolve).
On VOCALIZED words resolver is ~62% exact/likely. The dominant lever = **re-bake low-niqqud works**
(bake/publish track, NOT Zal code). Real ceiling = context-aware Dicta (DictaBERT/YAP) but archaic-unvalidated → опц. v1.1.

## NEXT (owner picks — none started)
1. **i+1 «Следующий для тебя» (BRR-P1-007)** — last keystone step. Needs a **per-work vocab profile**
   (lemma-keys per work) built at **publish-time** (`corpus-vocab-v<N>.json` sidecar) → coverage =
   |known ∩ work_vocab| → recommend works in i+1 zone (60–80% known) + frontier>0. Reuse
   `getTextLearningCoverage`/`rankRoots`. **Big feature → recon-first design first.**
2. **Opt-in eager-auto-notes** («подготовить текст к изучению / собрать слова») — NOT default; owner-noted as later opt-in.
3. **Polish:** ranked-candidate senses for ambiguous words; «Подробнее → Студия» deep-link; GCP-WaveNet form audio (vs browser TTS).

## 🔧 Open items / owner decisions pending
- **~500 untracked `public/data/benyehuda/works/*.json`** (publish-pipeline output) — NOT committed
  (norm «тела работ на проде-томе, не git»). **Owner Q: add to `.gitignore`?** (засоряют git status).
- **Bake/data track (owner):** re-bake 110 weak works → `node scripts/premium/run-corpus-prebake.js --bake
  --provider gemini --ids-file .tmp/benyehuda/reniqqud-ids.json` → `publish-corpus-batch` → lifts resolve/colour quality.
- 🔑 **Security (rotate):** `AUDIO_UPLOAD_TOKEN` (light в чате) + Gemini key (после бейка) + старый GCP TTS key.

## Surfaces / tools
Studio = `index.html` (rich note ②-cards, source of the ported renderer — DON'T TOUCH). Room = `library.html`
+ `library-ui.js` + `reader-core.js` (byte-parity, gate `smoke:reader-parity`) + the learner layer above.
Corpus tab = Period→Author→Work over ~26K works (catalog v6: `public/data/benyehuda/corpus-catalog-v6.json`+
sidecars; producer `build-corpus-catalog.js --full`; publish via skill `publish-corpus-batch`). Bake runner
`run-corpus-prebake.js` (`--status`/`--bake`/`--ids-file`), ledger `.tmp/benyehuda/prebake-ledger.json`.
