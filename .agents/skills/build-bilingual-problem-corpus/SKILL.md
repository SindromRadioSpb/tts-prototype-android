---
name: build-bilingual-problem-corpus
description: Build or extend a source-grounded bilingual problem-book corpus in LinguistPro, from scanned or digital tasks through aligned Hebrew, vocalized Hebrew, transliteration, Russian, optional TTS, immutable publication, and verification. Use for a new STEM problem corpus or a new edition; do not use to author or adjudicate worked solutions.
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

## Start here

1. Read `CLAUDE.md`, `docs/PROJECT_ROLES.md`, and the newest planning/evidence
   documents for the target corpus. Live code is primary when dated docs drift.
2. Inspect the dirty tree and preserve unrelated owner files. Use scoped allowlists.
3. Copy [the corpus program template](assets/corpus-program-spec.template.json) into
   the new corpus's stable research directory and fill every decision that is known.
   Keep unknowns explicit; do not turn them into defaults.
4. For a new source, rights change, source replacement, or diagram-bearing book,
   read [intake and truth boundaries](references/intake-and-truth-boundaries.md).
5. When building, generating TTS, importing, publishing, or verifying production,
   read [workflow and gates](references/workflow-and-gates.md).
6. When the source edition is published as condition-only task cards while reviewed
   solutions, row-level learning data, or audio arrive as separate exact-edition
   derivatives, read [condition-card publication profile](references/condition-card-publication-profile.md).

## Select the operating mode

- **Recon**: inventory sources, rights, page/task mapping, existing artifacts,
  provider cost, and unresolved owner decisions. No costly calls or publication.
- **Prepare**: create page-faithful bounded inputs, source manifests, resumable
  ledgers, and red tests. No semantic corpus replacement.
- **Build**: extract and align task rows, validate them, create canonical records,
  and package a local import artifact.
- **Audio**: plan, authorize cost, generate resumably, decode/read back every asset,
  and rebuild the package only after complete coverage.
- **Publish**: use the canonical publication writer, rights facts, pilot edition,
  immutable full edition, rollback drill, and anonymous verification.
- **Repair**: preserve raw evidence, make an allowlisted source-backed correction,
  rebuild derivatives, and prove no unrelated row drift.

Do only the mode the user authorized. A request to prepare materials is not authority
to call a paid provider, import owner data, publish, change production flags, or deploy.

## Non-negotiable data model

Maintain separate artifacts and one writer for each truth domain:

`source bytes -> source/page manifest -> raw provider cache -> reviewed corrections -> aligned rows -> canonical task records -> package -> immutable publication snapshot`

- Never edit source bytes or a raw provider response in place.
- A correction ledger states old value, new value, source evidence, reviewer, and
  reason. Apply it deterministically and fail if the expected old value drifted.
- Stable task identity is distinct from display numbering and DOM position. Pin the
  source hash, page, task key, and edition item identity.
- Treat Hebrew, vocalized Hebrew, transliteration, and Russian as one aligned row.
  Validate semantic kind and row boundaries across all columns together.
- Store conditions, subparts, notes, diagram references, and supplied answers as
  typed rows rather than flattening them into a paragraph.
- If a required diagram is missing or unreadable, mark the task explicitly
  incomplete. Do not infer its geometry from prose or an answer.
- Generated and reviewed states remain distinguishable. Aggregate counts never
  substitute for per-task/per-row evidence.

## Required acceptance envelope

Before calling a local corpus complete, prove:

- every expected task has one unique stable identity and source pin;
- page order, task boundaries, and nonblank content are read back from prepared inputs;
- all aligned columns pass script/language and semantic-row checks;
- provider caches and resume ledgers survive interruption without re-requesting
  verified work;
- any legacy comparison is explicit and cannot silently overwrite the current source;
- the final package passes its strict schema, hash, import, and reopen checks;
- representative first, last, diagram-dependent, multi-part, and repaired tasks match
  canonical records after import;
- public publication, if authorized, is immutable-edition-bound, anonymous-read-only,
  rollback-tested, and does not change learner/private/review fingerprints.
- a zero-audio edition is accepted only as an explicit product state: it has zero audio
  references and controls, preserves row-level future-audio contracts separately, and
  cannot be described as complete-audio.

For TTS, the owner selects the profile. PLAN must report unique missing assets and the
cost ceiling before APPLY. Cache keys bind exact text plus profile. Verify every asset's
bytes, hash, decode, package reference, HTTP Range behavior, and missing count.

## Stop conditions

Stop before mutation or publication when:

- source rights or the requested publication class are not explicitly covered;
- task/page mapping is ambiguous;
- a diagram required for a complete task is absent;
- aligned columns disagree on task sequence or semantic kind;
- the only way to proceed is to overwrite raw evidence or widen a guard silently;
- a provider would need to be rerun although a valid raw cache exists;
- package hashes, publication anchors, backup/read-back, or rollback proof fail;
- old and new production images remain mixed beyond the normal rolling window.

Report the exact blocker, evidence, smallest sound correction, and which downstream
artifacts would need regeneration.

## Handoff

Report the stable research path first, then:

- source counts and hashes;
- task/row/diagram status counts;
- cache and provider usage;
- corrections and unresolved review rows;
- package path and SHA-256;
- tests and read-back results;
- publication edition, rights basis, rollback result, and evidence boundary;
- owner, physical-device, and assistive-technology checks only when actually observed.
