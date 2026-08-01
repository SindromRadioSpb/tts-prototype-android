# Studio Ingest L3a — owner-live execution packet

> **Date:** 2026-07-31
> **Status:** shipped through production `v3.11.282`; packet retains the original candidate
> evidence and remains the canonical ledger of owner-live gates/known failures.
> **Production/origin head after approved deploy:**
> `5c5239332093bb5a10e10e500c81eb0300a8be4b`; actual `MIGRATIONS.length=45`.
> **Core/follow-ups:** `097d212d` → `821460c4` → `44b216bc`.
> **Current scope boundary:** cloud Media Package sync, L2/L4/L5/L6 and full-media ZIP
> remain absent. The next research/planning layer is L3b Artifact Continuity; see the
> 2026-08-01 research and planning packets.

> **2026-08-01 follow-up:** the original L3a candidate shipped as `v3.11.280`. Owner partial-live
> testing then exposed a reopen/discoverability defect. The scoped `v3.11.281` correction and its
> deployment evidence supersede the lifecycle portion of this packet; see §4a onward. The original
> acceptance record below is retained as historical evidence.

> **Historical latest local candidate before deploy (2026-08-01):** `v3.11.282`, exact code
> commit `44b216bca4cc5fdecc5f2fae97ab9291ed8a6fb9`, actual `MIGRATIONS.length=45`.
> At that checkpoint production remained `v3.11.281`; §4c–4d record the correction which was
> subsequently deployed as part of the production/origin state declared above.

## 1. What is in the candidate

- additive browser migration v45 with first-class package, track, immutable revision and frozen
  text-binding tables;
- immutable `raw_original` and separate `user_corrected` track with edit/split/merge/offset,
  recoverable draft and explicit revision commit;
- stable `source_segment_id`, separate `caption_segment_id`, full split/merge lineage and
  `studio-row-source-v2` table projection;
- focused player editor with raw comparison, RU/LTR and HE/RTL mobile layout;
- standalone corrected VTT/SRT, raw VTT, media-free slim package, checksum validation,
  transactional import and exact SHA relink;
- frozen saved-table binding and stale state; generic delete/recreate Update is refused for a
  Media Package-bound table;
- cloud slim export strips track snapshots and retains only an honest local-only package stub.

## 2. Frozen fixtures

The real transcript and media remain outside git.

- Mia text card:
  `C:\Users\lletp\Downloads\text-card-заложница-миа-интервью.json`
  - SHA-256 `88899a0eca9c43e204ed5a7f51474377f8f4e31b1585028dd413d815fa2d7a06`
  - 212 table rows / 212 raw segments
- Mia media:
  `C:\Users\lletp\Downloads\Freed Israeli hostage Mia Schem in first interview since her release from Hamas captivity in Gaza.mp3`
  - SHA-256 `094164e9c94ce623df765600bb0bd2f2b1715fb08bd5050ae53de7427eae8b90`
  - 43,339,787 bytes
- Sanitized browser fixture is generated in an ephemeral Chromium profile by
  `scripts/premium/media-package-browser-smoke.js`; no transcript leaves the machine.

## 3. Automated evidence already green

| Gate | Exact result |
|---|---|
| L3a target suite | `42 passed, 0 failed` |
| i18n/cache/version | `233 passed, 0 failed` |
| Text-card browser round-trip | `35 passed, 0 failed` |
| captions parse / Studio chunks | PASS / PASS |
| media karaoke / reader parity | PASS / PASS |
| ingest / API smoke | `22/22` / PASS |
| Mia dry promotion | 212 unique raw IDs; raw `c72a340e...`; corrected `de9220e4...`; exact media SHA match; input unchanged |
| 2,800-cue performance | normalize `68.38 ms`; create `208.72 ms`; edit p95 `12.33 ms`; draft `20.09 ms`; commit `74.59 ms`; all below frozen ceilings |
| Chrome 380×844 | v45 present; audio present; revision 2 by user; RU/LTR + HE/RTL; no overflow; no page errors |
| Full `npm test` | `678 total / 669 pass / 9 fail`; same known unrelated baseline listed in §6 |

Inspected screenshots:

- `screenshots/l3a-380-ru.png`
- `screenshots/l3a-380-he.png`

## 4. Exact preflight and automated commands

Run from `E:\projects\tts-prototype-android`:

