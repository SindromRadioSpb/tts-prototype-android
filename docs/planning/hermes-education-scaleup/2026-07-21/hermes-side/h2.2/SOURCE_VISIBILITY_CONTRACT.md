# H2.2 source-visibility contract

Owner-approved on 2026-07-23. This is a permanent product invariant for Hermes and
`get_text_coverage`, not a temporary smoke fixture.

The tool supports **both source classes**:

1. `target.work_id` — the complete baked public-domain work from the Project
   Ben-Yehuda corpus, across all of its chapters.
2. `target.text_key` — the complete owner-synced personal text. This path requires
   `learner.coverage.read`, current personal-text sync consent, and the same active
   per-connection text grant as `get_personal_text_content`.

Hermes must never claim that coverage is available only for one of these classes.
`COVERAGE_UNAVAILABLE` is allowed only for the particular requested text when its
body cannot be deterministically tokenized/resolved or learner projection cannot be
read. It is not permission for a blanket refusal of personal texts or Ben-Yehuda.

Coverage returns aggregates and unknown lemmas only. It does not return source
bodies, grades, answer keys, raw FSRS fields, or create learner-state writes.
