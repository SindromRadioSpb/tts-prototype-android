---
name: build-reviewed-problem-solutions
description: Derive, review, render or publish worked solutions for an existing canonical LinguistPro task corpus. Excludes source-corpus construction.
---

# Build Reviewed Problem Solutions

Create a solution program that a beginner can follow, an examiner can audit, and an
agent can explain without inventing missing facts.

## Boundary

This skill starts from a stable canonical task set. It does not:

- OCR or mutate the source corpus unless the user separately requests corpus repair;
- use the answer key to generate a derivation;
- infer missing diagram data;
- collapse reviewer decisions into computed comparison results;
- write learner state, grades, `review_log`, groups, assignments, or discussion truth;
- publish answer-derived content without rights and explicit publication authority.

Use `$build-bilingual-problem-corpus` first when task identity, conditions, diagrams,
or source provenance are not yet stable.

Derive from the canonical condition and diagram before answer-key comparison. Keep reviewer dispositions separate from computed results; missing premises remain explicit insufficiency.

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

- For answer transcription, independent derivation, tolerances, disagreement review,
   or handwritten evidence, read [solution truth and ledgers](references/solution-truth-and-ledgers.md).
- For beginner explanations, agent support, premium HTML, print, Agent Access, or
   production rollout, read [pedagogy, rendering, and release](references/pedagogy-rendering-and-release.md).
- When solutions must be a bilingual row table for study/exam copying, with deferred
   row-level karaoke and a bounded Hermes/MCP grounding derivative, read
   [row-table runtime profile](references/row-table-runtime-profile.md).

- For completion checks, source/truth invariants and reporting, read the applicable sections of [acceptance and handoff](references/acceptance-and-handoff.md).
- For a new program only, use [the program template](assets/solution-program-spec.template.json).

## Modes (stages, not separate approval gates)

- **Recon**: pin the task set, inputs, rights, diagrams, answer-key shape, existing
  ledgers, mismatches, and owner decisions. No solutions or publication yet.
- **Answer ledger**: manually transcribe only the printed final answers and attach
  page/hash provenance. Do not derive.
- **Independent solutions**: solve from the condition, diagram, and declared constants;
  compare only after the result exists.
- **Adjudication**: inspect each mismatch, preserve both claims, and record owner/reviewer
  disposition without rewriting history.
- **Exam and pedagogy**: build full exam protocols and a separate beginner overlay from
  verified solution truth.
- **Render and agent package**: generate bounded per-task Markdown, premium semantic HTML,
  print output, tutor instructions, shards, and a hash manifest from common ledgers.
- **Publish**: exact-edition support, separate rights/content tier, pilot, rollback, and
  public/agent acceptance. Only with explicit authorization.