```powershell
git status --short --branch
git show -s --format="%H %s" 097d212dff899642d4e83906caa20c03c9ef8cc9
node -e "import('./public/db/migrations.js').then(m=>console.log(m.MIGRATIONS.length))"
npm run smoke:media-package
npm run smoke:media-package:perf
npm run smoke:media-package:browser
npm run smoke:i18n
npm run smoke:text-card
npm run smoke:captions-parse
npm run smoke:studio-chunks
npm run smoke:ingest
npm run smoke:media-karaoke
npm run smoke:reader-parity
npm run test:api-smoke
npm run smoke:media-package:mia -- --card="C:\Users\lletp\Downloads\text-card-заложница-миа-интервью.json" --media="C:\Users\lletp\Downloads\Freed Israeli hostage Mia Schem in first interview since her release from Hamas captivity in Gaza.mp3"
```

Expected original preflight: code commit matches exactly, migration count is `45`, production is
not touched, and unrelated dirty files remain unstaged.

## 4a. L3a.1 corrected-transcript continuity — 2026-08-01

### Owner evidence and root cause

After a successful real Local ASR run, both **Продолжить с черновиком** and the editor's
**Продолжить в таблицу** correctly persisted a first-class Media Package, but the composer exposed
no route back to that corrected track. The only convenient pointer was the in-memory
`window.v3LastMediaPackageRef`; a reload or ordinary navigation made the artifact undiscoverable
even though browser SQLite and OPFS still held it. This was a lifecycle/discoverability defect, not
loss of the canonical track and not a reason to repeat ASR.

### Scoped correction

- **Version:** `v3.11.281`; actual `MIGRATIONS.length=45` — no new migration or schema mutation.
- **Exact code commit:** `821460c45779d2af8390f0291e8a89a2a59d321c`.
- The repository now exposes a metadata-only, non-deleted corrected-track workspace catalog and
  current-workspace lookup; transcript segments are not copied into a second catalog truth.
- A contextual card under **Исходный текст** exposes
  `🔒 immutable raw → corrected vN`, draft/saved state, local-only scope, missing-media and stale
  binding state, plus **Вернуться к правкам**.
- **Транскрипты** and Import → File expose the same persisted packages after reload. Selecting one
  reopens the current corrected revision without ASR. Opening a saved table activates its exact
  Media Package binding; a newer corrected revision is shown as separate/stale and does not rewrite
  the frozen table.
- Source clear/entity switch clears only the active UI association. It does not delete the package;
  the local shelf remains available. Missing media blocks replay only, not text correction.
- Local/Gemini defaults, model-call policy, raw immutability, cloud filter, server schema/data,
  L2/L4/L5/L6 and full-media ZIP are unchanged.

### Exact gates

| Gate | Result |
|---|---|
| Media Package target suite | `44 passed, 0 failed` |
| i18n/cache/version | `233 passed, 0 failed` |
| Browser 380×844 RU/HE continuity | card reopen + shelf reopen + reopen after reload; corrected v2 preserved; no overflow; `0` page errors |
| 2,800-cue performance | normalize `89.90 ms`; create `298.78 ms`; edit p95 `21.76 ms`; draft `26.36 ms`; commit `102.94 ms`; all under frozen ceilings |
| Text-card / captions / chunks | `35 passed, 0 failed` / PASS / PASS |
| Ingest / media karaoke / reader parity | PASS / PASS / PASS |
| API smoke | PASS; client version `3.11.281` |
| Full `npm test` | `682 total / 673 pass / 9 fail`; unchanged unrelated baseline: one classic-layout tripwire and eight GCP-translation tests |

New inspected screenshots:

- `screenshots/l3a-reopen-composer-380-ru.png` — SHA-256
  `27e3437a6df01dbdba73003ae5973d4e33bd5cb26902b654099f00f1eb3223d1`;
- `screenshots/l3a-reopen-shelf-380-he.png` — SHA-256
  `2d2016875776471f6a7144c7f8c0d03abfb25c7acd235932cb3e5bfb443e37fa`.

### Adversarial closeout

- **R4:** there is a visible return route in the composer and a reload-stable shelf; no repeat-ASR
  dead end remains.
- **R9/R11:** the table binding remains frozen to its exact revision; the editor opens current
  corrected canon and honestly marks divergence. Raw remains immutable.
