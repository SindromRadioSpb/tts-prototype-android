# Epic-6 Wave-2 (T6) — author bios

> **✅ APPLIED 2026-06-30 (v3.11.60, `6a43f5f`).** All 11 drafts were owner-approved and moved into the live store `public/data/benyehuda/corpus-editorial-v1.json` (curator=owner); `CORPUS_AUTHORS_DATA_REV`→2; prod-verified rendering on the author-landing pages. This file is kept as the provenance record of the draft→approve. The **excluded** authors (politically-charged + niche, listed below) remain for future owner authoring.

---

## (original review brief) DRAFT author bios for review

**What this is.** A DRAFT batch of curated author one-liners + short bios for the Reading-Room **author-landing header** (Epic 6). It exists so the editorial-content track starts as *approval*, not authoring: the assistant pre-drafted the well-established canon figures; **you review/edit/approve**, then they drop into the live store as data.

**This is NOT live.** Nothing here is shown to users. The live store (`public/data/benyehuda/corpus-editorial-v1.json`) stays empty until you approve entries (R1 — curated ≠ assistant-asserted).

## Files
- **`draft-bios.json` — the file you review/edit.** Entries keyed by Wikidata QID, in the `editorialMeta` author shape (`one_line`, `bio_md`, `curator`). `_`-prefixed fields (`_display`, `_dates`, `_confidence`) are review-only and ignored on import. `era` is intentionally omitted (the derived era is already correct — don't override).
- `README.md` — this file.

## How it was generated
Author list: `public/data/benyehuda/corpus-authors-v7.json`, top readable canon by `ready`-count with real dates + modern-ish era (source command in the session). Bios: written by the assistant from **well-established encyclopedic facts** + the **shipped Wikidata dates/era**. Source commit: `d4086e4`.

## R1 / honesty
Each draft carries `curator: "DRAFT — verify before approval"` and a `_confidence` flag. **Verify each before approving** — correct anything, delete anything you're unsure of. The bios state established facts only; no work-specific claims were invented.

## Scope — deliberately limited (the rest is yours to author)
Pre-drafted: **11 best-established literary-canon figures** (high confidence: Bialik, Tchernichovsky, Ahad Ha'am, Berdyczewski, Frischmann, Y.L. Gordon, A.D. Gordon, Hannah Senesh, S. Yizhar; medium: Elisheva, Asher Barash).

**Deliberately NOT drafted** (R1 — left for you to author with sources):
- **Politically-charged figures** (e.g. Avraham Stern «Yair» Q461846, Avshalom Feinberg Q64573) — their framing is an editorial/owner decision, not an assistant draft.
- **Less-famous / niche authors** from the ready-list (e.g. Solodar, Shomroni, A. Kahana, A. Aharonson, E. Kaplan, Silberstein, Shalmon, Kushnir, Avinor, Lavyatov) — insufficient encyclopedic certainty to draft honestly.

These appear on the author-landing pages today **without** a bio (the slot self-hides) — perfectly honest; add them as data whenever you author them.

## How to apply (on approval) — zero code/UI change
1. For each approved author, copy `one_line` / `bio_md` (drop the `_`-fields) into `public/data/benyehuda/corpus-editorial-v1.json` → `authors[QID]`; set `curator` to your name.
2. Bump `CORPUS_AUTHORS_DATA_REV` in `public/js/library-ui.js` (so `force-cache` serves the new content to returning users).
3. `npm run smoke:corpus-editorial` + the Room gate set; version-triad bump; commit + push (Coolify deploy); prod-verify.

That's it — the render slot (`buildAuthorHeader` → `one_line` + `bio_md`) is already live. Adding the 1st or the 500th bio is the same one-data-edit cost.

> Note: `entry_points` / `why_read` / `collections` are *merged* by the precedence guard but have **no render slot yet** — they need a small UI increment before their content can drop. Author bios (`one_line`/`bio_md`) are the only zero-code drop today.
