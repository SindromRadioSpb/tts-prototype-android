# ROOM-UX-VF5-R — Post-Closure Visual Re-entry Decision Packet

```text
MODE=GOAL_RESEARCH_ONLY
DATE=2026-08-16
STATUS=HISTORICAL_RESEARCH_COMPLETE
RECOMMENDATION_AT_DATE=NO_GO_KEEP_PROGRAM_CLOSED
CURRENT_STATUS=SUPERSEDED_BY_ONE_BOUNDED_CORRECTION_CLOSED_3.11.403
```

> **Historical-status note (`2026-08-18`).** This packet is the complete and
> correct decision for evidence available on `2026-08-16`. New owner-supplied
> production evidence on `2026-08-17` superseded only its no-regression finding
> and authorized one bounded Room media correction. That correction is now
> closed at production `3.11.403`; see
> [`ROOM_UX_VISUAL_FINISHING_VF5_REGRESSION_CORRECTION_2026_08_17.md`](./ROOM_UX_VISUAL_FINISHING_VF5_REGRESSION_CORRECTION_2026_08_17.md).
> No other candidate, backlog item or Visual Finishing slice was reopened.

## Evidence passport

- Source: `main@d3c2e2cc4fde6fefa1b75c5769b93de8dad542a0`.
- Local/remote: `HEAD`, local `origin/main` and remote `refs/heads/main` matched.
- Dirty state: 34 unrelated pre-existing entries were preserved. This research adds only `docs/research/room-ux-visual-finishing-vf5/2026-08-16/` and this packet; no staging, commit, push or deploy.
- Production: `https://linguistpro.kolosei.com/library.html` and `https://linguistpro.kolosei.com/index.html`.
- Release: API/Studio/Room/SW `3.11.399`; `/healthz` green, DB/migrations ready, disk `86%`, warning true.
- Actual owner client: Chrome `3.11.399`, no update action, preserved at the existing Studio URL with the open material untouched.
- Evidence classes: `CODE_CURRENT`, `AUTOMATED_LOCAL`, `PRODUCTION_READBACK`, `OWNER_CLIENT_READ_ONLY`, `ISOLATED_AUTOMATION`, `OWNER_REPORTED_PROTOCOL_PASS`.
- Limitations: no physical iPhone/Android or VoiceOver/NVDA/JAWS/TalkBack; current automation is not physical/AT evidence; current owner Library was not navigated.
- Owner-data safety: no owner text/list/progress/bookmark/note/review/group/presentation/provider/cache state changed; no TTS/ASR/MT/LLM or production non-GET action; no update click or cleanup.

## 1. Owner decision in one paragraph

Keep the Visual Finishing program closed. No current post-closure visual regression or accessibility necessity crosses the re-entry threshold: runtime code has not changed since VF4, current production bytes match current source, release/client convergence is exact, and the relevant current visual/a11y/RTL/reflow/state gates are green. The actual owner Studio did reveal a `QuotaExceededError` while saving `ide.table.widths.v1`, but the layout remains visible and overflow-free and the canonical owner is presentation persistence/localStorage capacity, not visual CSS/ARIA. Route it to a separately authorized storage-persistence recon; do not absorb it into VF5.

## 2. Evidence reconciliation

- `git diff 8dda777d..d3c2e2cc` is documentation/evidence only.
- Current source/served normalized SHA-256 matches for the inspected foundation, Reader/Morph CSS, sprite, Studio/Room HTML, Library/Reader/Morph/Mentor JS, RU/EN/HE locales and SW.
- Automated results: VF0–VF4 `42/42`; i18n `233/233`; Reader parity PASS; row audio unit `3/3` and browser `18/18`; Studio UX `9/9` and `92/92`; Room B6 unit `26/26` plus `45/45`; Room B8 unit `30/30` plus reflow/RTL/zero-write browser PASS.
- Actual owner Studio: release 3.11.399, no update, zero page overflow, zero playing audio, 544 visible/named `role=img` markers with 539 missing, 3 ready and 2 too-long states.
- Isolated production: 380 RU/HE, forced colors, reduced motion, Ben cold-load and Studio Classic/IDE show no overflow, unnamed controls, visible SVG fallback, page error or non-GET request.
- No external primary source changed the decision; the accepted WCAG-informed VF0–VF4 contracts remain current and green.