- **R12:** SQLite revisions remain canon; the workspace list contains identity/status metadata only.
- **R13:** deleted packages are excluded, active UI state is cleared on entity change, and
  missing-media state degrades to relink/replay without blocking correction.
- **R15:** all new persistence and UI are browser-local; no cloud/model/server path was added.

## 4b. Owner production test — paste-ready prompt

```text
Открой production LinguistPro в одном актуальном Chrome-tab и дождись версии 3.11.281.
Не запускай повторный ASR для уже созданного Media Package.

1. Если текущий транскрипт ещё открыт в «Исходном тексте», нажми «Вернуться к правкам» в карточке
   сразу под полем. Проверь, что открылась последняя corrected-версия и raw comparison неизменяем.
2. Закрой/перезагрузи страницу. Нажми «Транскрипты» либо «Импорт → Файл» и открой сохранённый
   транскрипт с локальной полки. Проверь, что правки сохранились без нового ASR.
3. Внеси одну заметную правку, сохрани версию, продолжи в таблицу и сохрани текст. Затем вернись
   в редактор, создай ещё одну версию и снова открой сохранённый текст: UI должен честно показать,
   что таблица использует предыдущую ревизию, не меняя её строки/заметки автоматически.
4. Проверь replay. Если локальный media blob отсутствует, текст должен оставаться редактируемым,
   а UI должен предложить точный SHA-relink вместо повторного ASR.

Сообщи: Chrome version, какой вход использован (карточка или полка), номер opened revision,
сохранился ли текст после reload, stale-state PASS/FAIL, replay/relink PASS/FAIL и console errors.
Не присылай сам transcript; достаточно package/track/revision IDs и hashes.
```

## 4c. L3a.2 media review console and table source-player — 2026-08-01

### Owner evidence and exact root cause

Owner production testing on a 36:17 local video found two coupled defects:

1. table row replay controls disappeared and the table claimed that media was absent even while
   the same OPFS video played in the corrected-transcript editor;
2. the editor separated the high-frequency **Next** and **Replay cue** actions by a scrolling cue
   card, exposed no direct cue-number jump and did not follow manual media seeking.

The replay regression was a compatibility-shape mismatch, not missing bytes: migration-v45 canon
stores `opfs_path`, while the legacy table resolver read only `opfsPath`. The editor correctly read
the canonical package row, so it could play the file; the compatibility table path falsely
degraded to `fileMissing` and suppressed `.smk-row-replay`.

### Scoped correction

- **Version:** `v3.11.282`; actual `MIGRATIONS.length=45`; no migration/schema/server/data change.
- **Exact code commit:** `44b216bca4cc5fdecc5f2fae97ab9291ed8a6fb9`.
- Canonical package media is projected into one normalized legacy camel-case shape; the resolver
  also accepts already-saved snake-case projections, so existing v3.11.280/281 artifacts recover
  without ASR, reimport or backfill.
- The editor is now a review console: player and permanent transport dock contain Previous,
  direct one-based cue input, Replay and Next; player seek/time selects the matching cue and cue
  navigation seeks the player. Export/offset/relink/delete are collapsed as infrequent tools.
- Desktop editor is browser-resizable; mobile remains full-viewport and passed 380×844 RU/LTR and
  HE/RTL without horizontal overflow. Save actions use a stable two-row mobile hierarchy.
- The learning table now mounts a visible local `<audio>` or `<video>` from the same OPFS blob.
  Row selection seeks it even while paused; player time highlights and scrolls the corresponding
  row; per-row original-fragment controls are restored in the last visible column.
- Visible-player binding survives `pause` and `ended`, but media `error` still fails closed. Blind
  S12.7 ranges remain unhighlighted/unreplayable. TTS, Local/Gemini defaults, raw immutability,
  frozen table revision and local-only package scope are unchanged.

### Exact gates

