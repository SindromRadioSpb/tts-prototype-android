# Studio Ingest L3a — owner-live execution packet

> **Date:** 2026-07-31
> **Status:** local engineering candidate; owner-live not yet executed
> **Production unchanged:** `v3.11.279 / 88977240`
> **Candidate:** `v3.11.280`, actual `MIGRATIONS.length=45`
> **Exact code commit:** `097d212dff899642d4e83906caa20c03c9ef8cc9`
> **Authority:** local/browser verification only. No push, deploy, server/production mutation,
> cloud Media Package sync, L2/L4/L5/L6 or full-media ZIP.

> **2026-08-01 follow-up:** the original L3a candidate shipped as `v3.11.280`. Owner partial-live
> testing then exposed a reopen/discoverability defect. The scoped `v3.11.281` correction and its
> deployment evidence supersede the lifecycle portion of this packet; see §4a onward. The original
> acceptance record below is retained as historical evidence.

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

1. `npm test` has 9 unrelated pre-existing failures: one
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

Rollback before any deploy is simply to leave the local commit unpushed. If owner-live rejects the
candidate, do not mutate production and do not delete unrelated dirty work; create a scoped follow-up
commit or abandon only the allowlisted L3a commits after explicit owner direction.

## 7. Paste-ready next-session prompt

```text
Работай в E:\projects\tts-prototype-android.

READ FIRST полностью: AGENTS.md, CLAUDE.md, docs/PROJECT_ROLES.md,
docs/planning/STUDIO_INGEST_ROADMAP_2026_07_30.md,
docs/planning/STUDIO_INGEST_LOCAL_PROCESSING_ROADMAP_2026_07_30.md,
docs/planning/STUDIO_INGEST_L3A_CORRECTABLE_MEDIA_PACKAGE_DESIGN_PACKET_2026_07_31.md,
docs/research/studio-l3a-correctable-media-package/2026-07-31/OWNER_LIVE_PACKET.md.

Candidate обязан быть exact code commit
097d212dff899642d4e83906caa20c03c9ef8cc9, v3.11.280, MIGRATIONS.length=45.
Production baseline остаётся v3.11.279 / 88977240. L2 demand-triggered; не начинать.

Выполни только owner-live acceptance §5 с владельцем: реальный Mia Local ASR, 10 corrections,
split/merge/offset/replay, close/reopen, frozen table + stale, VTT/SRT parity, slim fresh-profile
import + exact SHA relink, реальный local video, dirty-draft recovery. Сохраняй только hashes/IDs,
не transcript. Сначала перепроверь автоматические гейты §4 и dirty allowlist.

Не разрешены push/deploy, server/production mutation, cloud Media Package sync, model call из
editor/export, L2/L4/L5/L6 и full-media ZIP. При любом нарушении raw immutability, hash/identity
parity, sentence/notes preservation или privacy boundary — STOP и зафиксируй точную причину.
Оставь owner-live evidence packet и отдельный запрос authority; не push/deploy.
```
