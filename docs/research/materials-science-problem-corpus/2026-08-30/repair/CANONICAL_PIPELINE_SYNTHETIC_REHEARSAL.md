# Materials PB2 — canonical pipeline synthetic rehearsal

Status: `PASS_MECHANISM_ONLY_NOT_CORPUS_TRUTH`.

`python tests/materialsSciencePb2CanonicalPipeline.test.py -v` passed in 24.999
seconds. The test copied the current program workspace into a temporary
directory, supplied six structurally valid synthetic raw-cache responses, and
ran the production resume/validation path without a credential file or a live
provider call.

The same temporary run then baked the complete 60-card / 693-row LinguistPro
bundle twice. The ZIPs were byte-identical, all source and reference assets read
back by hash, and no audio or solution assets appeared. Neither ZIP was retained,
imported, or published.

This proves executor, resume, validator, asset materialization, deterministic
bake, and ZIP read-back mechanics. Synthetic rows are explicitly not corpus
truth and cannot satisfy the 59-task source-review gate. A real owner-approved
Gemini repair remains required.