| Gate | Result |
|---|---|
| Media Package target suite | `47 passed, 0 failed` |
| i18n/cache/version | `233 passed, 0 failed`; locale cache-bust `91` |
| Browser OPFS-SQLite 380×844 RU/HE | player→cue `2`, direct jump→cue `1`, one transport dock, rare tools closed, no overflow/page errors |
| Browser table media sync | snake-case OPFS passport resolved; visible `<audio>`; `2/2` replay buttons; row→`0.9s`; media→row highlight |
| Desktop layout | computed `resize: both` |
| 2,800-cue performance | normalize `30.33 ms`; create `93.75 ms`; edit p95 `7.93 ms`; draft `12.76 ms`; commit `49.06 ms` |
| Text-card / captions / chunks | `35 passed, 0 failed` / PASS / PASS |
| Ingest / media karaoke / reader parity / API | PASS / PASS / PASS / PASS; client `3.11.282` |
| Full `npm test` | `686 total / 677 pass / 9 fail`; unchanged unrelated baseline in §6 |

Inspected screenshots:

- `screenshots/l3a-380-ru.png` — compact permanent review transport and two-row save hierarchy;
- `screenshots/l3a-380-he.png` — HE/RTL editor parity;
- `screenshots/l3a-table-source-sync-380-he.png` — visible OPFS source-player and restored
  per-row original-fragment controls.

### Adversarial closeout

- **R4:** no repeat-ASR dead end; all 514-cue review operations are reachable without scrolling
  between Next and Replay, and arbitrary cue navigation is direct.
- **R9/R11:** raw/corrected and frozen-table identities are untouched; the table only consumes a
  revision-hashed compatibility projection. Blind timing still refuses false precision.
- **R12:** SQLite revision/package rows remain canon; passport media is a normalized projection,
  not a second mutable media record.
- **R13:** object URLs are revoked on media identity change; visible-player binding persists after
  ordinary pause/end and tears down on error or source reset.
- **R15:** all media reads and synchronization remain browser-local; no network/model/server path
  was added.

## 4d. v3.11.282 owner production test — paste-ready prompt

```text
После отдельно разрешённого deploy дождись в production версии 3.11.282.
Используй уже сохранённый 36:17 Media Package; не запускай ASR повторно.

1. Открой «Вернуться к правкам». Проверь, что Previous, номер/514, Replay и Next
   всегда находятся в одном dock под плеером, без прокрутки карточки.
2. Введи номер 200 и Enter: должны выбраться реплика 200 и её start time.
3. Перемотай видео на 18:54: «Текст реплики» должен сам перейти к сегменту
   этого времени. Next и Replay должны продолжать работать без прокрутки.
4. Проверь resize окна на desktop; на узком окне не должно быть горизонтального overflow.
5. Продолжи в таблицу. Над строками должен быть видимый source-video, а в последней
   колонке — кнопки повтора отрывка оригинала.
6. Нажми на строку при паузе: video должно seek-нуться к её фрагменту. Перемотай video:
   соответствующая строка должна подсветиться и попасть в видимую область.
7. Перезагрузи страницу и повторно открой тот же пакет: правки и media-link должны сохраниться.

Сообщи Chrome version, PASS/FAIL по пунктам 1–7, один package/track/revision ID и console errors.
Текст транскрипта присылать не нужно.
```

## 5. Owner-live acceptance sequence

Use Chrome with Local mode explicitly selected. Keep Gemini/default provider settings unchanged;
do not make a model call during correction/export.

1. Import the real Mia MP3 through the existing Local ASR path, choose **Исправить транскрипт**.
2. Confirm raw comparison is visible and correct at least ten substantive errors. Record cue IDs,
   not transcript content, in evidence.
3. Split one cue at an explicit playback cursor, merge two adjacent cues, apply a bounded timing
   offset and replay every changed range.
4. Save a revision, close, reopen, and prove the corrected text/draft survived while raw revision
   hash stayed unchanged.
5. Continue to the learning table, save it, then create one newer corrected revision. Reopen the
   saved table: it must show stale state and must not rewrite sentence IDs/notes/history.
6. Export corrected VTT and SRT; reimport and record semantic tuple/hash parity. Export raw VTT and
   prove it still matches the original raw revision.
7. Export slim Media Package, import it in a fresh Chrome profile, verify package/track/revision IDs
   and lineage, then relink the same MP3. A one-byte-different file must fail `MEDIA_SHA_MISMATCH`.
8. Exercise a real local video file in the same editor and replay a bounded cue range; verify the
   player is `<video>` and no remote fetch/model call occurs.
9. Close with an unsaved edit, accept the dirty-close warning, reopen and confirm recoverable draft;
   then explicitly discard it.
