# Word-status palette redesign + why `על` / `בנימה` aren't coloured (measured)

**Date:** 2026-06-27 · **Status:** ✅ SHIPPED+PROD (v3.11.11). Owner-requested measure-before-code investigation + premium palette.
**Surface:** `public/library.html` (palette), `public/js/library-ui.js` (legend), locales. Room-only; resolver + notes-autogen UNTOUCHED.

## Source of truth (before)
- Colours lived in `library.html` CSS, hard-coded in 3 places: `.rm-w-*` (table words), `.rm-status-btn.rm-status-*` (card buttons), `.rm-fam-*` (family chips). Status→class mapping in `reader-morph.js` (`STATE_CLASS`/`FAM_STATE`/`STATUS_OPTS`).
- Problems: l1–l4 were all the SAME amber (only alpha differed); `known` was `transparent` → blended with plain/untracked/unconfident words; `ignore` was transparent+dotted (too subtle).

## Measured: why `על` and `בנימה` are NOT coloured (row «ועברה על לבי, ונגעה בנימה,»)
Resolved each token via `resolveCore` (harness `scripts/.../color-investigate.js`):

| token | coloured? | label | functionGate | lemmaKey |
|---|---|---|---|---|
| ועברה / לבי / ונגעה | ✅ | exact | — | pid:1441 / 4353 / 1140 |
| **על** | ❌ | **function** | FUNC/particle | על#particle |
| **בנימה** | ❌ | **unknown** | — | בנימה# |
| **נימה** (bare lemma) | ❌ | **unknown** | — | נימה# |

**Neither is a colouring bug — both are correct honest-gate behavior:**
- **`על`** = preposition/particle → `functionGate` → label `function` → fails the confident gate (`decorateWords` colours only `exact|likely` content words). Intentional.
- **`בנימה`** = NOT a proclitic/keying issue: the bare lemma **`נימה` is absent from the 9279-paradigm offline dataset** (confirmed across all niqqud variants + a dataset scan returned `false`). So it resolves `unknown` → honestly not coloured (we don't fabricate a status for a word we can't identify). The owner's hypothesised "match via canonical `נימה`" fix would NOT help — `נימה` doesn't resolve at all.

**Conclusion:** the perceived problem is legibility, not a bug. Fixed by documenting it in the status legend (colour goes to confidently-recognized learning words; function + dictionary-miss words stay plain) — owner chose to keep them plain (no neutral visual noise; LingQ also leaves function words unhighlighted).

## Shipped
**v3.11.11 (temperature palette) — superseded:** soft pastel chips, hues amber/orange/lime/teal. Owner feedback: «всё-равно сливается» (adjacent temperature steps too close; pale fills too subtle).

**v3.11.12 (Anki-style distinct, FINAL):** owner reference = the Anki review buttons (red/orange/green/blue, solid). 
- **Single source of truth:** `--ws-{state}` (SOLID hex, theme-independent) for card chips / popover / legend dots; `--ws-{state}-fill` (rgba, light + brighter dark) for in-text word backgrounds (Hebrew stays readable). Family chips use the solid as a left border.
- **Well-separated hues (NOT a ramp):** new=**violet** · 1=**red** · 2=**orange** · 3=**green** · 4=**blue** (Anki) · known=**teal** · ignore=**slate**. All 7 obviously different.
- Card status buttons are **Anki-style SOLID chips with white text** (the referenced look); active = white inset ring + outline (clearly selected); hover brighten; focus-visible outline (a11y). In-text fills are the same hues at ~28–34% alpha.
- **Owner forks (approved):** new=untracked=blue (no data-flow change; explicit-new-vs-unset distinction → backlog, needs storage+reset semantics) · function/unknown stay plain + documented.
- **Legend:** visible swatch row in the aids panel (mobile-legible) + updated `room.morph.statusHint` + new `room.morph.statusNote` (ru/en/he).
- **Gates:** `smoke:reader-morph` (+status→class mapping for 8 states + the `על`/`בנימה` row regression) · reader-parity/scaffold/notes/word-status/context · i18n 226/0. @380px light+dark verified.
