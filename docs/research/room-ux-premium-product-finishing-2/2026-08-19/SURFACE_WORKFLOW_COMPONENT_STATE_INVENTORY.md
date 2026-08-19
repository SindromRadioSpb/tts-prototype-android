# Surface x workflow x component x state x evidence inventory

## Evidence passport

- Evidence-class ledger: `CODE_CURRENT=RUN`, `PRODUCTION_CURRENT=RUN`, `OWNER_CLIENT_READ_ONLY=RUN`, `OWNER_SUPPLIED_SCREENSHOT=NOT_RUN`, `ISOLATED_AUTOMATION=RUN`, `OWNER_REPORTED=PREDECESSOR_CLOSURE_ONLY`, `PHYSICAL_DEVICE=NOT_RUN`, `ASSISTIVE_TECHNOLOGY=NOT_RUN`, `NOT_RUN=EXPLICIT_WHERE_LISTED`.

- Date/source: `2026-08-19`, `main@3a1e2c934b30106708d24afaa8533f0bc5ea2ac5`; `HEAD == refs/remotes/origin/main == git ls-remote origin main`.
- Dirty: 34 unrelated entries preserved; only PPF2 research/planning documents added.
- Production/client: API/Studio/Room/SW/owner Chrome `3.11.403`; health/DB/migrations ready; disk warning false.
- Evidence: `CODE_CURRENT`, `PRODUCTION_CURRENT`, `OWNER_CLIENT_READ_ONLY`, `ISOLATED_AUTOMATION`, `OWNER_REPORTED`, `NOT_RUN`.
- Limitations/safety: no physical/AT run; no owner data/settings/provider/cache mutation; `review_log 7420 -> 7420`.

## Exact workflow matrix

| Surface | Workflow | Component | Reachable states inspected | Evidence | Candidate/result |
|---|---|---|---|---|---|
| Library/L0 | discover, resume, return | shell, Journey, lists, typed rows | initial/loading/empty/filter-empty/offline/reconnect/stale/update/ready | production Lighthouse + B8 `30/30`/browser + owner volume | `PPF2-01 GO` contrast |
| Ben-Yehuda | catalog and work selection | identity, Ready, filters, Catalog rows | cold/loading/ready/filter/partial/error | current source/production hashes + B8/B6 | no-go |
| My Texts | manage imported/personal materials | identity, filters, vertical rows | owner ready-volume; isolated true/filter empty/error | owner 48 rows + current gates | no-go/backlog copy only |
| group corpora | view authorized corpus | protected identity/catalog | anonymous/limited/ready/error | current source + B6/B8 | routed cache-security only |
| Reader | read and row audio/media | bilingual table, row markers/actions | loading/empty/missing/ready/mismatch/too-long/playing/error | parity, VF4, Room media | `PPF2-05 BACKLOG` names |
| Morph | inspect word | sheet, provenance, status | loading/exact/likely/offline/error/overlay | VF2/current CSS gates | no-go |
| Trainer | enter/reveal/grade/summary | tabs, prompt, reveal | loading/empty/teach/prompt/reveal/error | B8/current unit-browser gates | no-go |
| Mentor | transition to plan/explain | home, consent, evidence | loading/empty/consent/disabled/error | VF2/current source hashes | no-go |
| Studio Classic | author/build/save/continue | phase card, next action, composer | initial/loading/stale/disabled/error/ready | Lighthouse + Studio `9/9`, `92/92` | `PPF2-02 GO` contrast; `06 BACKLOG` label |
| Studio IDE | edit table/media | panels, table, row actions | initial/partial/edit/missing/ready/error | current production-equivalent render + VF3/media | `PPF2-05 BACKLOG` names |
| Import Center | inspect/recover/manage | overview/material/task/reference | initial/empty/filter-empty/partial/error/disabled | Studio UX/P4 current gates | no-go |
| Studio -> Room | save and continue | canonical text/media handoff | saved/missing-media/partial/playable/reopen | Room media PASS, exact 0.48s fixture | no-go |
| Studio initial | onboarding | feature legend | first-run/light/dark/forced | Lighthouse and computed styles | `PPF2-03 GO` contrast |
| Studio footer | trust/version/about | credit and version affordance | light/dark/380 | Lighthouse/current DOM | `PPF2-04 GO` contrast |

## Detailed candidate ledger

### PPF2-01 — Library Journey supporting-copy contrast

