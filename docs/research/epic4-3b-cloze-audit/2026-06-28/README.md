# Epic 4.3b cloze/recall — competitor re-research + implementation audit (2026-06-28)

**What this is:** a deep audit of the shipped 4.3b cloze recall trainer (v3.11.28) against refreshed competitor best practices, through the R1–R11 role system, adversarially verified against the real code, and grounded in live Kapture measurements on the owner's real profile.

**How generated:** multi-agent Workflow (`epic4-3b-cloze-research`) — 2 research agents (competitor web research + code audit), 4 role-cluster brainstorm agents, and per-candidate adversarial verify agents. The run was stopped early (agent-count overrun) but had already completed: competitor practices, the full code audit, all 4 brainstorm clusters, and 8 verify verdicts. Those results were harvested from the workflow journal (nothing recomputed) + merged with main-loop live Kapture measurements.

**Source commit:** HEAD at audit time = v3.11.28 (`fecc1cf`). Code audited: `public/js/reader-morph.js` (collectReviewItems/_scanWords/buildCloze/nextLevel/isMcLevel/pickDistractors), `public/js/library-ui.js` (training functions), `public/library.html` (.room-train-*), `docs/planning/BRR_EPIC4_3B_RECALL_CLOZE_2026_06_28.md`.

**Files here:**
- `first-run-findings.jsonl` — RAW harvested agent outputs (competitor practices + impl audit + brainstorm + verify verdicts). Machine-generated; do not edit.
- `SYNTHESIS.md` — the prioritized, deduped, human-facing report. **Read this.** Owner reviews/decides here.

**Live measurements (main loop, Kapture, real profile 7035 statuses):** distractors live = always 3, same-POS, morpho-honest (quality good); repeated-word-in-cloze leak = 9/987 (~1%) on «הכינור»; row-translation leaks the answer meaning (by owner design); noTranslationRows=0; mcUnder4Options=0 on tested texts.
