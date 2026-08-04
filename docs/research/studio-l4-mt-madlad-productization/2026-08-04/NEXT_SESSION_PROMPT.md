# Paste-ready D-HNR-10 continuation

```text
Continue the active D-HNR-10 closed-production-beta goal from the 2026-08-05 human gate.
Do not redo backup, Docker cleanup, env activation, binary lifecycle, conversion or the
real production translation. Read AGENTS.md, CLAUDE.md, docs/PROJECT_ROLES.md, the D-HNR
owner ledger, this directory README/invite-beta/known-limitations/COMMANDS, and
raw/production-beta-activation.json. Live code/state remain primary.

Current verified state: HEAD=origin=served 015c0a05; app/SW 3.11.308; health/DB/migrations
green; disk 76%, disk_warn=false; LOCAL_MT_BETA_ENABLED=true; one active production
container; Companion beta.4 RUNNING; MADLAD @v2 verified. Production Chrome translate,
save/filter/provenance/edit/cold-reopen, Companion-off fail-closed and restart recovery
passed. PRODUCTION PASS is still false because text-card import needs a real owner file
picker. OWNER-LIVE is not started.

Ask the owner to do only these visible actions in Chrome:
1. In the prepared Library/share flow click “Скачать JSON” if needed, then Library →
   Import JSON and select `text-card-d-hnr-10-madlad-production-smoke-2026-08-05*.json`.
2. Verify preview title and 2 rows, uncheck audio preload, click Import. Record the
   idempotent skip/reuse receipt and re-open metadata: provider MADLAD, model @v2,
   local execution true. Do not import a full-library bundle or portable media archive.
3. Run owner-live: fresh Chrome tab → MT settings → paste current Companion token → pair
   → consent → explicit MADLAD → paste an owner-selected real learning text → build table
   → inspect/correct translation → Save as new → Library MADLAD filter → edit → cold
   reopen. Confirm whether the draft is usable. Synthetic smoke is not owner-live.
4. Stop Companion once and confirm MADLAD remains selected/unavailable with no cloud
   result, then restart and re-pair.

After receipts, delete only synthetic text id `8c9d0df0-47d4-450d-b7bc-e61c948c5326`;
do not alter its inherited original media/material. Update the raw receipt, README,
invite-beta, known-limitations and D-HNR ledger in one exact allowlisted commit. Declare
PRODUCTION PASS and OWNER-LIVE PASS separately only if actually observed. Preserve every
unrelated dirty/untracked owner file. No public hosting/signing/GA/default-on, server text
proxy, fallback, DB migration, ASR changes or L4.0c/L4.0b reopening.
```
