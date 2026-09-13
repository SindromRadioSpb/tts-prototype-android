---
name: build-bilingual-problem-corpus
description: Build or repair a source-grounded bilingual STEM task corpus or edition in LinguistPro. Excludes worked solutions.
---

# Build a Bilingual Problem Corpus

Produce a reproducible source corpus whose rows, provenance, publication edition,
and optional audio can be trusted independently of any solution program.

## Boundary

This skill owns the task source and its learning-table projection. It does not own:

- worked solutions, answer-key adjudication, or tutor explanations;
- learner state, `review_log`, assignments, groups, or discussion truth;
- rights that the owner has not explicitly attested;
- inferred diagrams, missing geometry, or invented source text.

Use `$build-reviewed-problem-solutions` only after the canonical task set and its
source pins are stable.

Never overwrite source bytes or raw provider responses. Apply source-backed corrections through a ledger; preserve task identity and aligned row boundaries. Unknown rights and source facts remain explicit.

## Scope and completion

Use the existing program spec and already-read current context. Create a spec from the
linked template only for a new program. Read target evidence and relevant project rules
when needed; do not repeat the full repository onboarding.

A requested result authorizes its necessary reversible local stages across modes.
Respect an explicitly limited request (such as recon only). Honor authorization already
given for paid calls, publication and access; local preparation alone does not grant it.
Keep rights, budgets, raw evidence, source pins and learner-state boundaries intact.

Fix recoverable local failures within scope and rerun affected checks. Isolate a task
with insufficient source data and continue independent tasks. Block publication on failed
release gates; request only the missing material decision or authority. Do not stop at
the first implementation when the requested result still needs validation or repair.

## Task routing

- For a new source, rights change, source replacement, or diagram-bearing book,
   read [intake and truth boundaries](references/intake-and-truth-boundaries.md).
- When building, generating TTS, importing, publishing, or verifying production,
   read [workflow and gates](references/workflow-and-gates.md).
- When the source edition is published as condition-only task cards while reviewed
   solutions, row-level learning data, or audio arrive as separate exact-edition
   derivatives, read [condition-card publication profile](references/condition-card-publication-profile.md).

- For completion checks, source/truth invariants and reporting, read the applicable sections of [acceptance and handoff](references/acceptance-and-handoff.md).
- For a new program only, use [the program template](assets/corpus-program-spec.template.json).

## Modes (stages, not separate approval gates)

- **Recon**: inventory sources, rights, page/task mapping, existing artifacts,
  provider cost, and unresolved owner decisions. No costly calls or publication.
- **Prepare**: create page-faithful bounded inputs, source manifests, resumable
  ledgers, and applicable existing checks. Add regression tests when changing behavior. No semantic corpus replacement.
- **Build**: extract and align task rows, validate them, create canonical records,
  and package a local import artifact.
- **Audio**: plan, authorize cost, generate resumably, decode/read back every asset,
  and rebuild the package only after complete coverage.
- **Publish**: use the canonical publication writer, rights facts, pilot edition,
  immutable full edition, rollback drill, and anonymous verification.
- **Repair**: preserve raw evidence, make an allowlisted source-backed correction,
  rebuild derivatives, and prove no unrelated row drift.
