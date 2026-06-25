# R1 Gold Worksheet — annotation legend

Goal: measure the **true** precision of the tap-morphology resolver on **archaic, vocalized**
Hebrew (baked Ben-Yehuda), independent of the Dicta silver oracle (which is circular and
drifts on archaic text). You provide the human gold; the scorer compares the resolver to it.

## How to fill
Open the `.tsv` in a spreadsheet (Excel/Sheets/LibreOffice) — it's UTF-8 with BOM so Hebrew +
niqqud render correctly, RTL per cell. For each row read `niqqud` (the form being judged) in
the `sentence` context, then fill **only**:
- **gold_pos** — the correct part of speech in context (vocab below). *Required* to score a row.
- **gold_lemma** — the correct dictionary citation form. Niqqud optional (compared
  niqqud-insensitively — only the consonants must be right). For verbs: 3ms past (קָטַל-pattern,
  Pealim convention); for nouns: absolute singular. Leave blank if you only want to judge POS.
- **verdict** / **note** — optional (see below).

You do NOT need to fill the reference columns (offline_*, nakdan_pos, stratum) — they're the
machine guesses you're adjudicating. Annotate in any order / in batches; the scorer counts only
filled rows and reports coverage X/N.

## gold_pos vocabulary (controlled)
Write the precise tag; the scorer also coarsens it for the headline.

| tag | coarse class |
|---|---|
| `verb` | verb |
| `noun` | nominal |
| `adjective` | nominal |
| `participle` | nominal *(beinoni; tag the surface category — Dicta cross-tags these)* |
| `propernoun` | propernoun *(personal/place name — kept distinct, matters for F6)* |
| `numeral` | numeral |
| `pronoun` | function |
| `adverb` | function |
| `preposition` | function |
| `conjunction` | function |
| `particle` | function *(article, question/negation/relativizer, etc.)* |

The **headline** precision compares at the coarse level (verb / nominal / propernoun / numeral /
function) — the axis the «точно» badge actually hinges on. A separate strict-string POS match is
also reported.

## verdict (optional — leave blank for normal rows)
- *(blank)* — scorer derives correctness from gold_pos (+ gold_lemma). Use this for most rows.
- **ambig** — *first-class*: both readings are genuinely valid in this context. The resolver is
  then expected to **hedge** (not say «точно»). A hedged card on an `ambig` token = correct honesty;
  an «exact» card on it = false certainty.
- **skip** — *first-class*: unjudgeable (OCR garbage, truncated form, not really Hebrew). Excluded
  from all rates; counted separately in coverage.
- **ok** / **badpos** / **badlemma** / **badboth** — optional manual overrides if you'd rather state
  the verdict directly than have it derived.

## What the scorer reports (`gold:score`)
- **precision of «exact»** — of cards labeled «точно», fraction actually correct vs gold. The headline.
- **honest-degradation recall** — of wrong/ambiguous tokens, fraction the resolver did NOT call «точно».
- **over-hedge rate** — of hedged cards, fraction that were actually *uniquely* correct (= moat value we
  left on the table by hedging). Only gold can measure this.
- **lemma accuracy** — POS-right-but-lemma-wrong still gives the wrong root family/table (R1).
  Verb-citation-aware: the resolver cites the INFINITIVE (ללכת) while you cite 3ms-past (הלך);
  verbs are matched on ROOT (bidirectional subsequence, weak-letter tolerant) so the convention
  gap isn't mis-scored. A strict-string lemma rate is also reported for transparency.
- **Nakdan-silver ↔ gold agreement** — quantifies how trustworthy Dicta is on archaic Hebrew, i.e.
  retroactively validates/discounts every prior silver-based number (incl. Epic 1's 90.3%).
- per-stratum + per-label breakdown; list of «exact» cards gold contradicts.

## Columns
`id` stable join key · `work`/`row_id` source · `surface` consonantal · `niqqud` vocalized form judged ·
`sentence` vocalized context line · `offline_*` the resolver's reading (pos/lemma/root/meaning/label) ·
`offline_alts` other readings it considered (`pos:meaning`) · `nakdan_pos` Dicta silver (reference, NOT
truth) · `stratum` which sampling bucket · `gold_pos`/`gold_lemma`/`verdict`/`note` ← you fill.

## Strata (why a row was picked)
- **collision** — «exact» sitting on a multi-id homograph cell (should be ~0 post-Epic-1; verify).
- **tail** — «exact» that the silver contradicts (content→function / participle→noun / name).
- **hedged** — «вероятно»/guessed multi-reading cells (calibration: are we right to hedge?).
- **control** — clean «exact» (catch systematic lemma errors on easy cases).
- **fill** — remainder, to round out N.

> Sampling is deliberately homograph-weighted, so the overall numbers are NOT corpus base-rates —
> read precision **per stratum**.
