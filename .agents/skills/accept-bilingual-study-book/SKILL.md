---
name: accept-bilingual-study-book
description: Bring a supplier-translated bilingual study book (Hebrew source + Russian study layers, like the engineering atlas a97002) to a mature, accepted state in the Reading Room — quality standard, whole-book audit, page-by-page visual acceptance against the scan, editor corrections of the supplier data that survive rebuilds, and a safe publish. Use when a new book/section batch arrives from the supplier, when the owner reports a defect on one page, or before calling such a material "done".
---

# Accept a bilingual study book (атлас 97002 и подобные)

Lesson that created this skill (2026-10-31): checking *classes* of defects with scripts and looking at one
section is not acceptance. The owner found a 🎯 pictogram on p62 that the class checks missed. Acceptance =
**every page looked at**, beside the scan of the book, after the automatic audit is clean.

## 0. Ground rules
- The supplier's data is never edited by hand in published JSON. Every data fix is an entry in
  `scripts/atlas/corrections/<atlas>.json`, applied by `scripts/atlas/reader_corrections.py` on every build
  (`build_reader_data.py` calls it) and to already published data. Running it twice changes nothing.
- Presentation fixes (how the reader shows supplier data) go to `public/js/atlas-reader.js`, never into data.
- Local copies of book data live only in the repo folder `data/atlas/<atlas>/` (gitignored, volume-first);
  acceptance shots in `.tmp/atlas-acceptance/`. Nothing on the system drive temp.
- Checklist: `docs/planning/ENGINEERING_ATLAS_QUALITY_STANDARD.md` (A blocks release). Extend it when a new
  defect class appears.

## 1. Automatic audit (must be 0 findings)
```
node scripts/atlas/audit-reader.cjs data/atlas/a97002
```
Covers: empty/duplicate blocks, junk figures, supplier words on screen («редакционное описание», bbox, source_text),
raw LaTeX, `undefined/NaN`, legends repeating labels, unclassified small pictures.

## 2. Supplier-data defects to look for in every new batch (all were real in a97002)
| Defect | How it shows | Fix |
|---|---|---|
| Margin pictograms as tiny unnumbered figures (👍 👎 ❗ 🎯, tolerance signs ⌖ ∥ ⊥) | stray pictures at page end; label only in words («мишень со стрелой», «палец вверх») or no label | reader `markOf()` by label/description; unlabelled icons by figure id in `MARK_BY_FIGURE` after a contact sheet of all small figures |
| Two marks over one merged block | second mark lost | group shows both labels |
| Block holding two texts (list item + paragraph after ❗; last «Недостатки» item + «Итог»; table line + «הערה») | wrong grouping, hidden note | `structure` → `replace` with explicit parts (he, he_niqqud, translit, translit_ru, ru, y) |
| Table repeated as text: «;»-joined cells, number lines, cell values as «formulas», «= = = =» columns | duplicates around the table | reader hides on the fly; whole-page copies → `structure` → `drop` |
| Heading split («(Flatness» + «)», «rinding)» + «(G») | broken heading | reader rejoins «)»; otherwise `structure` → `set` |
| Lost spaces in Russian («таблице303», «силаF», «вrpm», «жёсткостиверхнейинижнейпары») | glued words | text RULES in `reader_corrections.py` + reviewed `glued` dictionary (step 3) |
| Supplier process remarks in labels, titles, notes («(так напечатано)», «Печатное равенство…», «Числового примера здесь нет») | noise in the reading text | `cleanMeta()` / `noteParts()` move them to «Заметки редактора» |
| Formula without MathML (KaTeX error, e.g. `\\[` read as row spacing) | raw code | fix `render-math.cjs`; `reader_corrections.py --mathml` |

## 3. Glued words: dictionary proposals, reviewed by eye
```
python scripts/atlas/propose_glued_splits.py data/atlas/a97002 .tmp/atlas-acceptance/glued.tsv
```
pymorphy3 proposes splits of unknown words. **Review every line**: real long words the dictionary lacks
(«износостойкость», «нахлёсточное», «квалитет», «Тетмайера», «зенкование») are rejected; wrong cuts
(«егора счёта») are written by hand. Accepted entries → `corrections/<atlas>.json` → `glued`. After applying,
rerun: what remains must be only the rejected real words. Notation with Cyrillic subscripts (nсреза, Aобщ) and
units (кН, кВт, даН) must stay — the tests in `tests/test_reader_corrections.py` guard them.

## 4. Visual acceptance — every page
```
node scripts/atlas/visual-acceptance.cjs <base url> .tmp/atlas-acceptance/<run> --assets https://linguistpro.kolosei.com
python scripts/atlas/visual-strips.py .tmp/atlas-acceptance/<run> <first> <last>        # 7 pages per image
python scripts/atlas/visual-sheets.py .tmp/atlas-acceptance/<run> data/atlas/a97002 <p> <p>   # scan | PC | phone
```
Look at every strip; open scan sheets for complex pages (tables, many figures, marks). Write a verdict per page
range to `docs/research/engineering-atlas/acceptance/<date>-*/journal.md`: OK / FIX (rule, release) / DATA.
A defect seen once is a class: grep the whole book for it before fixing (the 🎯 lived on 6 pages).
The capture retries sections on Windows socket exhaustion (`ERR_NO_BUFFER_SPACE`); restart only failed sections.

## 5. Publish
1. Tests: `npm test`, `node tests/i18n.smoke.js`, `node --test tests/atlasReader.test.js`,
   `cd scripts/atlas && python -m unittest discover -s tests` (KaTeX: `NODE_PATH` to a node_modules with katex).
2. Data → volume (owner's permission for writes): pack `data/atlas/<atlas>/sections`, copy to the server,
   **back up** the live `sections` to `atlas/<atlas>-sections-backup-<date>` first, install, `chown` inside
   `sudo sh -c` (a plain shell cannot expand the volume glob), verify a section over HTTPS. JSON is cached 5 min.
3. Code → `main` = a deploy. **Before every deploy: safe cleanup** on prod (`docker builder prune -af`; remove
   app images older than current + previous; keep both for rollback unless the owner allows otherwise) and
   check `df -h /` — a build needs ~4–5 GB free; at <3 GB Coolify fails (500). Version lockstep: CACHE_VERSION,
   APP_VERSION, `?v=` of atlas-reader js/css, i18n lock (`node tests/i18n.smoke.js --write-lock`).
4. After the deploy: cleanup again, verify the fixed pages on the live site (PC + 390 px, no horizontal scroll).

## 6. Report to the owner
What was looked at (page ranges), what was fixed (classes, pages), what is left as DATA for the supplier,
what only the owner can check (proofreading checkbox, real printer).