10. Record Chrome version, Windows build, device, exact commit, fixture hashes, pass/fail per step
    and any console/page errors. Stop before push/deploy.

## 6. Known failures and unclosed gates

1. `npm test` has 9 unrelated pre-existing failures (`686 total / 677 pass`): one
   `classicModeRedesign` markup tripwire (`btnTableCustomizeToggle`) and eight BYOK GCP premium
   pipeline tests that run without a GCP Translate key and report config instead of their mocked
   provider paths. L3a targeted and adjacent gates are green.
2. Ten real Mia corrections, fresh-profile slim import/relink, stale-table observation and
   crash/dirty-close ceremony require owner-live interaction and are not claimed complete.
3. Automated browser evidence uses a real OPFS WAV blob. Real local `<video>` range replay remains
   an explicit owner-live gate because no video fixture exists in the repository.
4. OPFS quota-full UI and actual browser-process crash were not forced. Repository create/commit
   fault injection and draft recovery are green, but these two destructive-environment ceremonies
   remain open.
5. Full-media ZIP is intentionally absent; slim package contains no media bytes. Cloud Media
   Package sync is intentionally absent.
6. Subsequent production dogfood confirmed a product-maturity gap beyond the shipped L3a.2
   acceptance surface: a late cue correction marks the whole saved table stale, while existing
   cell editing is too narrow and disconnected from source context. This is not resolved by
   repeating ASR or silently rebuilding the table. Owner-approved follow-up is L3a.3 Material
   Revision Workspace with immutable table revisions, field authority and affected-only update;
   normative packet:
   `docs/planning/STUDIO_INGEST_L3A3_MATERIAL_REVISION_WORKSPACE_IMPLEMENTATION_PACKET_2026_08_01.md`.

Rollback before any deploy is simply to leave the local commit unpushed. If owner-live rejects the
candidate, do not mutate production and do not delete unrelated dirty work; create a scoped follow-up
commit or abandon only the allowlisted L3a commits after explicit owner direction.

## 7. Paste-ready next-session prompt

> **Historical / superseded:** этот prompt сохраняется как audit trail pre-deploy authority.
> Не использовать его для нового deploy: `v3.11.282` уже production. Текущий следующий
> implementation-planning prompt находится в
> `docs/planning/STUDIO_INGEST_L3A3_MATERIAL_REVISION_WORKSPACE_IMPLEMENTATION_PACKET_2026_08_01.md`
> §20; L3b program sequence reconciled in its §5/§19/§21.

```text
Работай в E:\projects\tts-prototype-android.

READ FIRST полностью: AGENTS.md, CLAUDE.md, docs/PROJECT_ROLES.md,
docs/planning/STUDIO_INGEST_ROADMAP_2026_07_30.md,
docs/planning/STUDIO_INGEST_LOCAL_PROCESSING_ROADMAP_2026_07_30.md,
docs/planning/STUDIO_INGEST_L3A_CORRECTABLE_MEDIA_PACKAGE_DESIGN_PACKET_2026_07_31.md,
docs/research/studio-l3a-correctable-media-package/2026-07-31/OWNER_LIVE_PACKET.md.

Candidate code commit обязан быть
44b216bca4cc5fdecc5f2fae97ab9291ed8a6fb9, v3.11.282, MIGRATIONS.length=45.
Production baseline перед слайсом: v3.11.281. L2 demand-triggered; не начинать.

Сначала проверь exact HEAD/dirty allowlist, version triplet, actual MIGRATIONS.length=45 и гейты §4c.
Без отдельной дословной authority не push/deploy. Рекомендованная фраза владельца:

"РАЗРЕШАЮ push allowlisted L3a.2 candidate 44b216bca4cc5fdecc5f2fae97ab9291ed8a6fb9
и его docs-only owner packet в origin/main, затем deploy v3.11.282 и read-only production
verification. Не разрешаю server/production schema/data mutations, cloud Media Package sync,
L2/L4/L5/L6 или full-media ZIP. После deploy дождись actual served 3.11.282 и оставь
мне owner-live шаги §4d."

Если authority дана: push только два allowlisted L3a.2 commits, дождись webhook/served
version, проверь `/healthz`, `/api/client-config`, service worker и видимую версию в свежем
Chrome context. Затем остановись и передай владельцу §4d; не запускай повторный ASR.
```
