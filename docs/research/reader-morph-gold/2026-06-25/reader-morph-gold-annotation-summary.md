# Annotation summary — reader-morph-gold-worksheet

Prepared file: `reader-morph-gold-worksheet_ANNOTATED.tsv`

## Coverage

- Total rows: 180
- Rows with `gold_pos` + `gold_lemma`: 172
- Rows marked `verdict=skip`: 8
- Rows marked `ambig`: 0

## Skipped rows

These rows were marked `skip` because the target token was not visible in the provided `sentence` context; the context appears truncated before the judged token.

| row | id | reason |
|---:|---|---|
| 7 | `10::r7::מעליו` | target not visible in truncated sentence context |
| 8 | `10::r7::המניעים` | target not visible in truncated sentence context |
| 9 | `10::r7::המת` | target not visible in truncated sentence context |
| 54 | `10::r7::אות` | target not visible in truncated sentence context |
| 55 | `10::r7::יתר` | target not visible in truncated sentence context |
| 56 | `10::r7::לאותו` | target not visible in truncated sentence context |
| 57 | `10::r7::החכם` | target not visible in truncated sentence context |
| 71 | `218::r6::מעצמנו` | target not visible in truncated sentence context |

## Notes

- I followed the controlled `gold_pos` vocabulary from the legend.
- Verb lemmas were written as citation forms rather than copied from `offline_lemma` when the resolver used an infinitive-style value.
- Some joined compounds/tokenization artifacts were kept as judgeable when the meaning was clear, for example `עלילתהדם` → `noun`, lemma `עלילת דם`, with a note.
- Run the repository scorer after replacing the raw worksheet with this annotated TSV:

```bash
npm run gold:score
```

or explicitly:

```bash
node scripts/premium/reader-morph-audit.js --gold=docs/research/reader-morph-gold/2026-06-25/reader-morph-gold-worksheet.tsv
```
