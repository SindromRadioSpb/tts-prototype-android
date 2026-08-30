# Materials PB2 — canonical repair and local bake

Current status: `PASS_LOCAL_CANONICAL_TEXT_VISUAL_CORPUS_NOT_IMPORTED_NOT_PUBLISHED`.

The opening sections below preserve the preflight history. The approved finite
execution later completed all six batches and 642 repair rows. The final local
bundle contains 60 tasks, 693 rows, and 72 source/reference assets; two
consecutive bakes were byte-identical. See
`CANONICAL_CORPUS_COMPLETION_AUDIT.md` and
`canonical-corpus-completion-audit.json` for current evidence.

The offline preflight prepared six raster-sanitized PDFs, six exact candidate
payloads, and six strict request blueprints for 59 tasks / 642 blocked rows. All
77 PDF page exposures rendered back successfully, and all six contact sheets
were visually reviewed. Source pages are canonical; legacy columns remain
comparison evidence only.

Two consecutive rebuilds were byte-identical for all six PDFs and request
blueprints; `preflight/determinism-verification.json` binds their hashes to the
preflight manifest.

The all-batch contact-sheet review found three additional boundary defects after
the immutable two-pass Build had closed:

- q021 continues at the top of source page 28;
- q022 must exclude that q021 continuation;
- q028 must exclude the q027 continuation at the top of source page 36.

They are recorded in `preflight/source-anchor-repair-ledger.json` and applied only
to the repair payloads. Historical Build evidence was not rewritten and no third
Build pass was created.

At the preflight checkpoint the provider had not been called. The later approved
execution used 9 receipted responses and 10 call starts, remained below both
approved ceilings, and persisted no secret. Solutions, audio, import, and
publication remain outside this program.

After approval, `scripts/premium/apply-materials-science-pb2-canonical-repair.py`
enforces the exact token, 12-call / $2.00 ceiling, immutable raw-cache resume,
one repair attempt per batch, and strict local four-column validation. Once all
six batches pass, `scripts/premium/bake-materials-science-pb2-canonical.py`
creates the offline LinguistPro bundle with materialized source/diagram assets
and deterministic ZIP read-back; it cannot import or publish it.

The complete executor-to-bake mechanism has also passed a temporary synthetic
cache rehearsal; see `CANONICAL_PIPELINE_SYNTHETIC_REHEARSAL.md`. That rehearsal
proves mechanics only and does not promote synthetic text into corpus truth.

The historical blocked audit is recorded in
`GOAL_BLOCKED_AUDIT_2026-08-30.md`; its approval gate was cleared on 2026-08-30.
The current completion claim is limited to the local text+visual corpus. Audio,
karaoke timing, solutions, Studio persistence, and publication remain separate
owner gates.
