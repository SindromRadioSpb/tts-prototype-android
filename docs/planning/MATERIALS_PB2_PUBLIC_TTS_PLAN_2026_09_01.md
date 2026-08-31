# MATERIALS PB2 — PUBLIC TTS RELEASE SLICE

Date: 2026-09-01
Status: `OWNER_APPROVED · LOCAL_IMPLEMENTATION_COMPLETE · GENERATION_GATED`

## 1. Outcome

Every Hebrew condition row and every reviewed-solution row in the public
`materials-science-year1-problem-book-2` reader receives cached row playback,
continuous playback and karaoke timings. A tap on a Hebrew word in either the
Reading Room or Studio resolves the same public word asset before any private
BYOK or browser fallback. Public playback never spends provider quota at read
time and never requires a learner key.

This slice extends the already published exact-edition learning derivative. It
does not alter reviewed Russian/Hebrew text, learner state, SRS history or the
source/solution truth boundary.

## 2. Approved product contract

- Provider profile: Google Standard, `he-IL-Standard-A`, speaking rate `0.8`,
  pitch `+2.5`, MP3.
- One provider synthesis produces both MP3 and timing sidecar for a row.
- `row` and `word` remain different semantic asset types. Identical rows or
  words inside the same type and profile share a content-addressed key.
- The Reading Room and Studio share one public word index and one playback
  resolver. Studio does not synthesize a second copy.
- Public reads are cached-only. Missing, unlisted or hash-mismatched assets fail
  closed; the public corpus does not silently change voice through browser TTS.
- Source-condition row references belong to the immutable source snapshot.
  Reviewed-solution and word references belong to the exact-edition learning
  derivative. Neither is copied into the other truth domain.
- Row playback is mutually exclusive with word playback. Continuous playback
  stays within the selected condition or solution section.

## 3. Cost and capacity envelope

The frozen inventory before formula adjudication is:

| Scope | Provider-billed characters |
|---|---:|
| Task 1 condition + reviewed solution rows | 1,672 |
| Task 1 unique morphology words | 537 |
| All 60 tasks, unique rows | 215,752 |
| All 60 tasks, unique morphology words | 54,928 |
| Total exact inventory | 270,680 |
| Release budget including controlled drift | 320,000 maximum |

At the documented Standard-voice price of about USD 4 per million characters,
the whole release is approximately USD 1.08, or at most USD 1.28 at the release
ceiling, after the free tier is exhausted. It is about 6.8% of a 4,000,000
character monthly free allowance. A release command must stop before synthesis
if its manifest exceeds 320,000 billed characters.

Expected stored audio is 180–210 MB for the corpus, including row MP3 files,
word MP3 files, timing JSON and manifest overhead. Storage is shared globally;
it does not grow with the number of learners or with Room/Studio use.

## 4. Immutable contracts

### 4.1 Semantic key

The audio key is SHA-256 over canonical JSON containing:

`asset_type`, `language`, `voice_name`, `speaking_rate`, `pitch`, normalized
spoken text and the timing/SSML contract version.

Changing any field creates a new asset. Public manifests never point to a
mutable alias.

### 4.2 Row manifest

Each row reference pins `asset_key`, `timing_key`, normalized text SHA-256,
profile id, bytes, audio SHA-256 and timing SHA-256. The derivative manifest is
pinned to corpus slug, edition id, edition manifest SHA-256, work snapshot and
solution derivative SHA-256.

### 4.3 Word manifest

One NFC-normalized vocalized Hebrew form maps to one `asset_type=word` asset.
The manifest also stores an unvocalized lookup alias only when it resolves to a
single vocalized form. Ambiguous aliases fail closed and require the exact
vocalized token from the morphology card.

## 5. Formula speech gate

Rows marked `formula_speech_review_required` are never sent to TTS from display
text. They require a separate record with exact `spoken_he_niqqud`, reviewer,
review date and `REVIEWED_PASS`. Raw Latin/Greek symbols, equations and units are
not inferred by the builder.

The current reviewed-solution set contains 275 such rows. The generated review
ledger is an owner work queue, not publication authority. Until every referenced
formula row passes, whole-corpus synthesis and public publication stop. A
task-scoped pilot is allowed only when all formula rows in that task pass.

## 6. Rights and release gates

All of the following are mandatory:

1. exact source bundle, table manifest and production anchor hashes match;
2. `full_tts_audio_and_timings=true` is explicitly owner-attested for the target
   edition; the current zero-audio attestation is not silently rewritten;
3. every selected formula row is `REVIEWED_PASS`;
4. dry inventory is within the 320,000-character ceiling;
5. provider credentials are available only to the operator-side bake;
6. every MP3 and timing file hashes and every timing sequence is monotonic;
7. exact-edition resolver, Room, Studio, keyboard and 380 px gates pass;
8. bodies are uploaded before any immutable manifest/pointer references them;
9. production reports a consecutive healthy target-version streak.

## 7. Delivery phases

1. Contracts: red tests, inventory builder, formula ledger and fail-closed
   validators.
2. Local bake: resumable content-addressed generation, MP3+timing in one
   provider call, no publication.
3. Runtime: exact-edition row/word resolvers and shared Room/Studio playback.
4. Pilot: Task 1 after its four formula pronunciations and TTS rights pass.
5. Full release: all 60 tasks after all 275 formula records pass.

## 8. Allowlist for this slice

- `docs/planning/MATERIALS_PB2_PUBLIC_TTS_PLAN_2026_09_01.md`
- `docs/research/materials-science-problem-solutions/2026-09-01/tts/**`
- `scripts/premium/materials-pb2-tts.js`
- `scripts/premium/push-canon-audio.js` (timing-aware idempotent uploader)
- `materials/materialsPb2LearningSupport.js`
- `scripts/premium/build-materials-pb2-runtime-support.js`
- `public/js/public-word-audio.js`
- `public/js/morph-host.js`, `public/js/reader-core.js`,
  `public/js/library-ui.js`, `public/js/studio-morph.js`
- exact route wiring in `server.js`
- directly related tests, shell cache-bust and integrity/version files

## 9. Stop list

- no provider call while rights, formula or cost gates are open;
- no production write without a complete local rehearsal and rollback packet;
- no raw-formula pronunciation inference;
- no duplicate Room/Studio bake;
- no learner review/SRS mutation;
- no unrelated dirty-worktree cleanup;
- no claim of production completion from local tests.

## 10. Rollback

The current zero-audio edition and support directory remain a complete rollback
target. A TTS release publishes a new immutable edition/derivative. Rollback is
pointer reversal to the prior edition; content-addressed bodies may remain
orphaned and can be garbage-collected only by a later bounded operation.