## 3. Candidate classification

| Candidate | Classification | Reason |
|---|---|---|
| post-closure runtime drift | `NO_GO` | none exists |
| row-audio/TTS VF4 regression | `NO_GO` | current code, owner DOM and automated contract green |
| owner Studio width-persistence quota error | `ROUTE_TO_OTHER_LANE` | storage/presentation persistence owner; no visible visual failure |
| non-audio Reader action localization | `BACKLOG` | explicitly deferred by VF4; no new owner/AT harm evidence |
| Studio/CSS debt counts | `NO_GO` | topology only; current surfaces green |
| specialist emoji/glyph residuals | `BACKLOG` | paired identity/affordance/content/fallback; accepted backlog |
| disk warning | `ROUTE_TO_OTHER_LANE` | production capacity, not VF5; no cleanup authority |
| physical/AT evidence gap | `NO_GO` | accepted limitation, not defect |

Full 20-field ledger: [POST_CLOSURE_SURFACE_COMPONENT_STATE_INVENTORY.md](../research/room-ux-visual-finishing-vf5/2026-08-16/POST_CLOSURE_SURFACE_COMPONENT_STATE_INVENTORY.md).

## 4. F1 — successor gate

Options: `NO_GO_KEEP_PROGRAM_CLOSED`, `REGRESSION_CORRECTION_ONLY`, `ACCESSIBILITY_NECESSITY_ONLY`, `SURFACE_LOCAL_EXCEPTION`, `CSS_DEBT_ONLY`.

- Code evidence: no runtime change after VF4.
- Production evidence: exact byte/version/health convergence.
- Owner-client evidence: current and visually stable in the observed workflow.
- Isolated automation: current production 380/RTL/forced/reduced observations are green; the broader current local contract matrix is also green.
- External primary evidence: none changes the decision; no new standards evidence is needed to reinterpret the accepted contracts.
- Roles: R4/R5/R6/R7/R8 preserve accepted clarity; R11/R16 reject change without a failing current oracle; R12/R15 route storage separately.
- Risk/compatibility/rollback: NO-GO has no release/cache/client risk and preserves current compatibility; rollback is not applicable.
- Recommendation: keep the program closed.

Recommendation / exact approval:

```text
F1=NO_GO_KEEP_PROGRAM_CLOSED
```

## 5. F2 — exact problem and success criterion

Options: `NO_POST_CLOSURE_VISUAL_OR_A11Y_DEFECT`, one named current visual defect, or one named current accessibility necessity.

No qualifying VF5 problem is proved. Success is research completion: reconcile code/production/client/automation, classify every candidate and preserve closure. The quota error is a separate persistence problem; accepted localization backlog remains documented.

- Code evidence: no post-VF4 runtime delta and no new failing visual/a11y contract.
- Production evidence: the inspected served cohort matches source at `3.11.399`.
- Owner-client evidence: the observed Studio workflow has no visual failure; its quota error is routed by canonical persistence ownership.
- Isolated automation: current 380/RTL/forced/reduced/state checks are green.
- External primary evidence: none changes the decision.
- Role critique: R4/R5/R6/R7/R8 find no current learner-facing harm; R11/R16 require a failing oracle; R12/R15 prohibit relabelling persistence debt as visual truth.
- Risk/compatibility/rollback: inventing a visual problem would create scope creep; preserving the current release is backward-compatible and needs no rollback.
- Recommendation: record that no qualifying post-closure defect exists.

```text
F2=NO_POST_CLOSURE_VISUAL_OR_A11Y_DEFECT
```

## 6. F3 — boundary and backlog

Options: no runtime files; one exact surface/component allowlist; broad cleanup.

No runtime file is justified. Immediate scope is only the exact VF5 research directory and this decision packet. Backlog remains non-audio Reader localization and specialist glyph finishing. Other-lane findings are Studio local-storage quota/presentation persistence and production capacity.

