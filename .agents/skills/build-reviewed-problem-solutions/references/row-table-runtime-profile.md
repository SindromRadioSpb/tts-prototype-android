# Row-table runtime profile

Read this reference for STEM solutions whose primary student artifact is a bilingual
table used both for learning and for copying a theory-rich answer in an exam. It also
covers a separate bounded grounding projection for a personal agent such as Hermes.

## Canonical row contract

Derive one ordered row ledger per task. Each row needs:

- stable `row_id`, integer order, semantic section and row kind;
- explicit `exam_copy` boolean;
- plain Hebrew, vocalized Hebrew, transliteration, and Russian text;
- source/review references back to the independent solution and any comparison fact;
- a future-audio plan that names the synthesis field and token sequence without
  claiming that audio or timings exist.

Recommended semantic sections include answer-first, theory, model/laws, derivation,
calculation, check, and provenance. Adapt names to the subject, but never flatten the
row order into one opaque HTML paragraph.

The user study projection shows semantic step plus four learning columns. The exam
projection contains all and only `exam_copy=true` rows, in the same order, with plain
Hebrew and formulas preserved exactly. Both projections derive from the same ledger.

## Deferred row karaoke

Before audio approval, validate only deterministic row/token contracts:

- each row names its exact vocalized synthesis text;
- token normalization preserves formula and symbol boundaries;
- formula-heavy rows are counted in a separate spoken-form review queue;
- `audio_asset_key`, timing sidecars, and playback controls remain absent.

Full TTS begins only after the owner reviews the published cards and separately
approves the voice/profile, cost ceiling, audio publication, and timing assets.

## Agent grounding projection

Generate an exact-edition per-task shard from the reviewed table and its solution
ledgers. Bind it to corpus/edition/item/work/snapshot and derivative SHA-256. The agent
projection should contain bilingual conditions, every reviewed Russian solution row,
checks, provenance, and an explicit do-not-invent rule.

Keep a bounded Markdown response under the existing MCP output ceiling. If the full
pedagogy map duplicates a long complete table and would exceed the ceiling, retain all
reviewed solution rows and omit only the duplicated map with an explicit note. Never
truncate a formula or silently drop a reviewed row.

## One MCP, corpus-specific providers

Do not create one MCP server or tool family per problem book. Register an exact-slug
learning-support provider behind the shared read-only publication tool. Preserve the
existing closed response schema; map a corpus display alias to the legacy task label
field when necessary instead of widening a cached tool schema.

Agent rights are append-only per exact edition item:

- `DISCOVER=true` allows corpus/item discovery;
- `DERIVATIVE_TEXT=true` allows the reviewed grounding shard;
- do not grant `SOURCE_TEXT` or `SOURCE_BINARY` unless the owner separately attested
  those agent-use classes.

Run a dry plan first, verify every support shard against the live edition snapshot,
apply in bounded idempotent batches, and read back each use class. Consent copy must
name the actual reviewed STEM content. If it previously named one subject only, bump
the consent version and require an explicit owner reconsent rather than silently
widening an existing grant.

## Acceptance boundary

Prove local schemas, all-task Markdown limits, exact provider routing, absent-right
denial, rights read-back, production tool calls, and unchanged learner/private/group
truth. CLI/SDK discovery is supporting evidence. Final Hermes acceptance requires a
fresh ordinary owner-operated chat that actually invokes the target tool; record it as
`OWNER_REPORTED_PASS`, never infer it from automation.
