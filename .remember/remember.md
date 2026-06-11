# Handoff — BRR Reading Room (2026-06-11, resolver-correspondence Tier-1 SHIPPED)

> READ FIRST: this buffer + `docs/planning/BRR_RESOLVER_CORRESPONDENCE_ANALYSIS_2026_06_11.md`
> + `docs/planning/BRR_P1_009_WORD_STATUS_AND_NIQQUD_AUDIT.md` (canonical, in-repo).
> Project = LinguistPro (Node PWA, bilingual HE↔RU). Prod: https://linguistpro.kolosei.com
> Roles R1–R10 auto-apply (canon `docs/PROJECT_ROLES.md`). Owner invariant: "бескомпромиссное
> качество, без заглушек". R1: machine ≠ human, TTS ≠ native — honest provenance.

## Owner norms (standing)
- **Commit + push autonomously, timely, no reminders** (push main → Coolify auto-deploy);
  gates green before push; **prod-verify after** (poll sw.js CACHE_VERSION, then a Playwright tap).
- **SW**: bump `public/sw.js` CACHE_VERSION on ANY shell asset change. **index.html — DO NOT TOUCH**
  (Reading Room work uses library.html; share the OPFS engine).
- **Big feature → recon-first design (this file/docs/planning) before code; forks → options by roles
  + recommendation (owner decides via AskUserQuestion).** Plans in-repo (`docs/planning/<TICKET>.md`).
- New role beyond R1–R10 → propose first. **Verify on PROD, not just locally. MEASURE before coding.**
- **Do NOT commit the ~500 untracked `public/data/benyehuda/works/*.json`** (publish output, lives on
  prod volume not git). Always `git add` explicit paths.

## Git — main = HEAD = `e63dd8b`, code clean, all pushed. Prod SW → `v3.10.30-room-gloss-gate`.
Recent (each PROD-verified unless noted):
- `6d1582f` P1-011 light tap-morphology (SW v3.10.23) · `ca08b57` P1-009 S1 note-capture+status (v3.10.26)
  · `2a8db43` P1-009 S2 **1:1 rich card** (root family + Pealim table + per-form audio) (v3.10.28).
- `bc6c4c0` docs — **role R10** + measured correspondence analysis.
- `e63dd8b` **Tier-1 honest-gloss gate** (SW v3.10.30). ⏳ PROD-verify in flight (poll task running).

## ✅ DONE + PROD — Reading-Room learner-loop COMPLETE
Tap a Hebrew word in `library.html` → rich card 1:1 with Studio: morphology + honest provenance
badge (точно/вероятно/подобрано/служебное слово/не определено) + «Слова от корня» + full Pealim
inflection table (vocalized+translit per cell, tap-to-speak=browser TTS) + «Сохранить»→word_study note
+ lifecycle badge + «🎨 Статус слов» toggle (confidence-gated colouring). **index.html UNTOUCHED.**

## 🆕 Resolver correspondence (2026-06-11) — MEASURED + Tier-1 SHIPPED
Owner Q «как реально поднять соответствие карточка↔Pealim». MEASURED (work 34704, silver=Dicta-local,
`.tmp/qa-dicta.js`/`qa-seggate.js`/`qa-verify-gate.js`): 74% of function words got a WRONG content-
homograph gloss (אֵין→«уничтожить», עָלֵינוּ→«лист»). **Role R10** (computational morphologist) added.
Experimental offline gate tested BEFORE answering (recall 46%→77%).
- **Tier 1 SHIPPED (`e63dd8b`):** `reader-morph.functionGate(stripped)` (pure, exported, Node-tested) +
  gated `resolveCore`. Function form → honest gloss, **drops wrong paradigm/root/link** (link→function-
  links/honest search); content words keep full reading+table. Lists: `FUNCTION_GLOSS` ~140 (incl.
  ktiv-haser אפלו/דוקא); `NUM_GLOSS`+ה-numeral; prep/reflexive+pron-suffix segmentation (base≥2,
  single-letter ב/כ/ל/מ excluded→לִבֵּנוּ=«сердце» safe); one ו/ש proclitic strip (ל/כ/ה NOT→לִהְיוֹת=«быть»).
  Measured `qa-verify-gate` (220 rows): recall **87%**, real FP **0**. Gates green (+R10 cases in
  smoke:reader-morph), reader-parity (index.html untouched), @380px gated-card shot OK.