- Code evidence: all candidate runtime owners remain unchanged from the accepted VF4 release.
- Production evidence: no candidate needs a source/served correction.
- Owner-client evidence: no bounded visual component failure was observed.
- Isolated automation: the named surface families remain green without owner-state mutation.
- External primary evidence: none changes the boundary.
- Role critique: R11 enforces exact ownership, R12 blocks cross-domain scope, R14/R16 prefer the smallest safe boundary, and R15 routes capacity/storage to their real owners.
- Risk/compatibility/rollback: a null runtime allowlist has zero compatibility and rollback burden; the two routed lanes remain explicit.
- Recommendation: documentation-only closure with no runtime allowlist.

```text
F3=NO_RUNTIME_FILES_DOCUMENTED_RESIDUALS_ONLY
```

## 7. F4 — icon, typography, locale and RTL semantics

Options: keep accepted semantics; create a new icon/type slice; broad standardization.

Current sprite/provenance, existing fonts, semantic parity, fallback and RTL contracts are green. Residual glyph counts do not prove harm. No icon/font/locale runtime decision is necessary.

- Code evidence: the sprite, licence/provenance, font roles and RU/EN/HE locale locks remain intact.
- Production evidence: the served sprite/CSS/locales match source.
- Owner-client evidence: the current Studio controls remain named; no visible icon fallback was established.
- Isolated automation: Room/Studio RU and HE/RTL hydrate icons without visible fallbacks or overflow.
- External primary evidence: none changes the accepted semantic model.
- Role critique: R4/R6/R7/R8 preserve semantic clarity and script roles; R11/R12 reject a glyph sweep without a component defect; R16 rejects a new theme or design-system program.
- Risk/compatibility/rollback: changing accepted shared semantics would widen HTML/SW/locale compatibility risk; keeping them needs no rollback.
- Recommendation: retain the accepted icon, typography, locale and RTL semantics.

```text
F4=NOT_APPLICABLE_KEEP_ACCEPTED_SEMANTICS
```

## 8. F5 — interaction/accessibility contract

Options: keep current accepted contract; one bounded correction; new state platform.

Current focus, marker semantics, non-color signatures, reduced motion, 380/RTL and reflow gates are green. AT speech remains unrun and unclaimed, not a reason to write code. No new red/green interaction contract exists.

- Code evidence: current focus, accessible-name, non-color, forced-colors and reduced-motion rules remain present.
- Production evidence: the served cohort matches those sources.
- Owner-client evidence: 544 visible row markers are named `role=img`, with zero page overflow or active audio.
- Isolated automation: 380 RU/HE, RTL, forced-colors, reduced-motion and state checks are green.
- External primary evidence: none changes the already accepted WCAG-informed contract.
- Role critique: R4/R5/R6/R7/R8 preserve truthful and calm interaction; R11/R14/R16 refuse implementation from an evidence gap; R17 requires explicit evidence-class labels.
- Risk/compatibility/rollback: a speculative interaction rewrite would risk focus/state regressions; keeping the green contract is compatible and needs no rollback.
- Recommendation: retain the current interaction/accessibility contract and keep AT speech `NOT_RUN`.

```text
F5=NOT_APPLICABLE_CURRENT_CONTRACTS_GREEN
```

## 9. F6 — ownership and specificity

Options: keep shared-foundations/surface-local behavior; one bounded owner correction; CSS/platform migration.

The accepted ownership model remains correct. CSS counts are unchanged and do not own the quota error. R11/R12/R16 reject a CSS ownership expansion or a visual workaround for persistence failure.

- Code evidence: shared foundations remain presentation-only; surface-local JS/DOM retain behavior ownership; debt counts are unchanged.
- Production evidence: served CSS/HTML bytes match source and no cascade regression is proved.
- Owner-client evidence: the current Studio layout has zero horizontal overflow despite the separately routed storage error.
- Isolated automation: all reached shared/surface-local consumers remain green.
- External primary evidence: none changes the ownership decision.
- Role critique: R11 requires one canonical owner, R12 prohibits CSS dual truth, R14 favors reversible additive work, and R16 rejects cleanup without measurable value.
- Risk/compatibility/rollback: broad specificity or inline-style cleanup has a larger reach than the absent defect; no change preserves compatibility and needs no rollback.
- Recommendation: keep the accepted shared-versus-surface-local ownership topology.

```text
F6=NOT_APPLICABLE_KEEP_CURRENT_OWNERSHIP
```

## 10. F7 — release safety and rollback

Options: no release; bounded red/green release; broad requalification.

