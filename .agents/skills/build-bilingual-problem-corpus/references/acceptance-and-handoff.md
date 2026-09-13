# Acceptance and handoff

Read the sections for the requested corpus/solution deliverable. Publication and audio checks apply only to those operations; they remain mandatory when those operations are requested.

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

Block the affected operation (not independent work) when:

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