1. Stable ID: `PPF2-01`.
2. Workflow: Library/L0 discover and understand saved/finished/list semantics.
3. Visible gap: `.learning-home-journey-types` is faint normal text on a warm panel.
4. DOM/selector owner: `public/library.html` `.learning-home-journey-types`.
5. Behavior/truth owner: Library/L0 presentation only; Journey projections unchanged.
6. Source evidence: `color: var(--text-faint)`, 11.5px over mixed warm card background.
7. Production evidence: current served Library/source hash match; mobile Lighthouse `4.34:1`.
8. Owner-client evidence: current L0 was not navigated; owner My Texts composition is stable.
9. Isolated automation: 380 light reproduced; dark `6.14:1`, forced colors `21:1`, no writes/overflow.
10. VF relationship: VF1/VF2 foundations remain correct; this exact background/role pairing escaped closure.
11. Severity/users: accessibility necessity; low-vision/mobile/outdoor users and every locale.
12. Locale/RTL: shared style affects RU/EN/HE equally; text/DOM direction unchanged.
13. 380/200%: defect observed at mobile; correction changes no geometry.
14. Keyboard/AT: legibility only; focus/order/role unchanged; AT speech `NOT_RUN`.
15. Forced/reduced: forced colors pass; motion not implicated.
16. Offline/stale/SW: static HTML CSS; release/SW bump required.
17. Smallest correction: selector-local `--text-secondary`, no token rewrite.
18. Prospective allowlist: common PPF2 contrast allowlist below.
19. Compatibility/blast radius: one L0 line, all locales; no behavior or storage.
20. Static rollback: revert selector and release/SW stamp.
21. Classification: `GO` inside `ACCESSIBILITY_NECESSITY_ONLY`.

### PPF2-02 — Studio next-step eyebrow contrast

1. ID: `PPF2-02`.
2. Workflow: Classic authoring phase/next-action orientation.
3. Gap: `.classic-next-step-label` normal-sized text on info tint is `4.37:1`.
4. DOM owner: `public/index.html` `.classic-next-step-label`.
5. Truth owner: existing phase reducer; copy/state values unchanged.
6. Source: 11px muted semantic role.
7. Production: production-equivalent current Lighthouse node and current source/served version.
8. Owner: no owner Studio navigation in this research.
9. Automation: mobile Lighthouse; Studio `92/92` remains green.
10. VF: VF3 presentation remains; this is an exact contrast correction.
11. Severity/users: accessibility necessity for users orienting within the authoring flow.
12. Locale/RTL: shared class, no string/direction change.
13. 380/200: found at mobile; no geometry change.
14. Keyboard/AT: status name/role retained.
15. Forced/reduced: no motion change; forced colors must remain system-legible.
16. Offline/SW: static shell; release/SW bump.
17. Correction: use existing theme secondary text role.
18. Allowlist: common contrast allowlist.
19. Blast: exact selector only.
20. Rollback: static revert/re-release.
21. Classification: `GO`.

### PPF2-03 — Studio onboarding feature-heading contrast

1. ID: `PPF2-03`.
2. Workflow: first-run understanding of product capabilities.
3. Gap: `.v3-onb-features-title` is `2.56:1` on white.
4. DOM owner: `public/index.html` onboarding CSS.
5. Truth owner: onboarding copy only; no setting/consent action.
6. Source: literal `#94a3b8`, 12px.
7. Production: current shell/version; current production-equivalent Lighthouse.
8. Owner: current owner is past onboarding; not disturbed.
9. Automation: fresh isolated profile makes onboarding reachable immediately.
10. VF: accepted icon/type character preserved.
11. Severity/users: strong AA failure affecting new users.
12. Locale/RTL: same selector for RU/EN/HE; no bidi change.
13. 380/200: observed at mobile; no reflow effect.
14. Keyboard/AT: text legibility; modal focus contract unchanged.
15. Forced/reduced: forced colors/no-motion unaffected.
16. Offline/SW: shell CSS only; version/SW lock.
17. Correction: semantic theme secondary text, not literal palette expansion.
18. Allowlist: common contrast allowlist.
19. Blast: onboarding heading only.
20. Rollback: static revert/re-release.
21. Classification: `GO`.

### PPF2-04 — Studio footer/trust/version contrast