No release is authorized or needed. Implementation-only verification rows are `NOT_APPLICABLE_NO_RUNTIME_SLICE`. Future re-entry requires exact current reproduction, allowlist, red/green, full relevant matrix, old/new SW compatibility and static rollback.

- Code evidence: APP/Room/SW/API/locale locks are already converged and no runtime diff is proposed.
- Production evidence: API/Studio/Room/SW are `3.11.399`; health, DB and migrations are ready; disk warning is routed without cleanup.
- Owner-client evidence: the owner client is already `3.11.399` with no update action.
- Isolated automation: production contexts produced no non-GET request, page error, overflow or fallback defect.
- External primary evidence: none changes release safety.
- Role critique: R11/R14/R15 require exact gates, compatibility and operational ownership; R16 rejects release risk without product value; R17 forbids overstating automation.
- Risk/compatibility/rollback: no release has no old/new HTML/SW split and no static or data rollback; any future approved slice must define both before work.
- Recommendation: no release; preserve only the future regression re-entry protocol.

```text
F7=NO_RELEASE_FUTURE_REENTRY_PROTOCOL_ONLY
```

## 11. F8 — execution

Options: close inquiry; serialized one-slice implementation; parallel/broad work.

Close the inquiry after owner acceptance. Do not produce an implementation packet, commit/push/deploy, apply an update or ask the owner to run a visual protocol. Any separate quota/capacity investigation needs new authority and its own safety boundary.

- Code evidence: research found no executable VF5 scope.
- Production evidence: current production is converged and healthy for the bounded decision.
- Owner-client evidence: the read-only observation is complete and the original tab/URL/state were preserved.
- Isolated automation: the necessary non-owner mode/locale/state evidence is complete and correctly labelled.
- External primary evidence: none changes execution.
- Role critique: R11/R12/R14/R15 require serialized bounded authority; R16 favors closure over ceremony; R17 requires an honest owner-ready evidence handoff.
- Risk/compatibility/rollback: execution would add unjustified release and owner-state risk; closing changes no compatibility surface and needs no rollback.
- Recommendation: close VF5 research successfully and perform no implementation loop.

```text
F8=CLOSE_INQUIRY_NO_IMPLEMENTATION
```

## 12. Verification and rollback

Research verification is recorded in [VERIFICATION_RELEASE_AND_ROLLBACK_PROTOCOL.md](../research/room-ux-visual-finishing-vf5/2026-08-16/VERIFICATION_RELEASE_AND_ROLLBACK_PROTOCOL.md). Every future implementation row is `NOT_APPLICABLE_NO_RUNTIME_SLICE`; only a future regression re-entry protocol is retained. There is no version bump, SW change, deployment, static rollback release or data rollback.

## 13. Risks and routes

| Risk | Boundary | Route |
|---|---|---|
| localStorage quota affects Studio presentation persistence | do not inspect/delete keys or disguise with CSS | separately approved `STUDIO_LOCAL_STORAGE_QUOTA_AND_PRESENTATION_PERSISTENCE` recon |
| disk warning can block later deploy | no cleanup from warning alone | separately authorized production-capacity lane |
| accepted Reader localization backlog | no promotion without current workflow harm | remain backlog |
| physical/AT evidence absent | never relabel automation | optional future evidence, not runtime scope |

## 14. Exact owner response

```text
APPROVE ROOM-UX-VF5-R:
F1=NO_GO_KEEP_PROGRAM_CLOSED;
F2=NO_POST_CLOSURE_VISUAL_OR_A11Y_DEFECT;
F3=NO_RUNTIME_FILES_DOCUMENTED_RESIDUALS_ONLY;
F4=NOT_APPLICABLE_KEEP_ACCEPTED_SEMANTICS;
F5=NOT_APPLICABLE_CURRENT_CONTRACTS_GREEN;
F6=NOT_APPLICABLE_KEEP_CURRENT_OWNERSHIP;
F7=NO_RELEASE_FUTURE_REENTRY_PROTOCOL_ONLY;
F8=CLOSE_INQUIRY_NO_IMPLEMENTATION;
SCOPE=NONE;
```

Changed values are valid owner counter-decisions and must be reconciled before any implementation. This packet authorizes no runtime work, adjacent backlog, B9, security, data, provider, storage or ops action.
