# Phase-2 proclitic design — role-lens critiques (raw)

Generated 2026-07-01 by the proclitic-design-critique workflow (5 adversarial role-lenses + synthesis).


---

## R11-regression

## R11 ADVERSARIAL REVIEW — proclitic detector / two-tier design

**VERDICT: FIX-FIRST.** The architecture (additive, abstain-tunable, Tier-3 escalation) is R11-compatible and the additivity invariant is correct. Ship is blocked on two things: (1) the 97% number is **mis-measured** — it's a single uniform figure, the ktiv de-noising was applied one-directionally, and the oracle is not proven independent of Tier-2; (2) the **highest-visibility error classes for THIS corpus are not addressed** and will fire on the most-read tokens. These are not tail cases in the Ben-Yehuda literary/biblical-register corpus — that genre maximizes exactly the collisions below.

### TOP RISKS (ranked by harm × frequency, not by rate)

**1. High-frequency proper NAMES with a valid content stem.** The Stage-0 guard fires when whole-word ∉ lexicon AND stem ∈ Pealim-content. Names are the densest source of both conditions, and names-333 is grossly undersized for a 26K-work literary corpus full of biblical/allusive names. Worst concrete cases:
- **משה** (Moshe) → strip מ → **שה** (seh = "lamb", a real Pealim noun) → card says *"מ = from, שה = ягнёнок"*. The single most frequent name in Hebrew rendered as "from a lamb."
- **מרים** (Miriam) → מ + **רים** ("lofty/he-will-raise") → "from high-ones."
- These cluster on high-salience tokens. A 3% error that lands on משה is worth 10× one on an obscure noun. **Uniform precision hides this entirely.**

**2. Vav-consecutive / narrative ו — a whole SEMANTIC category the design ignores.** The corpus is 19th–20th c. literary Hebrew thick with biblical-style narration. **ויאמר / ויהי / וילך / ותהי** ARE ו+verb — the segmentation is *structurally correct*, so no lexicon guard will catch it — but the ו is wayyiqtol narrative-vav, **not** conjunctive "and." Stamping the curated *"ו = и (and)"* usage card on every ויאמר is a systematic pragmatic falsehood on the most frequent narrative tokens in the corpus. This isn't a coverage gap; the design simply has no concept of it.

**3. ktiv chaser/male mismatch breaks the guard in BOTH directions.** The guard's whole-word membership test is spelling-exact. Pre-standardization corpus orthography means corpus-surface often won't match hspell's male spelling → **guard fails to match → false proclitic emitted.** The "94.6%→~97% true precision" hand-wave assumes ktiv noise only caused the *silver* to mislabel correct proclitics (helping us). It also causes the *detector* to mis-fire (hurting us), and the measurement did not isolate that direction. The precision estimate is therefore not trustworthy as stated.

