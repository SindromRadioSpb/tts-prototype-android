# Solution truth and ledgers

Read for answer transcription, independent derivation, tolerance evaluation,
disagreement adjudication, or owner-authorized handwritten evidence.

## Inputs and immutable pins

Pin before solving:

- corpus slug, source edition, manifest, task and publication item identities;
- canonical condition rows and source image/PDF hashes;
- diagram page/hash and completeness status;
- answer-key filename, SHA-256, page count, page-to-task mapping, and rights status;
- declared constants and subject conventions with sources.

Do not expose owner absolute paths in agent or public artifacts.

## Separate ledgers

Maintain at least these distinct ledgers:

1. **Answer ledger**: literal final-answer transcription with source page/hash and parts.
2. **Independent solution ledger**: model, assumptions, derivation, raw result, units,
   checks, and comparison verdict.
3. **Exam solution ledger**: reviewed localized presentation of the derivation.
4. **Pedagogy ledger**: profiles and beginner explanation that cannot own solution truth.
5. **Review/disposition evidence**: who confirmed a mismatch and what was corrected.

Generated Markdown, HTML, prompts, and shards are derivatives. Edit ledgers, not
generated files.

## Answer-ledger transcription

- Inspect the page visually when extraction is unreliable or raster-only.
- Preserve part labels, inequality signs, units, significant digits, text/diagram
  references, and blanks as typed facts.
- A blank is `NO_PRINTED_ANSWER` or `ILLEGIBLE`, not an empty success.
- Record the source page and answer-key hash on every task or through an unambiguous
  pinned mapping.
- Require manual/owner review of the completed ledger before public use.

## Independent derivation

For each task:

1. enumerate source facts and requested parts;
2. state assumptions, coordinate/sign convention, process phases, and material/model
   regime where relevant;
3. select base laws or definitions and state applicability conditions;
4. derive symbolically before substitution;
5. solve equations sequentially, including domains, roots, branches, and rejected
   nonphysical results;
6. calculate with guard digits and explicit units;
7. verify dimensions and at least one independent physical/technical consistency check;
8. freeze the independent result, then compare it with the answer ledger.

Alternative methods are valuable as independent checks, not as a way to conceal a
failed primary derivation.

## Comparison and tolerances

Keep computed verdict separate from reviewer disposition.

Suggested computed verdicts:

- `EXACT`;
- `WITHIN_TOLERANCE`;
- `NON_NUMERIC_MATCH`;
- `MISMATCH`;
- `SOURCE_INSUFFICIENT`.

Store raw computed value, expected value, normalized unit, absolute/relative delta,
tolerance, and verdict. Apply tolerance only after unit normalization:

- discrete counts and exact symbolic/text claims: exact;
- decimal values: half of the answer key's last-place unit or a documented relative
  tolerance appropriate to the subject, whichever policy was approved;
- angles and instrument/measurement results: subject-specific explicit tolerance;
- inequalities: preserve the operator exactly and compare the threshold;
- graphs/constructions: structural/manual comparison, never a numeric fudge factor.

A task-specific override must cite the rounded source constant or measurement model.
Never widen a global tolerance to turn a mismatch into a pass.

Suggested dispositions:

- `OWNER_REVIEW_PENDING`;
- `OWNER_CONFIRMED_MATCH`;
- `OWNER_CONFIRMED_KEY_ERROR`;
- `OWNER_CONFIRMED_OUR_ERROR`;
- `CORRECTED_AND_REVERIFIED`.

Preserve the pre-correction evidence and link the correction. A confirmed key error
does not authorize changing the printed answer ledger; it changes the disposition.

## Handwritten evidence

Default: do not OCR or reuse handwritten solutions as the derivation source.

If the owner explicitly authorizes a bounded review:

- pin exact task, filename, hash, and allowed role;
- inspect visually when layout and sequence matter;
- record whether it corrected our solution, verified a result, or supplied presentation
  experience;
- do not generalize access to other handwritten files;
- rerun derivation, comparison, exam, pedagogy, and artifact gates for affected tasks.