- **Tier 2 (owner/bake-track):** re-bake 110 low-niqqud works (`.tmp/benyehuda/reniqqud-ids.json` from
  `audit:corpus-niqqud`) → `run-corpus-prebake --bake --ids-file …` → publish. Lifts 32% content non-resolve.
- **Tier 3 (opt-in, BLOCKED on infra):** Dicta «точный режим» for residual ~10% real homographs
  (הַיּוֹם «день/сегодня», מעט, מספיק). Prod `/api/morphology`→`{tokens:[],degraded:false}` = Hetzner
  egress to Dicta CLOSED (local provider WORKS). Fix egress (allowlist/self-host/proxy) + emit
  `degraded:true` (R10 silent-failure flag) first. v1.1.

## Key files (Reading-Room learner layer)
- `public/js/reader-morph.js` — resolver (form-first over offline Pealim 9279) + **R10 functionGate +
  gated resolveCore** + word-wrap (parity-safe) + bottom-sheet card + save/lifecycle + paintLearningStatus.
- `public/js/inflection-render.js` — faithful port of Studio `v3RenderInflectionParadigm`+`v3ConjSpeak`.
- `public/js/library-ui.js` — glue (openReader→attach; roomSaveWord/roomLookupNote; status toggle; toast).
- `public/db/local-db.js` — `getKnownWordStates()` (lemmaKey→state). `public/library.html` — CSS + scripts.
- `scripts/premium/{reader-morph,reader-notes,reader-parity}-smoke.js`, `audit-corpus-niqqud.js`.

## Gates (green on HEAD) — norm: @380px RTL screenshot before commit
`smoke:reader-morph`(+R10) · `smoke:reader-notes` · `smoke:reader-parity` (index.html builder untouched) ·
`smoke:corpus-nav` 33 · `smoke:corpus-room` 18 · `smoke:room` 14 · `smoke:room-mode` 23 ·
`audit:autogen-quality` 0 R1 · `audit:corpus-niqqud` · `test:api-smoke`.

## NEXT (owner picks)
1. **Tier 2** re-bake 110 weak-niqqud works (bake-track) — biggest content-coverage lever, already scoped.
2. **i+1 «Следующий для тебя» (BRR-P1-007)** — per-work vocab profile at publish-time (corpus-vocab-v<N>
   sidecar) → coverage = |known ∩ work_vocab| → recommend i+1-zone works. Big feature → recon-first design.
3. **Tier 3** Dicta «точный режим» (needs prod→Dicta egress fix + degraded:true) — opt-in, v1.1.
4. Polish: ranked-candidate senses for ambiguous; «Подробнее → Студия» deep-link; GCP-WaveNet form audio.

## 🔧 Owner decisions / open
- ~500 untracked work JSONs — add to `.gitignore`? (clutter git status; norm = don't commit).
- 🔑 Security rotate: `AUDIO_UPLOAD_TOKEN` + Gemini key + old GCP TTS key (pasted in chat earlier).

## Surfaces
Studio=`index.html` (DON'T TOUCH). Room=`library.html`+`library-ui.js`+`reader-core.js` (byte-parity gate)
+ learner layer above. Corpus tab = Period→Author→Work over ~26K works (catalog v7:
`public/data/benyehuda/corpus-catalog-v7.json`+sidecars; producer `build-corpus-catalog.js --full`;
publish via skill `publish-corpus-batch`). Bake runner `run-corpus-prebake.js` (`--status`/`--bake`/`--ids-file`).
