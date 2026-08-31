# Materials PB2 — formula speech review guide

Status: `271 ROWS / 222 EXACT DISPLAY FORMS PENDING`

The full-corpus TTS release cannot pronounce raw formula notation. Review is
performed once per exact display form and then expanded only to the rows listed
under that same item. Similar-looking formulas are never merged.

## Review file

Open `formula-speech-unique-review-pack.json` in an editor with JSON support.
The pack contains 226 unique exact display forms:

- 4 already approved for Task 1;
- 222 pending forms covering the remaining 271 rows.

For every pending item:

1. Read `display_he_niqqud` and every object in `occurrences`.
2. Confirm that one spoken form is correct in every listed context.
3. Enter fully spoken, vocalized Hebrew in `spoken_he_niqqud`. Do not leave raw
   Latin/Greek symbols, operators, powers, decimal separators or unit symbols.
4. Set `status` to `REVIEWED_PASS`.
5. Set `reviewed_by` and an ISO-8601 `reviewed_at` timestamp.
6. Use `note` for any context or pronunciation decision that another reviewer
   may need to understand.

Stop and split the exact display form into a more specific decision if one
spoken form is not correct for all listed occurrences. Do not approve it by
analogy.

## Apply without overwriting the canonical ledger

```powershell
node scripts/premium/materials-pb2-tts.js apply-formula-review-pack `
  --ledger docs/research/materials-science-problem-solutions/2026-09-01/tts/formula-speech-review.json `
  --pack docs/research/materials-science-problem-solutions/2026-09-01/tts/formula-speech-unique-review-pack.json `
  --output .tmp/materials-pb2-formula-speech-reviewed.json
```

Expected output after complete review: `reviewed_count: 275`.

## Full no-synthesis preflight

```powershell
node scripts/premium/materials-pb2-tts.js preflight `
  --ledger .tmp/materials-pb2-formula-speech-reviewed.json `
  --rights docs/research/materials-science-problem-solutions/2026-09-01/tts/full-tts-rights-attestation.owner.json `
  --output .tmp/materials-pb2-full-preflight.json
```

Expected result: `ready: true` and all four gates (`rights`, `formula_speech`,
`cost`, `secret`) equal `PASS`. If the command exits non-zero or no output file
is created, do not run `bake` and do not publish.
