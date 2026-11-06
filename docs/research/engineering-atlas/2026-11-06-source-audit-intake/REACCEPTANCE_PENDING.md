# Independent reacceptance — local preparation, publication held

**Historical preparation note, superseded:** the complete R01–R09 report has since arrived and the parent lifted the publication hold. The later user instruction defers final R05 AI content to a separate post-proofreading step. Current fixes, checks and release boundaries are in [the combined reacceptance report](../2026-11-06-reacceptance/REPORT.md). The statements below describe the earlier held preparation stage, not current release status.

Base: production 3.11.864, `753f5bef652a52057df43cccc919904fe0acee25`.
Parent instructed: do not publish/push another release until the combined independent report and further release instruction arrive. No server cleanup, deletion or production changes in this follow-up.

## AA3003, p200 — fixed locally

Target: `a97001:p200:img01:t-applications`, row 5 / col 1, cells[11].
Actual source PDF pixels inspected again: `מיכל (בריכה) לאחסון` — storage container/pool. Source does not support the previously asserted fuel/food uses in this list.

Canonical correction now directly says `ёмкости (бассейны) для хранения`, removes the fuel/food assertion and the contradictory appended qualification, and folds the already verified superlative into the main sentence. Hebrew is unchanged. General-purpose manufacturing, already present in the Hebrew/source, is explicit in Russian. Other alloy rows remain unchanged.

Local runtime corrections reapplied; a97001 search shards and trainer banks rebuilt. Search and trainer section hashes match the corrected s19 file. Search gold: 15 queries, recall@5 1.0, no misses. Reader audit: 21 sections, zero findings; correction reapplication is idempotent.

Addressed semantic regression in `scripts/atlas/tests/test_reader_corrections.py`: fails against the production correction configuration and passes against the local change; tests removal of disproved uses, presence of source storage wording, retained 20%/AA1100 qualifiers, immutable input and idempotence. All six correction tests pass.

Checks saved in `.tmp/atlas97001-source-review/aa3003-*`. Generated runtime stays under gitignored `data/atlas/a97001`; no production upload. No new release version.

## Preliminary broader findings — investigation only

The exact combined report/addresses are still pending. No claim that these are fixed:

- Spot checks confirm the reported bad explicit term references in local copies of the released data, including `p68:b004` joint, `p189:b004` mechanical reaction in electrochemistry, and `p183:b002` dimension for the idiom “to a significant extent”. All 27 addresses have not yet been supplied or adjudicated here. Avoid blanket removal or lexical replacement across legitimate mechanics occurrences.
- Confirmed section dictionary/reference counts: s01 **10/0**, s14 **13/9**, s17 **67/63**. `AtlasTrain.sectionTermItems` enumerates located item spans/loose references, while the dictionary enumerates section terms. `buildTermsIndex` populates sense places from `page.items[].terms`. The 18 dictionary terms lacking such references explain the reported gap; the proper remedy needs verified source occurrences or an honest dictionary-learning entry, not a smaller displayed count.
- No local `a97001/context-ai` layer exists. The existing W2/E5 design uses separately prepared, validated word-gloss layers; `import-context.cjs` consumes supplied answers and validates them against exact section rows/keys. The recorded 97002 layer is not interchangeable with 97001. No paid provider, external generation or data transfer has been initiated. Full scope/acceptance criteria are awaited.
- P159 currently has no user-visible statement that 32 numerical grade rows are missing from the structured text. The source-limit waiver allows release with disclosed limits; it does not substitute for a clear warning near the table. The warning and its acceptance criteria remain to be implemented with the combined work.

Production remains 3.11.864. This preparation does not close the independent reacceptance.
