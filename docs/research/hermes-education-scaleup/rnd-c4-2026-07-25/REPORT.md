# C4 R&D report — live

## Session state

- Charter: C4, started 2026-07-25 by explicit owner command `стартуй C4`.
- Baseline HEAD: `7116cb9f`.
- Status: `IN_PROGRESS / AWAITING_OWNER_RATING / UNDERPOWERED`.
- Authoring evidence: 20/20 blinded response pairs complete; owner ratings: 0/20 pending.
- Personal-note exposures: 20 allowlisted notes, recorded before author packets.
- Production/OAuth changes: 0.
- FSRS/`review_log`/grade/progress writes: 0.

## Preflight and provenance

- Д6-A portfolio research-go: PASS; no H1/H2 monitor stop condition affected C4.
- Existing `notes_v2` + `note_occurrences` data/UI prerequisite: PASS.
- Exact owner affirmation for temporary `personal.notes.read`, including external-chat retention
  acknowledgement: PASS.
- The first frozen selector run stopped honestly at `eligible=1`. The owner then explicitly asked
  for 19 additional drafts and approved them in the local review UI.
- Final exact-20 selector result: 20 eligible notes: one pre-existing owner note and 19
  `owner_approved_agent_draft` notes. This provenance is retained and materially limits external
  validity: the run is an engineering/educational smoke, not an independent test of the mature
  10K+ historical personal-note corpus.
- Dataset-bound consent receipt: PASS. Content-free hash-chained exposure ledger: 20 rows, flushed
  before note-enabled author packets were created. Consent remains revocable; revocation cannot
  remove text already delivered to an external provider chat.

## Authoring evidence

The private author packet was executed through the installed Hermes CLI with its configured native
`gemini-3.5-flash-lite` provider. Every branch used a separate one-shot process and
`--ignore-rules -t web`, preventing history, project-rule and memory carry-over between branches.
This is controlled clean-context Hermes authoring, not a proof of the ordinary WebUI personality or
future production MCP integration.

- 40/40 final responses are non-empty.
- Six first-pass quota/error strings were detected by a content-free error-pattern gate and rerun
  sequentially; none entered the final response set.
- Final set: no duplicate response hashes and no provider/error/quota markers.
- `blind` produced 20 X/Y pairs and stored the mapping separately; the evaluation payload contains
  no `with_note` label.
- A localhost-only rating UI renders answer text with DOM `textContent`, never loads the mapping,
  and writes exactly 20 validated owner choices to the ignored private directory.

All private notes, prompts, responses, mapping, ratings and consent artifacts remain under ignored
`private/` paths or the local Hermes host. No note or response content is committed to git.

## Result vs threshold

Pending owner-blind ratings. The frozen decision rule is unchanged: `DONE_GO` only if the owner
prefers the note-enabled branch in at least 14 of 20 pairs; ties count against success. No GO/NO-GO
claim is permitted before `ratings.json` is saved and scored.

Even if the numerical threshold passes, the 19/20 owner-approved-agent-draft composition must be
reported as a validity limitation; a later benchmark on genuinely accumulated high-quality owner
notes would still be required before production integration.

## Engineering gates

Expected checks from repository root:

```text
node --check docs/research/hermes-education-scaleup/rnd-c4-2026-07-25/prototype/c4-draft-review.browser.js
node --check docs/research/hermes-education-scaleup/rnd-c4-2026-07-25/prototype/c4-rating-server.mjs
node --test docs/research/hermes-education-scaleup/rnd-c4-2026-07-25/prototype/c4-benchmark.test.mjs
git check-ignore -v docs/research/hermes-education-scaleup/rnd-c4-2026-07-25/private/evaluation.json
git diff --check
```

The harness remains research-only and performs no production database, FSRS, review-log, grading,
progress, OAuth-registry or Agent Access mutation.