1. ID: `PPF2-04`.
2. Workflow: inspect trust information/version and open About.
3. Gap: credit and clickable version are `2.36:1` on page background.
4. DOM owner: `.app-footer-credit`, `.app-footer-version` in `public/index.html`.
5. Truth owner: footer/about presentation; version source remains SW.
6. Source: literal `#94a3b8`, 11-11.5px.
7. Production: current `3.11.403`; Lighthouse exact nodes.
8. Owner: owner Room client unaffected during research.
9. Automation: fresh mobile shell, current source, no writes.
10. VF: no identity/icon change.
11. Severity/users: AA failure; version affordance particularly needs legibility.
12. Locale/RTL: shared styles; content semantics unchanged.
13. 380/200: failure observed at mobile; no geometry change.
14. Keyboard/AT: current version element interaction semantics are not expanded by this slice.
15. Forced/reduced: not implicated.
16. Offline/SW: version lock must remain exact.
17. Correction: existing theme secondary role with dark compatibility.
18. Allowlist: common contrast allowlist.
19. Blast: two exact selectors.
20. Rollback: static revert/re-release.
21. Classification: `GO`.

### PPF2-05 — shared table action localization

1. ID: `PPF2-05`.
2. Workflow: Studio table note/edit and Room/Studio column-resize help.
3. Gap: HE/EN still expose Russian note/edit/resizer names while row TTS is localized.
4. DOM owner: `reader-core.js` builder and live duplicate in `index.html`.
5. Truth owner: existing note/edit/resize behaviors; no writer change.
6. Source: hardcoded Russian strings at current builder sites.
7. Production: current served/source parity.
8. Owner: owner is RU; no harm observation.
9. Automation: HE note and edit actions reproduced visible, no writes/errors.
10. VF: explicitly deferred non-audio Reader localization backlog.
11. Severity/users: EN/HE and AT users; impact plausible but not owner/AT proven.
12. Locale/RTL: requires RU/EN/HE keys and bidi-safe names.
13. 380/200: no overflow in reproduction.
14. Keyboard/AT: names matter; AT speech `NOT_RUN`.
15. Forced/reduced: not implicated.
16. Offline/SW: locale/module/cache compatibility required.
17. Correction: separate localized-name slice with parity red test.
18. Prospective allowlist: `reader-core.js`, `library-ui.js` cache reference, `index.html`, `library.html`, RU/EN/HE locales, SW, locale/version tests and dedicated browser test.
19. Blast: shared parity builder and two shells; larger than contrast slice.
20. Rollback: static module/locale/shell release revert.
21. Classification: `BACKLOG`.

### PPF2-06 — Studio form-label/browser issue inventory

1. ID: `PPF2-06`.
2. Workflow: Classic composer and latent IDE/settings/forms.
3. Gap: Chrome Issues reports 31 unlabeled controls and one bad `for`; the visible composer relies on placeholder text.
4. DOM owner: multiple `index.html` forms/modals.
5. Truth owner: surface-local form semantics.
6. Source: orphan-input audit confirms a mixed set of visible, hidden, trigger-owned and legacy controls.
7. Production: current shell source/version.
8. Owner: not navigated; no AT report.
9. Automation: browser issue only; no complete reachable-control classification.
10. VF: not a proven VF regression.
11. Severity/users: potentially AT users, but aggregate issue count is not a candidate boundary.
12. Locale/RTL: labels would require all locales.
13. 380/200: unknown per control.
14. Keyboard/AT: needs dedicated reachability/name/description audit.
15. Forced/reduced: not implicated.
16. Offline/SW: locale/shell lock if later changed.
17. Correction: separate form-by-form recon, never a count sweep.
18. Allowlist: intentionally undefined until reachability is mapped.
19. Blast: large modal/settings surface.
20. Rollback: future static release only.
21. Classification: `BACKLOG`, not promoted from aggregate tooling.

## Approved-scope prospective allowlist

Only if the owner approves the recommended contrast slice:

```text
public/index.html
public/library.html
public/sw.js
tests/premiumProductFinishing2.test.js
scripts/premium/premium-product-finishing-2-browser-smoke.js
docs/planning/ROOM_UX_PREMIUM_PRODUCT_FINISHING_2_IMPLEMENTATION_PACKET_2026_08_19.md
docs/research/room-ux-premium-product-finishing-2/2026-08-19/IMPLEMENTATION_EVIDENCE.md
docs/research/room-ux-premium-product-finishing-2/2026-08-19/screenshots/**
```

The screenshots path is prospective implementation evidence only; no research screenshot exists.
