# Epic-6 Authority Spike (2026-06-30)

**What this is.** A measure-before-code verification spike for the Эпик 6 *build-once architecture* (curated library). It checks, on the **real shipped data**, the load-bearing claims of the blueprint in `docs/planning/BRR_EPIC6_CURATED_LIBRARY_2026_06_30.md §6` **before** any producer/UI code is written. No code shipped; read-only.

**How it was generated.**
- Source command: `node docs/research/epic6-authority-spike/2026-06-30/spike.js`
- Source commit: `dffa9d8` (run `git rev-parse HEAD` at review time)
- Inputs (shipped artifacts, not regenerated): `public/data/benyehuda/corpus-index-v7.json` (per-era author index) + `public/data/benyehuda/author-era-map-v1.json` (QID → era/birth/death/floruit).

**Files here.**
- `report.md` — **READ THIS** (human-readable findings).
- `report.json` — machine-readable findings.
- `candidate-authors-sample.json` — top-40 of the candidate QID-keyed author-node sidecar (proves the node is buildable). Sample/preview, not the production sidecar.
- `spike.js` — reproducible script (re-run to refresh).

**Status.** Derived analysis (computed, not hand-annotated). Disposable as code; the *findings* greenlight the build.

**Key results (see report.md for detail).**
- Identity: 1203 author rows · 866 with QID · **337 name-only** (honestly can't be nodes) · **847** distinct QID nodes.
- Fragmentation: **14** QIDs span >1 row — **12 are co-authored works** (composite name + first author's QID), **1 is the `Q0` sentinel** wrongly merging **7 distinct unidentified humans** (must be excluded from node-keying — a real finding the spike caught).
- Free dates: **95.9%** (812/847) of QID author nodes are datable **offline today** (covering **23,601** works) — confirms author-page dates are a *promote-what-we-have*, **not** an online-Wikidata dependency (corrects the recon §2 stale claim).
- Richness `birth/death/floruit/confidence/source` is computed then dropped at `build-corpus-catalog.js:150` (reads only `.era`).
