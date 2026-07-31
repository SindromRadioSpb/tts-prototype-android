# Studio Ingest L3a — owner-live execution packet

> **Date:** 2026-07-31
> **Status:** local engineering candidate; owner-live not yet executed
> **Production unchanged:** `v3.11.279 / 88977240`
> **Candidate:** `v3.11.280`, actual `MIGRATIONS.length=45`
> **Exact code commit:** `097d212dff899642d4e83906caa20c03c9ef8cc9`
> **Authority:** local/browser verification only. No push, deploy, server/production mutation,
> cloud Media Package sync, L2/L4/L5/L6 or full-media ZIP.

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

Expected preflight: code commit matches exactly, migration count is `45`, production is not
touched, and unrelated dirty files remain unstaged.

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
