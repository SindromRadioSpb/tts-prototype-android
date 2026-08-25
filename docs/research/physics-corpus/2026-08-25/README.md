# Physics Year 1 — Online TTS and public-corpus run

Status: `LOCAL_TTS_VERIFIED`; no production write or public pointer change has occurred yet.

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

- `node --test tests/physicsCorpusTts.test.js tests/publishPhysicsCorpus.test.js tests/publicationDomain.test.js`: 14/14 PASS.
- `git diff --check` on the scoped implementation: PASS.
- Online TTS APPLY: 394/394 unique clips generated for 425/425 row references, 0 recorded failures, 33,868,224 audio bytes.
- Final ZIP: `Физика — задачник, 1 год-learning-with-tts.zip`, SHA-256 `795b3536065c343f80962b9d059bd7ad5cad81869c41c54261cec11df4c68206`.
- Android-v2 strict schema: PASS; in-memory import: 74 texts, 425 rows with audio/profile, 0 errors.
- Full MP3 decode probe: 394 files, 0 failures, 4,233.528 seconds total duration.
- The temporary local API-key file was deleted after successful generation.
- No production operation has been attempted.

## Deferred next program

`Физика — решения и форум` is not part of this release. Its first architecture should use immutable task-edition links plus external Google Drive/Telegram solution/discussion URLs. Authorization, task-scoped threads, notifications, moderation, attachments, quotas, anti-vandal controls and backups remain a separate program; server attachments come only after the link-first model is proven.
