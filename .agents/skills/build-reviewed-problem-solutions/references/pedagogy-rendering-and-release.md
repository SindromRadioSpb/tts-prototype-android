# Pedagogy, rendering, and release

Read for beginner overlays, tutor instructions, user/agent artifacts, print, public
release, or Agent Access.

## Beginner overlay

The pedagogy ledger explains verified solution truth; it never owns numbers, formulas,
computed results, or comparison status. Each task should contain:

- a plain-language physical or engineering picture;
- the minimum prerequisites;
- the deep principle and its applicability conditions;
- a roadmap of at least three subgoals;
- one task-specific trap;
- common misconceptions;
- at least two retrieval/self-check questions that do not reveal the final answer.

Reject unfinished scaffold markers and phrases such as “obvious” or “just substitute.” Check automatically
that the overlay does not introduce numeric claims absent from verified ledgers.

## Tutor contract

Provide three modes using the same exact-edition task payload:

- **Hint**: picture, target quantity, and one next question without the final answer.
- **Solve together**: one micro-step at a time, asking the learner to explain its goal.
- **Full solution**: complete exam protocol with goal -> law -> applicability ->
  transformation -> result links intact.

If no mode is requested, begin with a short diagnostic and hint. The tutor must say
that evidence is insufficient rather than guess a diagram, source fact, sign, material
state, or author intention. It may assess a shown step against explicit criteria, but
must not infer that the learner understood or write a grade/state from merely reading
the solution.

## Common content source

Generate from reviewed ledgers:

- one bounded Markdown file per task for retrieval;
- one combined agent guide only as a secondary artifact;
- a tutor system prompt with source priority and anti-hallucination rules;
- premium semantic HTML for users;
- hash-verified per-task support shards for UI and agent access;
- a manifest pinning inputs, generator version, and every output hash.

Do not maintain a separate handwritten HTML truth. UI and agent projections must read
the same shard/content fields.

## User surface and print

Recommended on-screen order:

1. answer for comparison;
2. bilingual condition disclosures, collapsed by default;
3. beginner bridge;
4. hint/self-check;
5. full exam solution;
6. comparison and provenance.

Use native disclosure semantics, visible focus, localized RU/EN/HE labels, at least
44 px mobile targets, explicit `lang` and `dir`, and safe semantic math nodes.

Print must include the complete reviewed walkthrough without requiring the user to
open disclosures. Prepare all details on `beforeprint`, restore their exact prior state
on `afterprint`, and support both the explicit button and browser `Ctrl+P`. Isolate the
walkthrough from application chrome; use A4 margins, page numbering, readable RTL,
orphans/widows, and break guards for formulas, headings, small blocks, and final answers.
Create a real browser PDF and visually inspect every page.

## Publication and Agent Access

Keep solution publication separate from the immutable source corpus. Before release:

- obtain rights for answer-derived facts, independently authored solutions, public
  display/print, and agent-readable derivative content;
- create hash-verified per-task shards bound to exact edition, manifest, item,
  snapshot, and source hashes;
- deny on any anchor drift rather than fuzzy-match a similar task;
- use a public read feature flag and a separate derivative content-tier permission;
- require explicit consent/scope and per-item rights for agent access;
- prove public reads do not write learner, review, private, group, or audit truth;
- rehearse migrations/rights changes on a temporary production-like database, back up,
  apply idempotently, and read back every item;
- publish a pilot, verify, then expand. Roll back by flag/rights fact/pointer according
  to the approved architecture without deleting history.

## Acceptance

Run exact task/shard counts, schemas, deterministic rebuild, hashes, drift-deny,
authorization-deny/allow, ETag/404, RU/EN/HE, 1440 and 380 px, HE RTL, no overflow,
print-state restore, and actual A4 PDF text/visual checks. After deployment require a
stable target-version streak, healthy DB/migrations, exact immutable image, all-task
anonymous API read-back, and fresh-anonymous browser interaction.

Test an existing PWA profile separately without clearing OPFS or owner data. A stale
service worker can retain an old 404 or module export; synchronize shell, module URL,
service-worker cache, locale revision, server integrity manifest, and regression test.

Owner-reported, fresh ordinary agent-chat invocation is a separate gate from SDK tool
discovery. Inspector/OpenAI/Claude/community, physical device, physical printer, and
assistive technology remain unclaimed until each is actually tested.