**4. Lexicalized transparent adverbs — undefined policy, etymologically "right" but pragmatically wrong gloss.** **באמת** (be'emet "really" = literally "in truth"), **ביחוד** ("especially" = "in unification"), **בעצם** ("actually"), **בכלל** ("at all"), **בערך** ("approximately"), **לפי** (ל+פי "according to" = "to the mouth-of"), **מפני** (מ+פני "because of"), **כדי** (כ+די "in order to"), **כאשר**, **לכן**. The segmentation is morphologically transparent, so the card content ("ב = in") isn't fabrication — but pairing the literal usage card with a word the reader means idiomatically is misleading. The measurement lumps these as FPs; they're a distinct class needing an explicit policy (suppress vs "frozen expression" card), not a precision tweak.

**5. Archaic infinitives/spellings endemic to the corpus.** **לאמר** (lemor) → ל+**אמר** (a valid Pealim verb form) → "to he-said." Same for defective infinitive-construct spellings (לראת etc.). Systematic in this register, not noise.

### WORST THING A USER ACTUALLY SEES
*"מ = from · שה = ягнёнок"* on **משה (Moses)**, or *"ו = и (and)"* stamped on every **ויאמר** in a biblical passage. Both land on top-frequency, high-reverence tokens. This is the do-no-harm/R1 nightmare: confident, plausible-looking, and on exactly the words a Hebrew reader will notice instantly.

### IS 97% OFFLINE PRECISION ACCEPTABLE?
**No — not as a flat scalar.** Errors are anti-correlated with safety: they concentrate on the most frequent, most salient tokens (names, narrative verbs). Offline must **abstain harder**: default policy = *suppress unless Stage-2 niqqud actually disambiguates (בַּ fused-article = strong positive) OR Tier-2/bake-time confirms.* Note the niqqud refine is unavailable on ~43% of tokens (baked niqqud measured bimodal 56.6%, BRR_P1_009) — those must abstain, **not** silently fall back to bare stem-lookup, which is precisely the unguarded path that fires on משה.

### CONCRETE FIXES
1. **Turn Tier-2 Dicta into a BAKE-TIME per-work asset, not a runtime opt-in.** Precompute, per baked work, the set of tokens Dicta tags as proper-noun / non-segmented / its prefix segmentation, and ship it as a per-work suppression+segmentation map. This kills the name problem and the consent friction at once, and makes "offline-confident" actually authoritative. Keep runtime Dicta only for un-baked text.
2. **Frozen-adverb stoplist** (באמת, ביחוד, בעצם, בכלל, בערך, כדי, לפי, מפני, כאשר, לכן, כמו, בלי…) → suppress or render a distinct "устойчивое выражение" card, never the bare proclitic-usage card.
3. **Vav-consecutive guard:** when ו precedes a wayyiqtol-shaped finite verb (or stem resolves to a narrative-past form), suppress the ו card or relabel as "повествовательный вав (не просто «и»)." Hardcode-suppress the plain "and" card for the ויהי/ויאמר class.
4. **Make Stage-0 ktiv-robust:** test whole-word membership on a matres-normalized skeleton (strip optional ו/י), not exact surface, so chaser/male variants stop leaking false proclitics.
5. **Niqqud-gated confidence badge:** "offline-confident" ONLY when Stage-2 niqqud is present and disambiguating; bare unvocalized → "возможная приставка, нажмите для проверки," never confident.

### EXACT DO-NO-HARM GATE (`smoke:reader-proclitic`)
1. **Hard-negative zero-tolerance fixture** — each MUST emit NO proclitic; any emission fails the build: `{בית, ביחוד, באמת, בעצם, בכלל, בערך, מיכה, משה, מרים, לאה, לבן, מים, מהר, שמן, כלב, לאמר, כדי, לפי, מפני, כמו, כאשר, לכן}`.
2. **Top-frequency band == 100%:** over the 200 most frequent proclitic-initial surface forms in the baked corpus, precision must be exactly 100% (these are what every user sees).
3. **Per-category floors, not one number:** names ≥99.5%, function/adverb ≥99%, content ≥97%. Build prints all three.
4. **Additivity assert (R11 core):** over a resolved-card fixture, the stem reading (root/binyan/pos/gloss) is **byte-identical** with and without the detector enabled — proves non-mutation.
5. **Vav-consecutive assert:** on a narrative fixture (ויאמר/ויהי/וילך/ותהי), the ו card is suppressed or hedged — never plain "и = and."
6. **Abstain-rate stability:** print abstain rate; fail if a change silently converts abstains→confident emissions beyond ±X of baseline (catches recall-chasing precision regressions).
7. **Niqqud-absent abstain assert:** when baked niqqud is missing AND the word is a spelling-variant suspect, detector abstains.
8. **Oracle-independence assert (CI):** verify the silver builder and the Tier-2 runtime do not import the same source module.

### INDEPENDENT-ORACLE DESIGN (silver has ktiv noise)
- **Independence is non-negotiable:** if Tier-2 = Dicta, the gate oracle **must not** be Dicta — validating Dicta against Dicta is the exact circular trap flagged in `feedback_independent_oracle_gate` / `feedback_no_override_grounded_reading`. Use either (a) a stratified hand-annotated gold set (~300 items, balanced across names/adverbs/narrative-vav/content/archaic), or (b) a *different* segmenter (YAP / UDPipe-HE) with cross-source agreement only.
- **De-noise symmetrically on a skeleton key:** normalize BOTH detector output and oracle to a niqqud-stripped, matres-normalized skeleton before comparison (consistent with `feedback_cloze_key_by_skeleton`), so male/chaser pairs collapse and stop generating phantom (dis)agreements **in both directions**.
- **Freeze and commit the normalization rule, report RAW and normalized precision side-by-side.** The current "97%" looks like normalization applied only where it flipped disagreements in the detector's favor — that's precision p-hacking. The rule must be fixed before measurement and must correct silver-misses and detector-false-fires equally.

### ON ROLE R12
Support proposing it, but scope it tightly. Seg-precision/recall measurement already sits in **R10** (computational morphologist) and oracle-independence / do-no-harm in **R11** — R12 must NOT re-own those. Justified only if it owns the standing **abstain calculus + agglutinative-stacking spec (ולכשה-class) + clitic-boundary policy** as a durable concern. Recommend yes, narrowly framed as "клитический граничный анализ + политика воздержания"; oracle independence stays R11.

Relevant code/data to wire the gate against (paths for the implementer): `public/js/reader-morph.js` (light card), `public/js/notes-autogen.js` + `scripts/premium/build-notes-from-bundle.js` (lock-step pure-core), `public/js/reader-dicta.js` (Tier-3 reuse), `scripts/premium/reader-morph-audit.js` (existing audit harness to extend), and the 3b function-usage store referenced in `docs/planning/BRR_EPIC3B_FUNCTION_USAGE_RECON_2026_06_30.md`.

---

## R10-R12-seg

**R10 assessment — candidate role R12 (clitic boundary segmentation). Verdict: FIX-FIRST. Architecture is shippable; the metric, the Stage-1 grammar, and the role itself each have a concrete defect that must be fixed before the gate can be trusted.**

---

**1. The two-tier split is sound; the precision NUMBER is not (this is the load-bearing problem).**

The offline-abstain + opt-in-Dicta architecture is correct and matches our existing Tier-3 consent model. But you are quoting "94.6% raw → ~97% true" precision against a **Dicta-silver oracle that you then hand-correct in your own favor** ("most residual FPs are CORRECT proclitics the silver mislabeled"). That is exactly the independent-oracle violation we already burned ourselves on (Epic-6 Inc1; the בקר→"скот" do-no-harm fix). You cannot both (a) escalate to Dicta in Tier-2 and (b) gate the offline tier against Dicta-silver — when offline and Dicta agree you score it correct, but they share Hebrew-specific blind spots (ktiv male/chaser is precisely the shared failure you're hand-waving away). The "97%" has no teeth.

**Fix:** the precision GATE must run against a **frozen, R1-adjudicated gold set** (N≈300–500 proclitic-initial tokens, human-labeled, niqqud-stripped to match prod), independent of Dicta. Dicta-silver stays for dev/recall tracking only. Until that gold exists, no precision claim is admissible.

---

**2. Define the metric as TWO precisions, not one — and gate them at different bars.**

Per token the system emits an ordered prefix set P (possibly empty). Report:

- **existence-precision** = (tokens where system emits ≥1 clitic AND a true clitic boundary exists) / (tokens where system emits ≥1 clitic). This is the **do-no-harm number** — a spurious "ב=в" painted on בַּיִת is the R11/R1 violation. **Gate ≥ 99%.** A fabricated preposition shown to a learner is near-zero-tolerance; 94.6% is unshippable as an existence bar.
- **labeled-seg-precision** = of correctly-flagged tokens, fraction where the **full ordered prefix sequence + each label** (article-ה vs prep, "in" vs "from", article vs interrogative ה) is exactly right. **Gate ≥ 95%.**
- **recall** = non-gating SLO, report ≥ 65%; Tier-3 closes the gap. Do NOT let recall pressure erode the existence bar.

Plus a **hardcoded never-segment unit test** (not statistical): {בית, ביחוד, באמת, בעיקר, מיכה, משה, לאמר, ברכה, …} must return empty-P. This tripwire is independent of the gold-set sampling and catches coverage regressions the statistical gate would average away.

**Critically: stratify both precisions by stack depth (1 / 2 / 3+).** See §3 — precision decays with depth and a single blended number hides it.

---

**3. Stage-1 must be a finite-state ordered-prefix grammar, NOT greedy stripping. Your stacking example exposes this.**

"Strip P, require stem ∈ Pealim" as iterated greedy stripping both over- and under-segments:

- **Over-strip / residual-collision trap:** משה → strip מ → שה ("lamb", a real Pealim noun) → fabricates "from a lamb". לך, מה, כה, שה are all short valid words. The shorter the residual, the higher the spurious-lexicon-hit rate. This is why **precision must be stratified by depth** — at depth ≥3 the residual is short and collision rate explodes; offline precision there is *unmeasured*. Policy: **abstain or force Tier-3 at stack depth ≥ 3.**

- **Ordering + mutual-exclusivity are not free strip-sets.** The legal proclitic sequence is an ordered automaton, roughly:
  `ו?` (outermost, never doubled) → subordinator unit `{ש | כש=כ+ש | לכש=ל+כש | מש}?` → article `ה?` (innermost prefix, sits directly on stem; nothing follows it) → and the **preposition slot holds exactly ONE of {ב,ל,כ,מ}**. The mutual-exclusivity claim is correct *for the direct-preposition slot* — but note ל and כ legitimately co-occur in לכש where כש is a subordinator, not a second preposition. A naive "no two of ב/ל/כ/מ" rule wrongly rejects וְלִכְשֶׁ־. You must encode לכש/כש as **lexical subordinator units**, not as independent ל+כ strips.

  Your own example וְלִכְשֶׁהַמֶּלֶךְ = ו+ל+כ+ש+ה+מלך has FIVE prefix chars. A single-strip Stage-1 fails outright; even a stacking-aware version must (a) recognize לכש as ל+[כש-unit], (b) recognize ה as the article in the innermost slot, (c) land on מלך. The grammar must try **all legal parses** and pick the one maximizing residual-stem lexicon score, **abstaining on ties** — not first-match greedy.

- Also enforce: ו only outermost; ה never followed by another prefix; **מ does not fuse the article** (מ+ה+בית = מהבית stays written מה, unlike ב/ל/כ which fuse to בַּ/לַ/כַּ). A grammar that allows ה-fusion after מ will mis-parse.

---

**4. The niqqud signal is WEAK and you've over-credited it. Demote Stage-2 from "refine" to confidence-only; never use a vowel as positive clitic-existence evidence.**

Your "בְּ shva vs בַּ = ב+ה fused article" rule has two fatal counterexamples:

- **בַּיִת ("house") natively carries patach** under ב — that's the word's own vowel, not an article. "patach under ב ⇒ article" would falsely segment בַּיִת as ב+ה. The thing that saves you is the **whole-word lexicon guard**, not niqqud. So niqqud does NOT establish *whether a clitic exists* — only the lexical guard does.
- **בְּרָכָה ("blessing") natively carries shva** under root-bet — "shva ⇒ bare preposition" would fabricate a clitic on a clitic-free word.

So vowels are only safe as a **tiebreaker on the article sub-label AFTER lexical evidence has already established a clitic boundary** (and even then only for non-guttural next-consonants — before ח/ע/ה/א/ר the dagesh disappears and the article shows as compensatory kamatz, a different rule). And niqqud is **absent ~43% of the baked corpus** (the 56.6% bimodal coverage from BRR-P1-009). A Stage-2 that gates on niqqud silently disables itself on nearly half the corpus. Make it a confidence nudge that can *raise* "offline-confident" → "Dicta-only", never a positive detector and never a gate input.

One more label hazard: prefix ה is **article OR interrogative** (הכתבת "did you write?"). Offline cannot disambiguate. Detect the ה-boundary, but **abstain on the label** (article vs interrogative) absent context — don't paint "опр. артикль" confidently.

---

**5. Scope creep in the charter: the role says "enclitic." It can't deliver that. Cut it.**

Pronominal enclitics (ביתו = בית+ו "his house", שמרתיו) are a categorically harder problem requiring stem+possessive/object paradigm synthesis, not prefix stripping. The proposal does zero enclitic work. A charter that says "proclitic/enclitic" implies coverage you don't have. **Explicitly defer enclitics**; ship proclitics only.

---

**6. Is R12 a distinct lens, or R10 in a narrow hat? — Redundant. Do NOT mint it.**

Roles in this project are **value-lenses**, not task buckets. Test R12's invariant ("high-precision or abstain") and its concerns against existing lenses:

- segmentation grammar / clitic ordering / agglutination → **R10** (computational morphologist; disambiguation+measure is literally this)
- false-clitic / boundary hallucination do-no-harm → **R11** (do-no-harm, cross-surface consistency)
- "ב=в" must be a real licensed form, no fabricated segmentation → **R1** (no invented forms)
- offline→Tier-3 escalation + consent UX → **R5/R4**

Every value R12 would enforce is already owned. Segmentation operates at a finer linguistic *level* than token-tagging (steelman: boundary hallucination ≠ mis-tagging), but a different task level does not create a different *lens* — the methods and value system used to judge the work are identical to R10+R11. Minting R12 is the role-proliferation anti-pattern, and our own norm is "propose a new role first" — this is the case where the answer to the proposal is **reject**.

**Fix:** add one clause to **R10** in `docs/PROJECT_ROLES.md` ("…incl. clitic boundary segmentation, agglutinative prefix stacking, false-clitic guard, seg-precision/recall vs an *independent* oracle, offline→Tier-3 escalation") and let **R11** own the never-segment tripwire. If the owner wants a memorable handle, make it an R10 sub-competency tag, not a peer role number.

---

**Verdict: FIX-FIRST.** Ship the architecture (offline-abstain + opt-in Dicta + additive non-mutating detector + 3b usage-card reuse + new `smoke:reader-proclitic` gate) after three blocking fixes: (1) re-derive the precision gate against a **frozen R1-adjudicated gold**, split **existence-precision ≥99 / labeled-seg ≥95**, add the hardcoded never-segment unit test; (2) replace greedy stripping with an **ordered finite-state prefix grammar** (לכש/כש as units, one-preposition slot, ה innermost, מ no-fuse), **stratify precision by stack depth and force Tier-3 at depth ≥3**; (3) **demote niqqud to confidence-only** (never a positive existence signal — בַּיִת/בְּרָכָה), and **reject R12 as a peer role**, folding it into R10 + R11. The do-no-harm story is only as strong as the gold set — until the oracle is independent of Dicta, treat every precision figure here as unproven.

---

## R1-honesty

# R1 (Hebrew lexicographer) critique — proclitic segmentation card

The architecture is sound (do-no-harm whole-word guard first, additive, precision-tuned, Tier-3 escalation). But as specified it still **fabricates in four concrete places** that the 90.7%→97% precision number hides, because the silver oracle measures *boundary* correctness, not *lexicographic honesty of the card you render*. The card claims a live grammatical function; that is a stronger claim than "the boundary is here," and several of its failure modes are precision-invisible.

## Top risks (ranked by harm)

**1. Fused-article reconstruction (Stage-2) will fabricate definiteness — the single worst R1 hole.**
- בַּבַּיִת = ב+ה+בית "in **the** house". Showing only "ב = в" silently drops the article and mistranslates definiteness. So you're right that both *should* appear — BUT:
- On **unpointed** text בבית is genuinely ambiguous between בְּבַיִת ("in a house") and בַּבַּיִת ("in the house"). Claiming the article offline here is pure fabrication. Stage-2 "niqqud refine" only works *when niqqud is present*; the proposal doesn't say it **abstains from the article claim when niqqud is absent**. It must.
- Even **with** niqqud, "patach+dagesh ⇒ fused article" misfires on words whose first radical lexically takes patach: בַּעַל ("owner/husband"), כַּף ("palm"), לַ֫חַץ. The dagesh-forte in the *second* consonant is the real tell, and that dagesh is exactly what your data most often lacks. So Stage-2 as written will emit "ה = опр.артикль" on בעל-class words.
- Also: ו and ש never swallow the article (והבית, שהבית keep it visible); only בכ"ל (and partly מ) contract. The rule must be scoped to those, or it over-generalizes.

**2. Wrong usage *sense* on a correct boundary — precision-invisible mislabel.**
One proclitic letter has several grammatical functions; the curated "Употребление" card asserts one:
- **ל**: dative/allative "to" vs **infinitival ל** (לִכְתּוֹב "to write"). Showing the directional/dative usage card on an infinitival ל is a false grammatical claim even though the boundary ל|כתוב is *correct*. The audit will score it a true-positive.
- **ב**: locative "в" vs instrumental "с помощью" vs temporal "в/на" (בַּבֹּקֶר).
- **ה**: definite article vs **interrogative הֲ** (הֲיֵשׁ "is there?"). Labeling interrogative-ה "опр. артикль" is wrong.
- **ש**: relativizer / complementizer / causal "потому что".
The segmenter can be 100% right on the cut and still hand R1 the wrong card.

**3. מ-preposition vs מ-of-mishkal/participle collision.**
מ is both the clitic preposition (מן "from") and the morphological prefix of mishkal nouns / participles: מוֹרֶה (teacher), מָקוֹם (place), מֶמְשָׁלָה (government), מַפְתֵּחַ (key). Whole-word guard catches the ones in lexicon (מורה ✓), but the "strip-P, stem∈Pealim-content" rule will misfire on derived forms whose stem is itself a content word. Showing "מ = из" on a mishkal noun is fabrication. מ is the highest-risk of the seven.

**4. Lexicalized/fossilized proclitics — etymology masquerading as synchronic grammar.**
- בְּעִיקָּר "mainly", כְּמוֹ "like", לְפִי "according to", כְּדֵי "in order to", בְּלִי "without", לָכֵן: these are *single adverbs/prepositions today*. Showing "ב = в" on בעיקר is **etymologically defensible but lexicographically dishonest** — it claims a productive proclitic where the synchronic grammar has none, and the learner gains nothing but confusion.
- Worse, כְּמוֹ → כ+מו segments to a non-word (מו). Letter-by-letter decomposition of fossils produces garbage stems.
- **Stacked lexicalized clusters**: כְּשֶׁ ("when"), לִכְשֶׁ, מִשֶּׁ are conventional single subordinators. Decomposing כש → כ+ש "as+that" is pedantry that mislabels function. Your ולכשה stacking example *invites* exactly this over-segmentation.
The function-452 list is the gate for these, but it must be **audited for completeness** on fossils and clusters, and the fossil gate must run *before* clitic stripping — not rely on "stem in Pealim."

**5. Tuning precision against a ktiv-male/chaser-noisy silver.**
You already note many "FPs" (היישוב/הנוער) are true proclitics the silver mislabeled. The danger is the inverse during tuning: to chase the 94.6→97 number you tighten thresholds and start **suppressing true proclitics** (recall harm) to satisfy a noisy oracle. Don't tune to fix oracle noise — fix the oracle (normalize ktiv) or treat those rows as unscored. Independent-oracle hygiene applies (the gate must recompute boundaries from raw, not trust the noisy label).

## Concrete fixes

1. **Article claim requires positive niqqud evidence AND a scope gate.** Emit "הַ (опр. артикль)" only when: (a) proclitic ∈ {ב,כ,ל,מ}; (b) niqqud present; (c) pattern = patach-under-clitic **and** dagesh-forte in next consonant (or known contraction). Otherwise show only the preposition. On unpointed text: never claim the article; optionally render "определённость не показана" rather than guessing. Tag the reconstructed ה with an explicit **«слитный / восстановлен из огласовки»** provenance label — it is not a written glyph.

2. **Sense-select the card from stem POS, or go sense-general.** ל + (Pealim infinitive) → infinitival card, not dative. ה with interrogative niqqud → not article. If POS is uncertain, show the proclitic's *identity with multiple senses listed* ("ב — предлог: в / на / с помощью") rather than asserting one. The curated 3b card should have a sense-neutral header fallback.

3. **Fossil/cluster gate BEFORE clitic stripping.** A maintained list of fossilized prefixed forms (בעיקר, כמו, לפי, כדי, בלי, לכן…) and lexicalized clusters (כש, לכש, מש, כפי, לפי) → suppress segmentation entirely (or treat the cluster as one labeled subordinator, never letter-by-letter). This is a *lexical* list R1 owns; don't expect the Pealim-stem heuristic to catch it.

4. **Special-case מ.** Add a guard: if stem parses as a mishkal/participle derivation (or the whole form is a known nominal), suppress "from". Bias מ toward abstain.

5. **Cap stacking depth and require each layer independently confident.** ולכשה: if any inner layer is hedged, the whole stack drops to hedged/suppressed — don't render a confident 4-letter decomposition off cascaded guesses.

6. **Don't tune to the noisy silver.** Normalize ktiv male/chaser in the oracle or mark those rows unscored; assert the gate measures *true* precision, and add the two named hard asserts (בית, ביחוד never segmented) plus a *positive* anti-suppression assert (a curated set of real proclitics that must stay detected, so precision-tuning can't quietly kill recall).

## Honesty rules — exactly what is shown

- **Confident chip (offline-confident badge, links to usage card):** whole-word ∉ any lexicon AND ∉ fossil/cluster list; single clitic (or fully-confident stack); stem = clean Pealim content form; sense resolvable from stem POS; for the article, niqqud positively confirms fusion. → `Приставка: בְּ (в)`. Article shown as a **separate, provenance-tagged** chip `הַ (опр. артикль · слитный)` only under rule 1.
- **Hedged (greyed, «вероятно/возможно», no confident badge, offers «возможно также», NO article claim):** homograph (בגינה = "в саду" / "из-за неё"); fossil-suspect; niqqud absent so sense/definiteness undetermined; stack with a soft layer. Link allowed but labeled a possibility. Reuse the existing Epic-1 honesty UX.
- **Nothing shown (suppress, do not invent):** whole-word in lexicon (בית, שלום, מורה, בעיקר); stem not a known content form; fossil/cluster; cannot cleanly separate. Optionally a neutral **«перепроверить (Dicta)»** escalation affordance — an offer, never a claim.
- **Never:** claim the fused article on unpointed text or on lexical-patach words (בעל); decompose כמו/כש letter-by-letter; show the dative-"to" card on infinitival ל; label interrogative ה as the article; show "מ = из" on mishkal/participle nouns.

**On your two direct questions:**
- *Is "ב = in" on בעיקר honest?* No — etymologically true, synchronically a false claim of a productive proclitic. Suppress.
- *Fused article — both shown, or over-claiming?* Show both **only** with niqqud confirmation, with the ה explicitly tagged as reconstructed-from-vocalization; showing only ב under-claims (drops definiteness), showing ה without niqqud evidence over-claims. The honest middle is niqqud-gated + provenance-labeled.

## On R12
Justified — clitic boundary analysis is a real distinct competency (stacking, false-clitic guard, seg-precision vs independent oracle). **R1 caveat:** R12 owns *boundaries and abstention*, not *sense/gloss selection*. Which usage card and whether a fossil is "still a proclitic" are lexical-semantic decisions that stay with R1/R10. A segmenter confidently picking the gloss is how you get a correct cut with a wrong card (risk #2). Write the invariant as: R12 high-precision-or-abstain on boundaries; R1 owns the card's lexical claim.

## Verdict: **FIX-FIRST**

The spine is right and aligned with project do-no-harm norms — don't rethink it. But do not ship as specified: Stage-2 will fabricate definite articles (on unpointed text and on בעל-class words), the card will mislabel senses (infinitival ל, interrogative ה), מ-mishkal and fossils/clusters are under-guarded, and tuning to a ktiv-noisy silver risks trading fabrication for silent recall loss. Land fixes 1–6 and the honesty-rule render states, add the positive anti-suppression assert to `smoke:reader-proclitic`, then ship.

Relevant canon for the implementer: honesty UX pattern + badges in `E:\projects\tts-prototype-android\docs\planning\BRR_EPIC1_RESOLVER_HONESTY_2026_06_25.md`; usage-card store from 3b in `E:\projects\tts-prototype-android\docs\planning\BRR_EPIC3B_FUNCTION_USAGE_RECON_2026_06_30.md`.

---

## R4-UX

I grounded this in the live card (`public/js/reader-morph.js`, 2050 lines): the tap card today renders header word → root·binyan·POS·gloss → provenance badge (`точно`/`вероятно`/`возможно также`/`контекст (Dicta)`) → Pealim link → root-family chips → inflection table, and function-words get the `Употребление` usage block. Here is the R4 critique of bolting proclitics onto that.

# R4 critique — proclitic surfacing in the tap card

## The one risk that sinks this: fabrication-by-layout
Your data pipeline is honest (Tier-1 abstain, Tier-2 confirm). The card can still lie. If you render `בְּ — в` as a row directly under the stem gloss `בַּיִת — дом`, a learner skimming at 380px reads the card top-down as **"the word means: дом / в"** — two glosses stacked, equal weight. That is the exact R1/R11 violation the whole measurement effort was meant to avoid, reintroduced by typography. The 97% segmentation precision buys you nothing if the *layout* asserts the proclitic at the same visual altitude as the stem reading. **The proclitic is morphological scaffolding, not a second meaning, and must never out-rank or visually rhyme with the stem gloss.**

## Where it sits (concrete vertical order)
Do NOT reuse or sit adjacent to the existing `Употребление` block. That block means "this whole word IS a function word." A proclitic means "this word *contains* a function morpheme." Co-locating them collapses a distinction you spent 1283 oracle rows defending. Order:

1. **Header word** `בַּבַּיִת` (unchanged, primary).
2. **Segmentation strip (NEW, thin)** — the morpheme breakdown, see below. This is the *bridge*, not a gloss.
3. **Stem morphology** (root/binyan/POS/**gloss**) — unchanged, visually dominant, this is "what the word means."
4. **`Приставки` chip row (NEW)** — collapsed, secondary tint, links to usage.
5. Pealim link / root-family / inflection — unchanged.

Putting segmentation at (2) and usage chips at (4) — *straddling* the stem block — is deliberate: the breakdown introduces the parts, the dominant stem gloss answers "meaning," then the chips offer the optional deep-dive. The stem gloss is always the visual climax.

## The elegant answer to "tap to BOTH ב-usage and בית-stem": segment the live word
Don't add a separate parts list the learner has to mentally re-map onto the Hebrew. Render the **header word itself** as the tap surface, split into two hit-zones:

```
[ בַּ ][ בַּיִת ]      ← one RTL word, two sub-zones
  prefix    stem
  tinted    normal
```

- Tap the **stem zone** → the card already is the stem analysis (no-op / subtle pulse-to-stem-block).
- Tap the **prefix zone** → push the `ב` usage card (reuse 3b store).

This answers your question directly and needs zero extra glossing. One object, two destinations, and the learner *sees* the boundary inside the real word — which is also the most honest possible rendering: you're showing the segmentation, not asserting a meaning.

**But — and this is a hard fix, not a nice-to-have — this in-word split is the single most dangerous element and must be gated:**

### Risks specific to splitting a niqqud Hebrew word
- **Grapheme-cluster breakage.** `בַּ` is base ב + patach + dagesh (the dagesh/article fusion is the whole point of Stage-2). Splitting the word into spans risks slicing mid-cluster, orphaning combining marks, or reflowing vowel points wrong at 380px in mobile webview. **Fix:** split on Unicode grapheme-cluster boundaries only; the prefix span carries its full vowel/dagesh stack; add a `smoke:reader-proclitic` assertion that re-joining sub-span `textContent` is byte-identical to the source surface (do-no-harm at the *rendering* layer, mirroring your save-key/paint-key parity discipline).
- **44px tap targets.** A single Hebrew prefix letter is ~10px wide. A bare-letter tap zone fails WCAG and fails on a thumb. **Fix:** pad the sub-zone to ≥44px touch height with an invisible hit-box; never rely on the glyph bounds.
- **Confidence must gate the colorization.** This is the crux. Re-tinting live Hebrew letters *reads as certainty*. You have ~70% offline recall and ~2-3% genuine ambiguity (בעיקר, בגינה). So:
  - **offline-confident / Dicta-confirmed** → segment + tint the prefix in-word (assertive).
  - **uncertain/hedged** → **do NOT recolor the live word.** Drop to a quieter, non-asserting affordance: a single muted line under the card, `возможно приставка בְּ? · уточнить` → tap escalates to Dicta. No in-word tint, no chip that looks like fact. The visual must degrade exactly as the certainty does.
  - **abstain** → render nothing (already your Tier-1 default — keep it).

## The `Приставки` chip row + multi-clitic stacking
- **Single clitic:** one chip, secondary tint, `בְּ (в)` → usage card. The `(в)` is a *function label*, not a translation of the word — keep it visually distinct from the stem gloss (smaller, muted, in the chip not on a gloss line).
- **Multi-clitic (ולכשה, 3-4 prefixes):** do **not** stack 3-4 usage rows — that blows the light-card vertical budget and buries the stem. Collapse by default to one line in **RTL morpheme order**:
  ```
  Приставки (4):  ו · ל · כְּשֶׁ · ה   ›
  ```
  Tapping the row expands the chips; tapping a chip opens that morpheme's usage. The count `(4)` sets expectation before expansion. Never auto-expand 4 cards inline.
- **RTL ordering trap:** the chips must read right-to-left in attachment order (outermost clitic rightmost), matching how they sit on the word. A naive LTR flexbox will reverse them and teach the wrong order. Assert chip DOM order vs morpheme order in the smoke (you have prior art for this exact class of `[hidden]`/display/order bug).

## Confidence/source badge — don't add a fourth badge vocabulary
You already have `точно / вероятно / возможно также / контекст (Dicta)`. Do NOT invent a parallel proclitic badge lexicon — learners can't hold two badge systems. **Reuse the existing semantics, scoped to the segmentation:**
- offline-confident → no badge (quiet = confident, matches `точно` being the only asserted bucket).
- Dicta-confirmed → the existing `Dicta` marker on the segmentation strip (same chip style as `контекст (Dicta)`).
- uncertain → the existing `возможно` register, rendered as the muted "уточнить" affordance above — **not** a chip.

Critically: the segmentation confidence axis is **independent** of the stem-reading confidence axis (בגינה can have a confident stem but ambiguous segmentation). Two uncertainty sources on one card risks double-hedge noise ("вероятно … возможно … возможно также"). **Fix:** never show both hedges in assertive form simultaneously — if segmentation is uncertain, suppress the in-word tint entirely so there's only one thing flagged as soft at a time.

## Top risks, ranked
1. **Layout asserts the proclitic as a second meaning** (R1/R11) → demote: stem gloss dominant, prefix as scaffolding/chip, never a gloss line.
2. **Recoloring live Hebrew at ~70% recall / 2-3% ambiguity reads as false certainty** → gate in-word tint behind confidence; uncertain = quiet "уточнить", not tint.
3. **Niqqud grapheme split corrupts vowels/dagesh at 380px** → cluster-safe split + re-join byte-parity smoke.
4. **Sub-letter tap targets** → ≥44px padded hit-boxes.
5. **Multi-clitic blows the light-card budget / wrong RTL order** → collapsed count-row, RTL morpheme order, DOM-order assertion.
6. **Confusion with the existing `Употребление` (whole-word function) block** → separate section, never adjacent, never shared store-rendering path.

## Verdict: **FIX-FIRST**
The system architecture (Tier-1 abstain → Tier-2 confirm, additive non-mutating detector, new `smoke:reader-proclitic`) is sound and worth shipping. But the UI as implied — proclitic usage rendered near/like a gloss, live-word recoloring on by default — is a do-no-harm regression waiting to happen at the *presentation* layer. Ship only after three gates are in place: (a) stem gloss is provably the dominant visual element and the proclitic never renders on a gloss line; (b) in-word tint is hard-gated to confident/Dicta-confirmed, with uncertain degrading to a non-asserting "уточнить" affordance; (c) the smoke asserts split-rejoin byte-parity AND RTL chip order, alongside your seg-precision and the בית/ביחוד-never-segmented checks. The data is honest; make the pixels honest too.

On **R12**: from a pure-UX seat I don't need a new role to *render* this — but the boundary-segmentation logic (false-clitic guard, stacking, seg-precision vs independent oracle, offline→Tier-3 escalation) is genuinely a distinct competency from R10's whole-word disambiguation, and it owns invariants R4 can't audit. Worth proposing to the owner per your "propose a new role first" norm; I'd support it, scoped to segmentation only, with R4 retaining veto over how its confidence surfaces in the card.

Relevant file: `E:\projects\tts-prototype-android\public\js\reader-morph.js` (card render + provenance badges; the `Приставки` section and segmented header attach here, additively).

---

## R2-R5-value

## R2 + R5 critique — proclitic usage on tap

### Verdict: FIX-FIRST (descope, re-prioritize), then ship offline-only. Reject R12 and Dicta-tier for v1.

The precision-first instinct is right and the do-no-harm framing is correct. But as written the proposal is mis-prioritized (uniform coverage instead of value-weighting), over-engineered (new role + Dicta as v1), rests on an unmeasured "true ~97%", and is sequenced wrong (it depends on a store that isn't signed off yet). Six concrete problems.

### RISK 1 — Value is INVERSELY correlated with frequency; the proposal weights by coverage (R2)
The headline argument ("ב/ל/מ/כ/ה/ו/ש are THE most frequent morphemes") is the trap, not the justification. A learner reading the Ben-Yehuda canon mastered bare ב=in / ל=to / ה=the in week 1–2. Surfacing "ב (в)" on every tap is pedagogical noise that trains banner-blindness toward the card region. The actual value concentrates in the NON-obvious minority:
- **Fused article** בַּ/לַ/כַּ = preposition+swallowed ה (in-**the**) — the ה vanishes from the consonants; genuinely confusing; high value.
- **Stacking** ולכשה / וכש — multi-clitic; hard.
- **ש** relativizer/complementizer — syntactically load-bearing.
- **מן-assimilation** מהבית vs מבית.

**Fix:** value-weight the render. Fused-article + stacking + ש = prominent. Bare high-frequency preposition = subtle/collapsed, or suppress after first-seen-in-session. This reframes the whole recall debate: you do **not** need 70→100% recall on the trivial class. Chasing it is wasted spend.

### RISK 2 — The high-value case is exactly the one offline can't reliably do (niqqud dependency)
Stage-2 (בַּ vs בְּ, the fused article) is your money case **and** it depends on surface niqqud — which per BRR-P1-009 is **56.6% bimodal coverage**. So offline-only delivers the LOW-value cases (bare ב=in) at ~70% recall and the HIGH-value case only on the ~57% of text that happens to be pointed. The "offline-first is enough" story inverts for the slice that actually matters.

**Fix:** be honest in scope. Offline MVP ships bare-prep + ש + stacking with abstain; the fused-article card is gated on *niqqud-present OR Dicta-tier*. Do not claim offline covers the valuable case. **And** this is the *real* justification for Dicta later — not the generic "close the 30% recall gap," but specifically "unlock fused-article on unpointed text." Re-write the Tier-2 rationale around that.

### RISK 3 — Precision asymmetry is existential, and "true 97%" is unmeasured (R5)
In a premium literary tool the payoff is savagely asymmetric: a correct "ב=in" earns a mild shrug; one visible "ב=in" on מיכה (name) or ביחוד (lexicalized adverb) reads as "this tool can't actually parse Hebrew" and torches the Pealim/Reverso-bar positioning. 94.6% raw precision over the highest-frequency morpheme class = **many** visible errors per reading session. And you cannot ship on a hand-waved "true ~97% once you discount silver noise" — that number is asserted, not measured.

**Fix:** before any ship, hand-adjudicate the 56 residual FPs (and a fresh sample) against a HUMAN oracle, not the Dicta silver (which mislabels via ktiv male/chaser — your own finding). Set a precision **floor ≥98% on surfaced cards** and tune abstention to hit it. Recall is free to crater; precision is the product.

### RISK 4 — Is Dicta needed for credibility? No. Credibility = precision, and you get that by abstaining.
This is the key strategic point against the proposal's framing. For an opt-in secondary card you can **abstain silently** — show nothing when unsure. Low recall is invisible and harmless; low precision is visible and toxic. Therefore Dicta-tier (a recall/coverage instrument) is **not** a credibility prerequisite. Offline + aggressive abstain *is* the credible MVP. Dicta is a Phase-2 enhancement justified only by RISK 2 (fused-article on unpointed text), not by credibility.

### RISK 5 — Cheap stoplist recovers most of the residual precision without Dicta
Your worst residual FPs are a small, enumerable set: lexicalized adverbs (ביחוד, בעיקר, באמת, בגלל), out-of-Pealim archaic infinitives (לאמר), names (מיכה). A curated ~50–150-entry **always-abstain stoplist** kills the most embarrassing errors for near-zero cost and probably closes most of the precision gap that's currently being used to justify a whole Dicta integration. Build this first; measure precision after; *then* decide if Dicta is even worth it.

### RISK 6 — Additive invariant leaks exactly at Stage-2 (R11)
"Never mutates the resolved stem" is correct, but the fused-article reinterpretation (בַּבית → ב+ה+בית, gloss the stem as בית) is precisely where the stem's gloss/status/key could shift — and you have a known save-key vs paint-key parity bug class. The detector must be a pure read-only annotation over the already-resolved token.

**Fix:** the gate asserts the resolved stem's gloss/status/paint-key is **byte-identical** with the proclitic detector on vs off, plus the hardcoded must-never-segment list (בית/ביחוד/מיכה), plus the precision floor on the human sample.

### Reject R12 for now
Per your own "propose-new-role-first" norm, R12 must clear the bar of a *standing cross-cutting concern*. Word-boundary segmentation isn't proven to be that yet — it's one extension of the existing reader-morph resolver (R10) under the existing do-no-harm regime (R11). Creating a role, a new oracle gate, and a Dicta path for a secondary card section is scope inflation. Ship the offline detector under R10/R11. If segmentation grows into enclitics/possessive-suffixes/construct-state and becomes a recurring design axis, *then* propose R12 with evidence.

### Priority vs other Reading-Room work
Lower than it looks, and **sequenced behind 3b**. The render explicitly reuses the 3b «Употребление служебных слов» usage store — which is currently BLOCKED on owner sign-off. You cannot render proclitic→usage cards until that store ships. So this rides downstream of 3b regardless. Relative to byline consolidation / W1-b / Wave-2 content, proclitic segmentation is a modest nicety with a high error-surface; it should NOT jump the queue.

### The MVP (cheapest value, ship this)
1. Finish 3b first (dependency).
2. Offline only: Stage-0 whole-word guard + Stage-1 stem∈Pealim-content + **curated abstain stoplist** (RISK 5) + ש/stacking.
3. **Value-weighted render** reusing 3b store: prominent for fused-article(niqqud-present)/ש/stacking; subtle or suppress bare high-freq prepositions.
4. Abstain-heavy; **precision floor ≥98% on surfaced cards**, recall unconstrained.
5. Gate `smoke:reader-proclitic`: human-adjudicated precision sample + on/off stem-parity assertion + hardcoded never-segment list.
6. **No Dicta, no R12.**

Phase 2, only if v1 metrics earn it: Dicta-tier scoped narrowly to fused-article on unpointed text; revisit R12.

One-line: the precision instinct is correct, but ship a descoped, value-weighted, abstain-heavy, offline-only annotation with a human-measured precision floor — and stop justifying Dicta and a new role on a recall gap that abstention makes invisible.

---

# SYNTHESIS

# SYNTHESIS — Proclitic detector / two-tier design

All five lenses return **FIX-FIRST**: the spine (additive non-mutating detector, offline-abstain → opt-in Dicta, 3b usage-card reuse, new `smoke:reader-proclitic`) is correct and aligned with project do-no-harm norms. It is blocked on a mis-measured precision number, a greedy Stage-1 grammar, an over-credited niqqud signal, and several precision-invisible card-honesty holes. Below is the consolidated decision.

---

## (1) FINAL RECOMMENDED DESIGN

**Measurement (blocking, do first).** The "~97%" is inadmissible — it gates Dicta-tier offline against a Dicta-silver oracle (the exact circular trap from `feedback_independent_oracle_gate` / the בקר→"скот" fix). Replace with a **frozen, R1-adjudicated gold set (~300–500 proclitic-initial tokens)**, niqqud-stripped to match prod, stratified across names / narrative-vav / fossil-adverbs / content / archaic / stack-depth. Dicta-silver is demoted to dev/recall tracking only. Freeze the ktiv normalization rule **before** measuring and report RAW and skeleton-normalized precision side-by-side (correcting silver-misses and detector-false-fires symmetrically — no one-directional de-noising).

**Two precisions, gated separately (not one scalar):**
- **existence-precision** (emitted ≥1 clitic ∧ a true boundary exists) — the do-no-harm number — **gate ≥ 99%** on surfaced cards.
- **labeled-seg-precision** (full ordered prefix sequence + each label correct) — **gate ≥ 95%**.
- **recall** — non-gating SLO (~65–70%); Tier-3/bake closes the gap. Never let recall pressure erode the existence bar.
- **Per-category floors printed every build:** names ≥99.5%, function/adverb ≥99%, content ≥97%; and **top-200-frequency band == 100%** (what every reader sees).

**Stage-0 — do-no-harm whole-word guard.** Word ∈ lexicon → emit nothing (kills בית/ביחוד/מורה). Make membership **ktiv-robust**: test on a matres-normalized skeleton (strip optional ו/י), not exact surface, so chaser/male variants stop leaking false proclitics in both directions.

**Stage-1 — ordered finite-state prefix grammar, NOT greedy stripping.** Greedy stripping over-segments short residuals (משה→מ+שה "from a lamb"; מרים→מ+רים). Encode the legal automaton: `ו?` (outermost, never doubled) → subordinator unit `{ש | כש | לכש | מש}?` as **lexical units** (never ל+כ) → article `ה?` (innermost, nothing follows) → **exactly one** preposition of {ב,ל,כ,מ}. Enforce: ו only outermost; ה never followed by another prefix; **מ does not fuse the article**. Try all legal parses, pick the one maximizing residual-stem lexicon score, **abstain on ties**. **Stratify precision by stack depth; force Tier-3 / abstain at depth ≥ 3** (short residual → collision rate explodes; offline precision there is unmeasured).

**Curated abstain stoplist (cheap, high-leverage), run BEFORE stripping:**
- **Fossilized/lexicalized adverbs & prepositions:** באמת, ביחוד, בעיקר, בעצם, בכלל, בערך, בגלל, כמו, כדי, לפי, מפני, בלי, לכן, כאשר. Etymologically transparent but synchronically single words → suppress (or a distinct "устойчивое выражение" card, never the bare proclitic-usage card).
- **Narrative vav-consecutive** (ויאמר / ויהי / וילך / ותהי): structurally ו+verb, so no lexicon guard catches it, but the ו is wayyiqtol — **not** conjunctive "и". Hard-suppress the plain "and" card or relabel "повествовательный вав".
- **Archaic infinitives/defective spellings** endemic to the corpus (לאמר, לראת).
- **מ bias-to-abstain:** מ is highest-risk (preposition מן vs mishkal/participle prefix מורה/מקום/ממשלה). If stem parses as a mishkal/participle derivation or known nominal → suppress "from".

**Stage-2 — niqqud is CONFIDENCE-ONLY, never a positive existence signal.** Counterexamples kill it as a detector: בַּיִת carries native patach (not an article), בְּרָכָה carries native shva (no clitic). What establishes a clitic is the *lexical guard*, not the vowel. Use niqqud only as a **tiebreaker on the article sub-label after lexical evidence already established a boundary**, and only for the בכ"ל set (ו/ש never swallow the article; מ doesn't fuse), only on non-guttural next-consonant, with the real tell = dagesh-forte in the *second* consonant (often the missing datum). Niqqud is absent on ~43% of the baked corpus (BRR-P1-009 56.6% bimodal) → those tokens **abstain on the article claim**, never silently fall back to bare stem-lookup.

**Card honesty (precision-invisible failures the oracle won't catch):**
- **Fused article:** show ה only with positive niqqud confirmation, tagged provenance **«слитный · восстановлен из огласовки»** (it is not a written glyph). On unpointed text never claim it — render "определённость не показана". Showing only ב under-claims (drops definiteness); showing ה without niqqud over-claims.
- **Sense selection from stem POS, or go sense-general:** infinitival ל (לכתוב) ≠ dative ל; interrogative הֲ ≠ article ה; ש relativizer/complementizer/causal. A 100%-correct cut can still hand the wrong usage card. When POS is uncertain, render the proclitic's identity with senses listed ("ב — предлог: в / на / с помощью"), not one asserted sense. R12-style segmentation owns the *boundary*; **R1 owns which card and whether a fossil is still a live proclitic.**

**Render (R4 — make the pixels honest):** the proclitic is morphological scaffolding, **never a gloss line and never visually rhyming with the stem gloss**, which stays the dominant climax. Do not co-locate with the existing `Употребление` block (that means "the whole word IS a function word"). Vertical order: header word → thin segmentation strip → dominant stem morphology/gloss → collapsed `Приставки` chip row (secondary tint) → Pealim/family/inflection. In-word grapheme split (`[בַּ][בַּיִת]`) only on **grapheme-cluster boundaries** with ≥44px padded hit-boxes; **in-word tint is hard-gated to offline-confident/Dicta-confirmed** — uncertain degrades to a muted non-asserting "возможно приставка בְּ? · уточнить", abstain renders nothing. Multi-clitic collapses to one RTL-ordered count row (`Приставки (4): ו · ל · כְּשֶׁ · ה ›`), never 4 inline cards. Reuse existing badge lexicon (`точно`/`вероятно`/`возможно также`/`Dicta`) — do not invent a parallel vocabulary; never show two assertive hedges at once.

**Value-weighting (R2/R5 — the strategic reframe):** value is *inversely* correlated with frequency. Bare ב=in / ל=to / ה=the are mastered in week 1–2 → render subtle/collapsed or suppress-after-first-seen. Concentrate prominence on the **non-obvious minority**: fused article (niqqud-present), ש relativizer, multi-clitic stacking, מ-assimilation. This dissolves the recall debate — you do **not** need 70→100% recall on the trivial class.

---

## (2) R12 VERDICT — **FOLD into R10; do NOT mint a peer role**

Roles here are value-lenses, not task buckets. Every value R12 would enforce is already owned: segmentation grammar / agglutinative stacking / false-clitic guard / seg-precision vs independent oracle → **R10** (disambiguation + measure-before-code is literally this); boundary-hallucination do-no-harm + never-segment tripwire + oracle-independence → **R11**; "ב=в must be a licensed form" + which usage card → **R1**. A finer linguistic *level* (boundary vs token-tag) does not create a different *lens* when the methods and value system are identical. Minting it is the role-proliferation anti-pattern, and the project's own "propose a new role first" norm answers this proposal with *reject-as-peer*.

**Action:** add one clause to **R10** in `docs/PROJECT_ROLES.md` — "…incl. клитический граничный анализ + политика воздержания: proclitic boundary segmentation, agglutinative prefix stacking, false-clitic guard, seg-precision/recall vs an *independent* oracle, offline→Tier-3 escalation"; **R11 owns the never-segment tripwire**; **R1 retains sense/gloss/fossil-status**; **R4 retains veto over confidence surfacing**. If a memorable handle is wanted, an R10 sub-competency tag, not a number. (Revisit only if enclitics/possessive-suffix/construct-state grow into a recurring axis — and note **enclitics are explicitly out of scope** for this work; the charter's "proclitic/enclitic" overclaims coverage that doesn't exist.)

---

## (3) TOP 3 REGRESSION RISKS + MITIGATIONS

1. **Confident fabrication on high-salience tokens — names & narrative-vav** (משה→"from a lamb", ויאמר→"и=and"). Worst do-no-harm/R1 case; uniform precision hides it. *Mitigation:* hardcoded zero-tolerance never-segment fixture {בית, ביחוד, באמת, בעצם, בכלל, בערך, מיכה, **משה, מרים, לאה, לבן**, מים, שמן, כלב, לאמר, כדי, לפי, מפני, כמו, כאשר, לכן}; vav-consecutive suppress assert on a narrative fixture; **bake-time per-work Dicta proper-noun/non-segmented map** (see phasing) as the durable kill.

2. **Circular/p-hacked precision metric** (Dicta gates Dicta; one-directional ktiv de-noise). *Mitigation:* frozen R1-adjudicated gold independent of Dicta; existence ≥99 / labeled ≥95 split; RAW + normalized reported side-by-side; CI oracle-independence assert that the silver builder and Tier-2 runtime import no shared source module.

3. **Additivity leak at Stage-2 / render** (fused-article reinterpretation could shift the stem's gloss/status/paint-key — known save-key vs paint-key bug class). *Mitigation:* detector is a pure read-only annotation; gate asserts the resolved stem reading (root/binyan/pos/gloss/status/paint-key) is **byte-identical** with detector on vs off; plus a rendering-layer assert that re-joining the split sub-spans' textContent is byte-identical to source surface; plus an **abstain-rate stability** check (fail if a change silently converts abstains→confident emissions beyond ±X of baseline — catches recall-chasing).

---

## (4) RECOMMENDED PHASING

- **Phase 0 — unblock dependency.** 3b «Употребление служебных слов» usage store must ship first (currently pending owner sign-off); the render reuses it. This work rides behind 3b regardless and should **not** jump the queue ahead of byline consolidation / W1-b / Wave-2 content.
- **Phase 1 — build the independent gold set** (~300–500 stratified, hand-adjudicated, niqqud-stripped) and freeze the normalization rule. No precision claim is admissible before this.
- **Phase 2 — Offline MVP (ships the value):** Stage-0 ktiv-robust guard + ordered FSA grammar (לכש/כש units, one-prep slot, ה innermost, מ no-fuse, depth≥3 abstain) + curated abstain stoplist (fossils + vav-consecutive + archaic) + niqqud as confidence-only. **Value-weighted, abstain-heavy render**: prominent for fused-article(niqqud-present)/ש/stacking, subtle/suppressed for bare high-freq prepositions. In-word tint gated to confident. Gate `smoke:reader-proclitic` with: hardcoded never-segment fixture, top-200==100%, existence≥99/labeled≥95/per-category floors, additivity byte-parity, vav-consecutive suppress, niqqud-absent abstain, RTL chip-order, split-rejoin parity, oracle-independence CI. **No runtime Dicta, no R12.**
- **Phase 3 — Bake-time Dicta as a per-work asset.** Precompute per baked work the proper-noun / non-segmented / prefix-segmentation map; ship as a suppression+segmentation overlay. This kills the names problem, removes consent friction, and makes "offline-confident" actually authoritative — the highest-leverage non-runtime step.
- **Phase 4 — Conditional runtime Dicta Tier-3** (opt-in consent, reuses `reader-dicta.js`) scoped narrowly to **un-baked text + fused-article on unpointed text** (its real justification — not the generic recall gap, which abstention makes invisible). Ship only if Phase-2 metrics earn it.

---

## (5) OPEN QUESTIONS FOR THE OWNER

1. **Fossil policy:** suppress lexicalized adverbs entirely (באמת/בעיקר/כמו/כדי), or render a distinct "устойчивое выражение / frozen expression" card? (Affects whether the stoplist is silent or surfaces a non-proclitic explanation.)
2. **Value-weighting vs completeness:** accept the R2/R5 reframe that bare ב=in / ל=to / ה=the are suppressed-or-collapsed (training learners away from banner-blindness), or keep uniform coverage of all 7 proclitics? This decides whether recall on the trivial class matters at all.
3. **Gold-set sourcing:** hand-adjudicate in-house (~300–500 items, R1 effort), or cross-source agreement with a *different* segmenter (YAP / UDPipe-HE) as a cheaper-but-weaker independent oracle?
4. **Bake-time Dicta (Phase 3):** authorize precomputing a per-work segmentation/suppression overlay now (front-loads the names fix, adds a build asset + bake-runner step), or defer and rely on runtime opt-in Dicta only?
5. **R12:** confirm fold-into-R10 + R11-owns-tripwire (recommended), or owner prefers a narrowly-scoped peer role over the majority lens-recommendation?
6. **Priority/sequencing:** confirm this sits behind 3b and behind byline-consolidation / W1-b / Wave-2 content, given its modest value and high error-surface — i.e., it is not a queue-jumper.

Canon for the implementer: `public/js/reader-morph.js` (card render + badges), `public/js/notes-autogen.js` + `scripts/premium/build-notes-from-bundle.js` (lock-step pure-core), `public/js/reader-dicta.js` (Tier-3 reuse), `scripts/premium/reader-morph-audit.js` (extend for the gate), `docs/planning/BRR_EPIC1_RESOLVER_HONESTY_2026_06_25.md` (honesty UX/badges), `docs/planning/BRR_EPIC3B_FUNCTION_USAGE_RECON_2026_06_30.md` (usage-card store dependency).
