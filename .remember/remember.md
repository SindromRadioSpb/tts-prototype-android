# BRR continuation handoff — updated 2026-06-16 (Search & Discovery block S1–S16 SHIPPED+PROD)

**★ READ FIRST:** `docs/planning/BRR_SEARCH_IMPL_2026_06_16.md` (per-feature implementation log) +
`docs/planning/BRR_SEARCH_DISCOVERY_STATE_2026_06_16.md` (canon, now marked SHIPPED) +
`docs/PROJECT_ROLES.md` (R1–R10 auto) + CLAUDE.md.
Project = LinguistPro (Node PWA, иврит↔рус), prod https://linguistpro.kolosei.com (Зал `/library.html`, Studio `/index.html`).
**main HEAD `616c7d7`, SW `v3.10.68-fts-discovery3`.** Owner-инвариант: бескомпромиссное качество, без заглушек.

## ✅ SHIPPED THIS SESSION — the whole approved search closure S1–S16 (one pass, by phase)
All implemented + gate-green + browser-verified @380px light+dark (0 console-errors) + prod-verified (Node-fetch + browser).
- **P0** S1 bilingual snippet of the matched line (lazy, body-driven, ready-only honest) · S2 `<mark>` query highlight
  (niqqud-insensitive, `markSegments`) · S3 progressive «Точная фраза» (exact-shards-only `phraseOnlySearch` before lemma) ·
  S4 input ✕/Enter/Escape · S5 relevance (phrase>exact>lemma + title group + stable) · S6 count split «По названию:N · В тексте:M».
- **P1** S7 readability filter «📖 Читаемые для меня» + «≈N%» badge (`ensureReadableSet`, one states snapshot) · S8 KWIC
  «📑 Все вхождения» (`concordance` + lazy KWIC lines on ready works) · S9 «🔤 Точная форма» (engine `exactOnly`) · S10
  «💾 В заметки» (word_study note + `body.context` + `pidForToken` → joins coverage; client-side, NOT token-gated).
- **P2** S11 scoped «🔍 искать у автора/в периоде» (+ removable chip, query persists) · S12 recent searches + cold-start
  suggestions · S13 «⭐ Сохранить поиск» + «📚 Читать позже» (localStorage; NOT shelves — corpus works are served-on-open) ·
  S14 «ещё у автора» (author link → works drill) · S15 in-reader find (🔍 bar, green marks, k/N, ↑/↓) · S16 «🔊 С аудио»/«✍ Проверено».

## Files
`public/js/corpus-fts.js` (markSegments · phraseOnlySearch · exactOnly on search/phraseSearch · pidForToken · findRows ·
concordance · test hooks _setBucketForTest/_setLemmaForTest) · `public/js/library-ui.js` (всё UI: snippet/mark/readable/
exactForm/save-to-notes/recents/author-link/provenance/scope/concordance/saved-searches/reading-list/in-reader-find;
`CorpusVocabRoom.refresh`) · `public/library.html` (CSS + 🔍 reader-find button + #readerFind) · i18n ru/en/he
(`room.corpus.search.* facets.* scope.* concordance.* saved.* lists.*` + `room.reader.find.*`) · `public/sw.js` v3.10.68 ·
`scripts/premium/corpus-snippet-smoke.js` (NEW gate, 30 checks) · docs.

## Gates (all green)
`smoke:corpus-snippet` 30 · `smoke:corpus-fts` 48 · `smoke:corpus-fts-parity` 30 · `smoke:reader-parity` · `smoke:reader-resume` 31 ·
`smoke:bookmarks` 11 · `smoke:i18n` 226. **index.html + reader-core builder NOT touched.**

## Lessons (this session) — see also impl doc + memory files
- **Row opts carry the query at `opts.openOpts.ftsQuery`, not `opts.ftsQuery`** (appendPagedWorkRows merges it for the open
  handler). The mark/snippet path must read the nested location — caught only in-browser.
- **Headless Chromium OPFS:** small writes (createNote/createShelf) work, but `importBundle` (reader-open / canon import)
  crashes wa-sqlite («memory access out of bounds»). So the reader-open flow + S15 live marking can't be e2e'd headlessly
  (it's prod-proven daily) — verify via logic gates + plumbing smoke + reader-parity; the live marking is the owner device
  smoke-check (canon norm). And OPFS doesn't durably persist across reload in a headless context → for a returning-user
  profile, seed in-session + `CorpusVocabRoom.refresh()` (drop the boot-cached snapshot), don't seed→reload.
- **Playwright `fill` via a stale `$` handle races a prod re-render** (prod boots/warms slower than localhost → the input was
  detached, value empty). Use selector-based `page.fill(sel,…)` (auto-re-resolves) + settle after boot.
- A word saved from search must carry its **`pealim_id`** (via `pidForToken` from the loaded lemmamap) to fold to `pid:<id>`
  and join the pid-keyed corpus-vocab (else it keys on `norm#pos` and S7 coverage never sees it).
- **Reading lists of corpus works ≠ shelves:** a corpus work is served-on-open (not an OPFS text), so the shelf renderer
  marks it «unavailable» → localStorage + the corpus card flow is the correct store (documented deviation from the S13 design).

## NEXT (P3 backlog / owner choice)
S17 inflection-tolerant PHRASE (lemma-pid) · S18 translit helper рус→иврит · S19 link in Knowledge-Map (root→graph) ·
**multiple NAMED reading lists** (v1 ships one «Читать позже») · **non-ready add to reading list** · collapse advanced/
provenance chips behind a «⚙» (filter bar is dense @380px) · grow FTS coverage → 26K (fetch:corpus-bodies→build→push).
Other tracks: ④ R10-quality+идиш · ⑤ Anki-sync engine · ③ publish→каталог v8.

## 🔑 OPEN (owner) — СРОЧНО
Ротация `AUDIO_UPLOAD_TOKEN` (засвечен) + Gemini + старый GCP. НЕ в код/git. Блокер публикации репо + ③ publish.
(Search block S1–S16 НЕ требовал токена — всё клиентское / уже-в-проде данные.)
