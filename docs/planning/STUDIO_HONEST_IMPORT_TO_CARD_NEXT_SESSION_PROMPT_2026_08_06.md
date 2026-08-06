# Next-session prompt — honest import → card (W1–W6)

> Paste the block below as the first message of a fresh session. Everything after it in this file is
> context for whoever edits the prompt, not part of it.

---

## Paste-ready prompt

```text
Реализуй пакет docs/planning/STUDIO_HONEST_IMPORT_TO_CARD_DECISION_PACKET_2026_08_06.md (W1–W6).

ОДОБРЯЮ реализацию строго по этому пакету: W1 единый content-addressed резолвер медиа-контекста
вместо трёх ambient-глобалов (включая премиум-ветку), W2 сохранение никогда не теряет медиа молча
(три именованных исхода, заметка на карточке), W3 частичное ДОКАЗАННОЕ выравнивание вместо
бинарного вердикта с честным покрытием, W4 превью последствий удаления пакета, W5 проверка
целостности в диагностике Импорт-центра, W6 каждый отказ называет следующее действие.
Red-before-fix тесты §5, гейты §6 с перезагрузкой между шагами, allowlist §7, 380 px RU/HE.
Разрешаю commit, push и деплой на прод. Не разрешаю: интерполированный тайминг, массовую
перезапись существующих привязок, автоматический ASR/перевод, запись производного тайминга в
канон, миграции схемы, серверные изменения, изменение провайдер-дефолтов.

Начни с read-only рекона: подтверди прод-версию и MIGRATIONS.length=48, прочитай пакет целиком и
его предшественника ..._MEDIA_BINDING_PROVENANCE_..., затем напиши падающие тесты ДО кода.
Порядок: W1 → W2 → W3 → W4/W5/W6. После каждого шага — гейты, и только потом следующий.
```

---

## Context for the implementer (not part of the prompt)

### Baseline at hand-off

- production `v3.11.319`, browser schema `MIGRATIONS.length=48`
- full suite: **825 tests, 821 pass, 4 pre-existing failures** — three `classic mode …` layout
  assertions and one `recovery UX …` whose expected strings moved into `media-host.js` long before
  this work. **Do not "fix" them**; they are the baseline. Any *new* failure blocks release.
- predecessor packet closed: D1–D5 shipped in `v3.11.315`–`v3.11.319`

### Traps that cost time today — read before touching code

1. **The `>250 rows` guard is load-bearing.** It looks like a stale historical blocker. It is not:
   a single translate call at that size 500s server-side and loses the whole translation. What was
   broken is segment identity, not the guard. Removing it will silently destroy a paid run.
2. **Three ambient globals, not one.** `v3LastImportMeta` (segments for the request),
   `v3ActiveMediaAudio` (row provenance at save), `v3LastMediaPackageRef` (bind target). Fixing one
   and declaring the path repaired is exactly how D6 reached the owner's card. W1 exists to collapse
   all three.
3. **The Gemini premium branch never consults segments.** `segsForChunks` is `null` by construction
   when `usePremium`, so neither chunking nor the flat-text guard applies there. W1/W2 must cover it.
4. **Timings exist in exactly one place** — `studio_caption_revisions.segments_json`. Table rows,
   `mapping_meta_json` and `_studio_source` carry ids only. `deletePackage` cascades tracks and
   revisions, so deleting a package destroys the only copy of its timings, permanently.
5. **`package_id` = `'mpkg:' + media_sha256`** (except portable imports, which are
   `mpkg:portable:<root>` — resolve those by `media_sha256`, never by parsing the id). Re-importing a
   byte-identical file restores package identity exactly, which is how the owner's dangling material
   reference healed.
6. **Different ASR engines produce different transcripts.** Old Gemini transcript vs new local
   ivrit.ai on the same file: 21.8% word-exact by index. Karaoke cannot be restored across an engine
   change; do not promise it.
7. **Version lockstep is enforced by a gate.** Any locale change requires `APP_VERSION` =
   `CACHE_VERSION` and a bumped `?v=` on all three locale `<script>` tags, plus
   `node tests/i18n.smoke.js --write-lock`. Skipping it fails `smoke:i18n`.
8. **Deploy verification.** After push, poll `https://linguistpro.kolosei.com/index.html` for the new
   `window.APP_VERSION`; the service worker can serve the previous shell for one or two loads. If a
   tab stays stale, unregister the SW and delete the `linguistpro-*-v<old>` caches — OPFS data is not
   affected.
9. **Escaping when writing files programmatically.** A `\n` written through an interpolating layer
   became a real newline inside a JS string literal and broke the whole inline script in
   `index.html`; the page then failed every browser gate with a bare readiness timeout. Verify the
   generated text, not the intent.

### W3 is the one item with real risk

Partial alignment touches mapping authority (R11). The bar: **per-row proof is stricter than the
current global verdict.** A row either is provably contained in exactly one segment and takes that
segment's timing, or it takes none. No interpolation between proven rows, no majority voting, no
nearest-neighbour. `MaterialRevisionCore.planExactAlignedMappingRepair` already reports
`missing_count`/`conflict_count`; keep `alignRowsToSegments`'s strict verdict intact for existing
callers and add the partial mode as an explicitly named alternative.

Measured target on the owner's live card: 542 of 566 rows (95.8%) are found verbatim in the
transcript, while the binary verdict currently maps 0.

### Owner data state (do not re-do)

- `В сокрытии - 2 версия 2` — repaired: bound to `mpkg:00c088eb…`, promoted, `provenance_checked:false`,
  karaoke honestly silent. It will gain karaoke automatically once W3 lands.
- `В сокрытии - 2` (561 rows, created 2026-08-05) — still bound to the **wrong** package
  (`mpkg:af77ff0c…`, the first part's video). Owner has not decided whether to rebind or delete it.
  Ask before touching.
- Full library backup verified at `library-bundle-20260806-202950.zip` (365 MB, 4 material archives,
  one declared gap that has since healed).
