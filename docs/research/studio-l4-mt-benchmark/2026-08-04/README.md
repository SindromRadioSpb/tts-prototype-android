# Studio L4.0a MT benchmark — execution record

Ledger authority: step 3 of
`docs/planning/HEBREW_NLP_RESOURCES_OWNER_DECISIONS_2026_08_04.md`.

Current status: **IN PROGRESS / NOT A VERDICT**. Machine preparation and
candidate smoke checks are complete. A DONE verdict is prohibited until all of
the following exist:

1. official gated FLORES+ v4.6 devtest in he→ru and ru→he;
2. owner-supplied Russian references for all 200 in-domain rows;
3. complete five-system inference outputs and chrF++/spBLEU metrics;
4. supplementary CometKiwi signal;
5. owner-completed blind evaluation of at least 40 randomized source segments,
   including missing/added meaning and pedagogical suitability;
6. final table, local-winner verdict, and honest comparison with Gemini.

No files in this packet change Studio defaults, production ASR, learner data,
or production services. Hy-MT2 uses an isolated dependency overlay; the
production `ai-local` environment remains unchanged.

## Frozen execution choices

- Gemini ceiling: stable `gemini-3.6-flash`, matching the actual model already
  evidenced by the repository on 2026-07-30. A moving `*-latest` alias is not
  used for this benchmark.
- Hy-MT2-1.8B: exact upstream revision, FP16, deterministic greedy decoding for
  evaluation. Hy-MT2-7B is omitted because it would add a second heavyweight
  path and complicate the main run on an 8 GB GPU.
- FLORES+ remains local/gated evaluation data. Raw rows are not committed; only
  hashes, version, revision, license and run metadata may be committed.
- NLLB is research/gate-only because its CC-BY-NC-4.0 license is not a
  production enablement decision.

See `candidate-manifest.json` for exact revisions, licenses and local artifact
checksums. Commands and completion evidence will be appended only after the
mandatory gates above are satisfied.
