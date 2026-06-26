# Tier-3 context override silently degrades correct, corpus-grounded readings (בקר → «скот»)

**Date:** 2026-06-26 · **Status:** ✅ **SHIPPED+PROD** (v3.11.6, `81575f7`). Owner chose Option 1 (precedence guard) + embed R11 + Dicta-independent gate. Fix verified e2e @380px + prod Node-fetch; `smoke:reader-tier3-regression` = 0 overrides. Role R11 in `docs/PROJECT_ROLES.md` + `CLAUDE.md`.
**Severity:** P0 honesty regression on moat #1 (tap-morphology). **Surface:** `public/js/reader-morph.js` (`pickContextReading` / `resolveWordLight` Tier-3 path). **Room-only.**

> **What this folder is.** A reproducible investigation of a user-reported tap-card bug. Generated 2026-06-26 from main `65d8e98`. `quant-harness.js` = the measurement script (run via `node quant-harness.js`, boots library.html + live Dicta). `quant-result.json` = its raw tally (small network-bounded sample). This `FINDINGS.md` = the analysis + proposed new role + fix options. Nothing here is shipped code; it informs the decision.

---

## 1. The bug (user-reported, reproduced)
Corpus line «וּנְגֹהוֹת בֹּקֶר חִישׁ…» («and the morning's brightness…»). The niqqud column shows **בֹּקֶר** (*boker*, morning) — correct, matching the «утро» translation. Tapping the word opens a card showing **בָּקָר** (*bakar*, cattle / «крупный рогатый скот»), badge **«контекст (Dicta)»**, with a DIRECT Pealim link to the wrong lemma (`9185-bakar`). The card's vocalization, gloss, and link all **contradict the niqqud column the reader is looking at.**

## 2. Mechanism (confirmed empirically — see `quant-harness.js`)
1. **Offline, from the corpus niqqud בֹּקֶר → `exact`, «утро», pealim_id 4235.** The offline resolver already produces the RIGHT answer, decisively. (בֹּקֶר *is* in the 9279-paradigm dataset.)
2. The reader's Tier-3 «точный режим» sends the **unvocalized** line `row.he` to Dicta (`onActivate` → `contextProvider`). **Live Dicta returns בָּקָר** (cattle) for the unvocalized token — wrong for this archaic-poetic register (Dicta picks the higher-frequency homograph).
3. `resolveCore(surface, dictaNiqqud=בָּקָר)` → `ctxCard` = cattle, `exact`, pealim_id 9185.
4. **`pickContextReading` path (A)** fires: `ctxCard` decisive (exact) + Dicta POS `noun` = ctxCard POS + `pealim_id` differs from offline → returns **`{use:"context"}`**.
5. `resolveWordLight` does **`card = ctxCard`** → the card is REPLACED wholesale: vocalization בֹּקֶר→בָּקָר, gloss утро→скот, label→«контекст», `ambiguous=false` so the F5 enrichment-gate does NOT fire → direct authoritative link to the wrong lemma.

**Path (A) has no guard on the offline reading's confidence.** It overrides even an `exact`, corpus-niqqud-grounded reading, trusting a live single-sentence Dicta guess over the edition's vocalization that the user sees.

> Subtle but important: feeding Dicta the **vocalized** sentence makes it return בֹּקֶר (correct). The app feeds the **unvocalized** sentence (+ genre `modern`), and Dicta returns בָּקָר. So the override is driven by Dicta's archaic-register weakness on bare text — exactly the corpus (Ben-Yehuda canon) where it is least reliable.

## 3. Why prior research missed it — the measurement blind spot
Tier-3 was validated by `smoke:reader-morph:audit --tier3`: «exact» precision **vs the Dicta silver oracle**, reported «0/766 regressions». But **the override source and the oracle are the SAME Dicta.** When Dicta mis-reads בקר as cattle, the override produces cattle AND the oracle scores cattle as «correct». The oracle is structurally blind to the feature's own errors. The «never regress» claim in `pickContextReading`'s comment was only enforced on the verb↔noun POS axis (path C soften), never on same-POS vocalization homographs where offline was already decisive.

**This is the core lesson for a new role (below): never validate a feature with the same source the feature trusts; measure harm on the already-correct HEAD, not just gain on the tail.**

## 4. Quantification (independent of the Dicta oracle)
`quant-harness.js`: 48 baked rows / 8 works → 85 content tokens. Classify each by whether Tier-3 path (A) overrides the offline reading, using the **corpus niqqud** (not Dicta) as the grounding.

| | count |
|---|---|
| content tokens | 85 |
| offline-`exact` | 72 (85%) |
| **path-(A) override of offline-`exact`** (regression-exposed) | **1** (1.4% of exact) |
| path-(A) override of offline-NON-exact (intended benefit) | **0** |
| soften (C) / gloss-demote (B) / offline-kept | 8 / 1 / 74 |

The one override that fired is itself a regression: `שָׁמְנוּ` (grow fat, verb) → `שְׁמֵנוּ` («имя»). **Intended benefit fired 0×; the only firing was harm.** Because offline-from-corpus-niqqud is already `exact` ~85% of the time, path (A) almost never *fixes* an unresolved cell — it almost only *overrides a correct one*. (Sample is small / network-bounded — it establishes DIRECTION and order-of-magnitude, not a precise rate. The architectural argument in §2–§3 is the stronger basis.)

**Note:** the flagship context win — הַיּוֹם→«сегодня» (`smoke:reader-context`) — is path **(B)** (Dicta says *function* POS → demote+gloss), NOT path (A). Paths (B) function-demote and (C) participle-soften only DEMOTE/annotate; they never assert a new wrong content reading. **Only path (A) can flip a correct reading to a wrong one.**

## 5. Proposed new role — R11 (PROPOSAL, owner to confirm before embedding)
Prior lenses (R1 lexicographer, R10 comp-morphologist, R9 provenance) each audit the correctness/honesty of ONE reading in isolation. None audits **whether an enhancement degrades an already-correct reading**, **cross-surface consistency**, or **oracle independence**. Hence the repeated miss.

**R11 — Регрессолог-текстолог (Do-No-Harm & Source-of-Truth adversary).** Mandate: every enhancement mode (Tier-3 context, gazetteer, future re-niqqud) must be **net-monotonic** — it may add information but never turn a correct, grounded reading into a wrong one. Four tenets:
1. **Source precedence.** The corpus niqqud (what the reader sees; baked with full-work context) outranks a live single-sentence Dicta re-vocalization. Enhancements add; they don't overwrite the grounded reading.
2. **Cross-surface consistency.** The tap-card must never contradict the niqqud column / translation the reader is already looking at. Inconsistency is itself a P0 (trust erosion on the moat).
3. **Oracle independence.** Never measure a feature's safety with the same source the feature trusts. Dicta-trusting features need a Dicta-independent oracle (corpus niqqud, human gold).
4. **Adversarial head-regression.** Measure harm on the HEAD (already-correct cases), not just gain on the tail. Hunt the worst homograph the new mode breaks (high-freq-wrong over low-freq-right; archaic register).

R11 applied at Tier-3 design time would have asked: «which offline-`exact` readings does context override, and who — other than Dicta — validates that flip?» → caught this immediately.

## 6. Fix options + regression analysis
All in `pickContextReading` / `resolveWordLight`, Room-only, gate-safe (no smoke asserts path-A `use:context`; B/C untouched).

**Option 1 — Precedence guard (minimal, recommended).** Add `offlineCard.label !== "exact"` to path (A): never override a decisive corpus-grounded reading. בקר stays utро; link auto-corrects to 4235. Preserves path (A) for offline-NON-exact (genuine offline-failure), and all of B/C.
- *Residual risk:* the rare case where the corpus niqqud is itself WRONG but offline still labels it `exact`, and Dicta is right — now no longer auto-corrected. But (a) measured benefit ≈ 0; (b) that's a corpus DATA error, fixable at bake (the right place), not via an unreliable live override; (c) avoids the far worse card≠column inconsistency. **Net: removes a pure-harm path.**

**Option 2 — Honest conflict (more transparent).** When offline `exact` but Dicta differs (same-POS content): keep the corpus reading PRIMARY (vocalization + gloss + correct link), demote «точно»→«вероятно», add «возможно также: ‹Dicta gloss› (по контексту)». Never replace the vocalization.
- *Pro:* if corpus is wrong, Dicta's alt stays visible. *Con:* hedges ~1.4% of currently-correct `exact` readings to «вероятно» even when corpus is right and Dicta is wrong (adds doubt/noise to good readings). More code than Option 1.

**Option 3 — Vocalization-consistency lock (strongest invariant).** Structural rule: `card.niqqud` is ALWAYS the corpus niqqud; Tier-3 may only adjust gloss/POS, never the headword vocalization. Kills the whole card≠column class. In practice ≈ Option 1/2 (only path-A's `card = ctxCard` ever changes the vocalization). Best stated as an explicit invariant + a gate.

**Option 4 — Genre mitigation (orthogonal, pair-with).** Pass the work's era/genre (from `corpusMeta`) to Dicta instead of the hard-coded `modern`, so it vocalizes archaic text better. Reduces Dicta error frequency but does NOT fix the architectural override (Dicta still errs sometimes) — a mitigation, not a fix. (Genre-sensitivity not yet confirmed; needs its own probe.)

**Recommendation:** **Option 1 (precedence guard) as the immediate fix** — surgical, directly stops the regression, fixes the link for free, breaks no gates, preserves the real Tier-3 wins (B/C + non-exact A). Codify it as the **Option-3 invariant** in a gate (corpus niqqud is the displayed vocalization; assert בקר/בֹּקֶר stays «утро» under a cattle-Dicta ctx). Treat Option 2's «возможно также» as a *possible* add-on only if the owner wants the rare corpus-error case surfaced — but it hedges correct readings, so not default. Option 4 as a separate follow-up. **New gate (R11 discipline): a Dicta-INDEPENDENT regression check — sample baked rows, assert Tier-3 never flips an offline-`exact` reading away from the corpus niqqud.**
