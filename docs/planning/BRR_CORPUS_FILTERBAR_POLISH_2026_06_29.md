# BRR — Corpus search/filter/sort block: premium polish + read-texts surface

**Owner ask (2026-06-29):** screenshot `IMG_4538.jpeg` (Корпус tab). «Не увидел юзерфрендли как
выбрать только уже прочитанные тексты? Есть такая опция?» + «Аналогично сделай исследование и
полировку этого блока сортировки/фильтрации». Owner chose scope = **ВСЁ (A+B+C+D), 21 требование**;
approved fork recommendations ①shelf+«Показать все» ②честная-%-подпись ③ручное-снятие.

**Method:** measure-before-code (grounded reads) → 3-lens Workflow audit (R4-UX/a11y · R5/R6-findability ·
adversarial-completeness) → synthesis. Run `wf_adb8382a-933`.

## Headline finding (confirmed end-to-end)
A read-status **corpusFilter chip is architecturally impossible** — the W4 `text_key≠id` CRITICAL class.
`corpusSearch` rows are `{id,t,a,e,g,l,r,_n}` with **no `text_key`/`file`**; `finished_at` lives in the
OPFS DB keyed by local `text_id`. A chip would (a) label ALL works «прочитано» or be always-empty,
(b) trip `corpusFilterActive()` and SUPPRESS the Continue/Bookmarks/Recents shelves, (c) cross-key-space
with `_readableSet` (catalog id). **Right answer: a DB-native «✓ Прочитанные» shelf** under «Продолжить
чтение», mirroring `injectContinueReading`, opened by live `t.id`, with the same `CANON_ORIGIN`+`is_archived`
guards (else Studio texts leak — the 2026-06-27 bug).

## Requirements (21) — by wave

### Wave A — P0 read-texts (owner's question)
- **FB-1** `localDb.getFinishedTexts(limit)` (clone getContinueReading; `finished_at IS NOT NULL`,
  `ORDER BY finished_at DESC`) + `injectFinishedReading(body)` shelf «✓ Прочитанные», self-hides empty;
  card opens by `t.id`, «↩ снять отметку» → `clearTextFinished`. «Показать все (N)» → DB-backed bottom-sheet.
- **FB-2** query MUST carry `COALESCE(is_archived,0)=0 AND last_row_idx>0 AND json_extract(source_meta_json,'$.origin')=CANON_ORIGIN` (anti-leak) + static-source regression smoke.
- **FB-3** honest label: pct≥95 → «✓ прочитано», else «отмечено · N%» (finished_at set by dismiss-✓ at ANY %). finished stays MANUAL-only (no scroll/karaoke auto-write).
- **FB-4** reversible: `roomToast(msg, actionLabel, fn)` «Отменить» on the Continue dismiss-✓ + the shelf un-mark.

### Wave B — P1 polish/a11y (kills the «сортировка» misread)
- **FB-6** move «Недавние» (search history) directly UNDER the search input, lighter 🕘 history-chip
  style distinct from facet pills; relabel «Недавние запросы» / «Популярные запросы».
- **FB-5** `:focus-visible` for every interactive surface in the bar (was skipped by the card polish).
- **FB-7** fork pill families (toggle vs gear vs clear/scope) + ▾ chevron on «Жанр»/«Язык» selects (RTL-safe).
- **FB-8** active advanced filters never collapsed-invisible behind ⚙.
- **FB-15** shorten visible «📖 Читаемые» (full phrase in title/aria) so the main row fits one line @380px.

### Wave C — P2 findability/feature
- **FB-9** real SORT on the results header («Сначала готовые» · «По алфавиту» · «По длине» via readyMap);
  «По релевантности» default when a query is present. Never an ungrounded difficulty number (R10).
- **FB-10** touch targets ≥40px across the bar. **FB-11** gear `aria-label` + numeric active-count badge.
- **FB-12** `role=group`+aria-label on `.corpus-facets`/`#corpusFacetsAdv`. **FB-13** honest tooltips
  Готовые/Читаемые + teaching empty-state when readableOnly yields 0 on an empty profile.
- **FB-14** «N из M» scale feedback. **FB-16** «✕ Сбросить» contrast + removable styling.

### Wave D — P3 nice-to-have
- **FB-17** clear-history undo + bigger hit. **FB-18** scope-✕ bidi under RTL. **FB-19** select ellipsis.
- **FB-20** «✓ прочитано» recognition badge on browse/search cards (lazy finished id-set via text_key→readyKeyMap).
- **FB-21** reorder home shelves: Continue + Прочитанные lead.

## Invariants (hold all)
R4 premium mobile-first RTL @380px, no dead-ends, no stubs · R6 findability · R11 do-no-harm + honesty
(finished=manual mark, never auto; never overclaim «read») · narrow-UPSERT preserve (inv #2; finished_at
writer touches only finished_at+updated_at) · CANON_ORIGIN+is_archived anti-leak · index.html untouched
(Room-only) · i18n ru/en/he balanced (gate smoke:i18n) · SW CACHE_VERSION + #roomFooterVersion bump per ship.

## Per-wave discipline
impl → @380px screenshot → adversarial review (pr-review-toolkit:code-reviewer) → fix → gates
(smoke:i18n, smoke:reader-scaffold, smoke:corpus-vocab, + new finished-guard smoke) → commit+push (Coolify)
→ prod-verify (Node fetch no-store).
