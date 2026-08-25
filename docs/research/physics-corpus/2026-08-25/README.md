# Physics Year 1 — Online TTS and public-corpus run

Status: `PRODUCTION_VERIFIED_OWNER_ACCEPTED`; immutable full edition 2 is the active public pointer.

## Scope and source

- Canonical source ZIP: `G:\Andasa\📘 Учебная. 1 год\Физика\Корпус\Физика — задачник, 1 год-learning.zip`.
- Source ZIP SHA-256: `0030a95f20be1be5511020632f2188979bc45148a49eee71547669d17cf77327`.
- Inventory: 74 task cards, 425 semantic row references, 394 unique TTS clips after exact text/profile deduplication.
- Approved Online TTS profile: `he-IL-Standard-A`, rate `0.80`, pitch `+2.5`.
- Rights basis for this corpus only: `OWNER_ATTESTATION_PHYSICS_YEAR1_2026_08_25`.

`physics-year1-tts-plan.json` is the generated dry-run receipt. `physics-year1-tts-apply-report.json` and `physics-year1-tts-verify-report.json` are the APPLY and independent read-back receipts.

## TTS workflow

The builder is `scripts/premium/physics-corpus-tts.js`. PLAN is the default. APPLY requires both `GCP_TTS_API_KEY` in the process environment and an explicit `--confirm-cost-max-clips` at least as large as the current missing unique-clip count.

The durable cache and ledger live beside the owner bundle, not in git:

- `.tts-cache\he-IL-Standard-A-rate-0.80-pitch-2.5\<asset-key>.mp3`;
- `physics-year1-tts-ledger.json`.

Every successful clip is hash-verified and ledgered atomically. A retry skips only cache entries whose bytes and SHA-256 still match the ledger. The final ZIP is not created unless all 425 row references resolve to verified audio assets.

## Publication workflow

The controlled runner is `scripts/premium/publish-physics-corpus.js`. It creates the separate slug `physics-year1-problems`, copies item snapshots through the existing single publication writer, materializes per-item rights facts, requires a complete audio package, publishes a bounded pilot, then publishes the full immutable edition. Public rollback remains a pointer change to a prior edition or withdrawal.

The publication repository now resolves audio referenced by a `MY_TEXTS` snapshot only from exact 64-hex keys in the server `audio-cache`; unreferenced cache files are excluded. Every included file is size/SHA-read back before the public pointer changes.

The asset key identifies the exact row text and TTS profile, not an MP3 byte hash. If production already has a valid MP3 under that semantic key, publication preserves those canonical bytes and normalizes snapshot size/hash metadata to them; it never overwrites the shared cache. Invalid existing MP3 bytes remain a hard failure.

## Current verification

- Release: `3.11.435`, deployed from `e2e41ffa`; five consecutive post-deploy version/catalog probes returned edition 2 with 74 items.
- Focused regression set: 27/27 PASS; `npm run smoke:i18n`: 233/233 PASS.
- `git diff --check` on the scoped implementation: PASS.
- Online TTS APPLY: 394/394 unique clips generated for 425/425 row references, 0 recorded failures, 33,868,224 audio bytes.
- Final ZIP: `Физика — задачник, 1 год-learning-with-tts.zip`, SHA-256 `795b3536065c343f80962b9d059bd7ad5cad81869c41c54261cec11df4c68206`.
- Android-v2 strict schema: PASS; in-memory import: 74 texts, 425 rows with audio/profile, 0 errors.
- Full MP3 decode probe: 394 files, 0 failures, 4,233.528 seconds total duration.
- The temporary local API-key file was deleted after successful generation; neither the key nor its value was committed or copied into the corpus.

## Production receipt

- Separate public slug: `physics-year1-problems`; corpus `pc_cdb2b7f1d6eb975f1a58c160`.
- Pilot edition 1: 3 items and 14 physical assets.
- Active full edition 2: `ed_c345975244ff7bd33d86fcb9`, 74 items, 394 physical assets, 424 item-to-asset references, 0 missing assets, complete package.
- Full manifest SHA-256: `6926876557b93e984180a27a6cda01076b64a4649ff7287d4edd7ab35cbdde1b`.
- Public package: 33,675,333 bytes, SHA-256 `a52a79c8a3c54e000f03626f8efcb48f1c5bd407f6ca46e608569fc11ad64b4a`; independent local read-back found 470 ZIP entries and 0 hash failures.
- Shared-cache publication: 99 assets created, 293 exact existing assets reused and 2 valid semantic-key canonical assets preserved; no cache entry was overwritten.
- Learner/private/review fingerprint was unchanged by publication and by the rollback drill.
- Anonymous API read-back returned edition 2, 74 items and 394 assets; anonymous Range audio returned HTTP 206 with `audio/mpeg`, immutable caching and the expected ETag.

## Browser and rollback acceptance

- Fresh anonymous isolated Chromium context, mobile emulation at 380×844: the Reading Room hub exposes the separate 74-item corpus without an account; the catalog shows 1–48/74 and complete-audio counts.
- The first task opened in Reader with Hebrew, vocalized Hebrew, transliteration and Russian translation. A real row-audio click entered the playing state and fetched the public asset with HTTP 206.
- RU/LTR and HE/RTL both had document width exactly 380 px with no horizontal overflow. The corpus search/sort copy is generic in both languages (`material or author` semantics), and the browser console had no warnings or errors.
- Controlled production rollback changed only the public pointer from full edition 2 to pilot edition 1; anonymous repository read-back returned 3 items. The canonical writer then restored edition 2; five consecutive anonymous probes returned 74 items on `3.11.435`.
- The production backup made before publication remains readable. Current `/healthz` reports application, database and migrations ready; host disk monitoring is warning at 91% used and remains an operations follow-up, not a corpus-integrity failure.
- Owner smoke: `SUCCESS`, reported by the owner on 2026-08-25 after production publication. The report confirms owner acceptance of the released corpus; the exact device/browser/assistive-technology matrix was not itemized and is not inferred.

## Deferred next program

`Физика — решения и форум` is not part of this release. It starts in a separate research-only session from `docs/planning/PHYSICS_SOLUTIONS_FORUM_RESEARCH_SESSION_PROMPT_2026_08_25.md`. Immutable task-edition anchors and external Google Drive/Telegram links are the initial hypothesis, not a substitute for product research. The session must determine a useful one-person and community product model, authorization, task-scoped discussions, notifications, moderation, storage/attachments, quotas, anti-vandal controls, recovery, cost and scale before any implementation approval.
