# ROOM-UX-VF4-R — Residual Visual Quality successor research-session prompt

```text
ROOM-UX-VF4-R — Residual Visual Quality Successor Decision
MODE=GOAL_RESEARCH_ONLY
DATE=2026-08-16
```

Working directory:

```text
E:\projects\tts-prototype-android
```

## 1. Goal-mode objective

Start a Goal-mode session whose bounded objective is:

```text
Determine from current code and current production whether any residual Visual Quality successor after the owner-accepted VF0–VF3 program is justified; prepare an evidence-backed owner decision packet with a valid NO_GO option, exact boundaries, verification and rollback, without making runtime or production changes.
```

Create the goal at the beginning of the session, keep one explicit working plan current, and mark the goal complete only after all research artifacts and the decision packet exist and the owner handoff is ready. Research completion is the goal; implementation is not.

The central question is not “what can be polished next?” but:

> Is there a concrete, user-visible, evidence-backed residual problem important enough to justify reopening a bounded visual implementation lane after VF0–VF3, or should the program remain closed?

`NO_GO_CLOSE_PROGRAM` is a first-class successful research result. Do not manufacture VF4 scope from the old backlog.

## 2. Read first

Read completely in this order:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/PROJECT_ROLES.md`
4. `docs/planning/ROOM_UX_VISUAL_FINISHING_DECISION_PACKET_2026_08_15.md`
5. `docs/planning/ROOM_UX_VISUAL_FINISHING_IMPLEMENTATION_PACKET_2026_08_15.md`
6. `docs/planning/ROOM_UX_VISUAL_FINISHING_VF3_IMPLEMENTATION_PACKET_2026_08_16.md`
7. `docs/research/room-ux-visual-finishing/2026-08-15/VF0_IMPLEMENTATION_EVIDENCE.md`
8. `docs/research/room-ux-visual-finishing/2026-08-15/VF1_IMPLEMENTATION_EVIDENCE.md`
9. `docs/research/room-ux-visual-finishing/2026-08-15/VF2_IMPLEMENTATION_EVIDENCE.md`
10. `docs/research/room-ux-visual-finishing/2026-08-15/VF3_IMPLEMENTATION_EVIDENCE.md`
11. `docs/research/room-ux-visual-finishing/2026-08-15/CURRENT_VISUAL_SYSTEM_INVENTORY.md`
12. `docs/research/room-ux-visual-finishing/2026-08-15/STATE_AND_MOTION_AUDIT.md`
13. `docs/research/room-ux-visual-finishing/2026-08-15/TOKEN_AND_CSS_OWNERSHIP_MAP.md`
14. `docs/planning/ROOM_LIBRARY_CORPUS_SURFACE_PROGRAM_CLOSURE_2026_08_15.md`
15. `docs/planning/ROOM_AUDIO_TTS_INDICATOR_PARITY_IMPLEMENTATION_EVIDENCE_2026_08_15.md`
16. `docs/planning/ROOM_UX_B9_CURATED_PATHS_ASSIGNMENTS_FREEZE_2026_08_15.md`
17. `docs/planning/ROOM_UX_B6_B9_VISUAL_FINISHING_HANDOFF_2026_08_11.md`

Read only additional current visual/a11y/locale evidence that is directly relevant. Current code and served production win over historical claims.

Before research, summarize in 5–10 lines:

- what VF0–VF3 shipped and what the owner accepted;
- the current source commit, branch, dirty status and production/client version;
- which product/DOM/locale/truth contracts remain immutable;
- which residual questions are genuinely open;
- why the session has no runtime authorization.

## 3. Closed and frozen baseline

Treat these as closed unless there is concrete new regression, security or accessibility evidence:

- VF0 foundations, sprite/licence/provenance, shared focus/status/motion tokens;
- VF1 Library/L0/corpus visual finishing;
- VF2 Reader, Morph, Trainer and Mentor visual finishing;
- VF3 Studio Classic/IDE shell finishing;
- the approved thesis `B_EDITORIAL_CALM` with additive migration discipline;
- `V2=VENDORED_SVG_PLUS_FIRST_PARTY_MARKS` and its bounded sprite/fallback contract;
- `V3=EXISTING_FONTS_EXPLICIT_SCRIPT_ROLES` and RU/EN/HE semantic parity;
- `V4`–`V8` shared presentation roles with surface-local behavior ownership;
- Library/L0 versus corpus-local ownership, vertical typed rows, bounded previews and no horizontal rails;
- Reading Journey, Reading Lists, progress, Finished, bookmarks, notes, `review_log`/FSRS, audio state and every canonical writer;
- profile-fit provenance and the prohibition on opaque recommendation feeds;
- B0–B8 and the closed Library/Corpus successor program;
- B9 Path/Assignment design, schema and migration: `FROZEN · NO IMPLEMENTATION · NO MIGRATION`;
- `GROUP-CORPUS-CACHE-REVOCATION`, which remains a separate future security lane.

The production baseline is release `3.11.398`. VF3 implementation commits are `c1656c0b` and `a71e37a8`; final evidence commit is `dc8b8f55`. The owner applied the client update, the updated real-client Kapture smoke passed, and the owner reported `VF3 PROD=PASS` on 2026-08-16.

No successor may add or change learner data, recommendations, assignments, progress, grading, telemetry, providers, schema, migrations or owner-content lifecycle.

## 4. Research question and candidate outcomes

Audit post-VF0–VF3 reality before naming a successor. Compare at least these outcomes:

- **A — `NO_GO_CLOSE_PROGRAM`:** the remaining issues are low-value, specialist, isolated or safely backlog; keep VF0–VF3 closed.
- **B — `TARGETED_RESIDUAL_A11Y_STATE`:** one bounded cross-surface correction only where current production proves a focus, accessible-name, contrast, reduced-motion or truthful-state defect.
- **C — `SURFACE_LOCAL_SPECIALIST_FINISH`:** one explicitly named surface and small component family where repeated legacy emoji or hierarchy materially harms real use.
- **D — `CSS_DEBT_ONLY`:** internal specificity/token cleanup without a user-visible problem; presume `NO_GO` unless it removes a measured regression risk with a smaller blast radius than leaving it.

A hybrid is valid only if it has one visual thesis, one bounded ownership domain and an exact file allowlist. “Replace the remaining emoji,” “clean 446 inline styles,” “finish everything” and “make it more modern” are not valid scopes.

Evaluate through R4/R5/R6/R7/R8/R11/R12/R14/R15/R16/R17. Use R1/R2/R3/R9/R10 only where a visual proposal risks changing linguistic, learning, graph or provenance truth.

## 5. Required code recon

At minimum inspect the current post-VF3 versions of:

- `public/css/visual-foundations.css`;
- `public/icons/linguistpro-ui.svg`, licence and provenance;
- `public/library.html`, including embedded/late styles;
- `public/index.html`, including Classic/IDE shell and current inline-style/specificity topology;
- `public/css/reader-core.css` and `public/css/reader-morph.css`;
- `public/js/library-ui.js`, `reader-core.js`, `morph-host.js`, `mentor-home.js` and direct visual consumers;
- `public/i18n/locales/ru.js`, `en.js`, `he.js`;
- current icon/emoji occurrences across Library, Ben-Yehuda, My Texts, group corpora, Reader, Trainer, Mentor and Studio;
- current loading, empty, filter-empty, partial, offline, reconnect, stale/update, disabled and error presentations;
- current focus/hover/pressed states, target sizes, forced-colors and reduced-motion coverage;
- custom-property ownership, duplicate aliases, specificity, inline styles and `!important` use;
- `public/sw.js`, exact version/asset/locale keys and old/new client compatibility;
- VF0–VF3 contract tests and current visual/browser/a11y smoke fixtures.

Build an exact residual `surface × component × state × evidence` inventory. For every candidate issue record:

1. current selector/DOM owner and canonical behavior owner;
2. whether it is user-visible in production;
3. whether VF0–VF3 already intentionally left it backlog;
4. severity and affected real workflow;
5. RU/EN/HE, RTL, 380/reflow, keyboard/AT and offline implications;
6. smallest possible implementation boundary;
7. regression blast radius, compatibility and rollback;
8. `GO`, `BACKLOG` or `NO_GO` recommendation.

Do not count source emoji occurrences as defects without classifying identity, status, affordance, content and decoration and then observing the relevant live component.

## 6. Live production and browser evidence

Use the connected authorized owner Chrome/Kapture client. Production is:

```text
https://linguistpro.kolosei.com/library.html
https://linguistpro.kolosei.com/index.html
```

At research start:

1. verify API/Studio/Room/SW release convergence;
2. claim the actual owner tab read-only;
3. verify the client footer/version and update-banner state;
4. preserve the current URL, corpus and owner state;
5. inspect current real Library/corpus and Studio fixtures without opening/grading/editing a text.

Real surfaces should include the currently open corpus plus bounded landing/catalog observations for Ben-Yehuda and My Texts when safe. Treat every group, reading list and personal text as owner data, never as a disposable fixture.

Do not mutate owner content, progress, Finished, bookmarks, notes, reading lists, review state, groups, catalog metadata, presentation settings, provider settings or caches during research. Do not invoke TTS/ASR/MT/LLM or any non-GET provider/data action.

Use isolated non-owner automation for 380×844 RU and HE/RTL, reduced motion, forced colors, offline/error simulation and any mode/locale switch that would change owner settings. Record automation as `ISOLATED_AUTOMATION`, never as physical device, AT or owner-live evidence.

Capture screenshots only when they materially prove a candidate gap. Store user-visible captures under the research artifact directory with a provenance index; never leave them only in `.tmp`.

## 7. Required owner decisions

Prepare exact decisions for:

- F1 successor gate: `NO_GO_CLOSE_PROGRAM` versus one bounded successor;
- F2 user-visible problem and success criterion;
- F3 exact surface/component/file allowlist and explicit backlog;
- F4 icon/typography/RTL semantics, if relevant;
- F5 focus/contrast/state/motion/reduced-motion contract, if relevant;
- F6 shared versus surface-local CSS ownership and specificity strategy;
- F7 verification, old/new client/SW compatibility and static rollback;
- F8 serialized implementation/deployment/owner-acceptance plan.

For each decision include:

- options;
- code evidence;
- current production evidence;
- updated owner-client Kapture evidence;
- isolated automation evidence;
- external primary evidence only when it changes the decision;
- R4/R5/R6/R7/R8/R11/R12/R14/R15/R16/R17 critique;
- risk, backward compatibility and rollback;
- recommendation and exact approval value.

If F1 is `NO_GO_CLOSE_PROGRAM`, F2–F8 must document why no runtime slice is justified and where any low-priority observations live. Do not create an implementation-shaped plan after a NO_GO result.

## 8. Research artifacts

Create:

```text
docs/research/room-ux-visual-finishing-vf4/2026-08-16/
```

Minimum:

1. `README.md`
2. `VF0_VF3_CLOSED_BASELINE.md`
3. `RESIDUAL_SURFACE_COMPONENT_STATE_INVENTORY.md`
4. `LIVE_OWNER_CLIENT_EVIDENCE.md`
5. `A11Y_MOTION_RTL_REFLOW_GAP_AUDIT.md`
6. `CSS_TOKEN_OWNERSHIP_AND_DEBT_MAP.md`
7. `SUCCESSOR_OPTIONS_AND_ROLE_SYNTHESIS.md`
8. `VERIFICATION_RELEASE_AND_ROLLBACK_PROTOCOL.md`
9. `FINDINGS.md`
10. `screenshots/README.md` when screenshots are captured

Decision packet:

```text
docs/planning/ROOM_UX_VISUAL_FINISHING_VF4_DECISION_PACKET_2026_08_16.md
```

Every artifact includes date, source commit, branch, dirty status, production URL/version, actual client version, evidence classes and limitations. Preserve unrelated dirty files.

## 9. Future implementation verification matrix

Prepare, do not overclaim:

- exact red/green contract for the approved residual defect;
- desktop RU/EN/HE;
- 380×844 RU and HE/RTL;
- actual 200% owner-browser reflow and long mixed titles where relevant;
- keyboard-only order, visible focus after transitions and sticky/overlay obscuration;
- screen-reader DOM/ARIA as a separate AT row;
- current light/dark/auto and system color-scheme behavior; no new theme program;
- forced colors and status-not-by-color;
- reduced/no-motion equivalence;
- loading, empty, partial, offline, reconnect, stale/SW-update and error states that are actually in scope;
- Reader/Morph/Trainer/Studio parity where shared styles can reach them;
- no horizontal page overflow;
- no new learner/provider/network writes;
- old HTML/new SW, new HTML/old SW and sprite/CSS failure fallback;
- exact APP_VERSION/Room footer/SW/API/locale lock;
- static rollback with no data rollback.

## 10. Mandatory future deployment loop

Any later approved implementation must use this exact terminal loop before owner handoff:

1. run all local/unit/browser gates and diff hygiene;
2. make only the approved scoped commit and push;
3. wait for the active production image to match the pushed commit;
4. verify repeated API/Studio/Room/SW convergence and `/healthz`;
5. connect to the actual owner Chrome/Kapture client;
6. preserve the current owner URL, then click the visible `Обновить` / `Update` action yourself;
7. if no update action appears, prove that the real client already runs the new release; if it is stale, diagnose SW/update state and do not hand off;
8. after the update, run the real-client production smoke on the actual owner profile;
9. if any bug is found, fix it, rerun local gates, commit/push/redeploy, apply the next client update and repeat the complete production smoke;
10. hand off only after the updated real client is green.

Do not ask the owner to perform the update. Do not represent isolated automation as the updated real-client gate. Opening pages is not enough: record client version, update state, DOM/ARIA/focus, overflow, console errors/warnings and the relevant visible contract after the update.

If deployment is blocked by disk pressure, cleanup authority is limited to evidence-first removal of unused build cache and demonstrably unused old images. Never remove volumes, running containers, database/OPFS/user data, or the active and required rollback images. No cleanup is needed merely because authority exists.

## 11. Stop list

Before explicit `APPROVE ROOM-UX-VF4-R`:

- no runtime/CSS/HTML/JS/i18n/icon/font/asset edits;
- no version or service-worker bump;
- no schema, migration or data changes;
- no B9 code, migration, content or AI-curation substitute;
- no `GROUP-CORPUS-CACHE-REVOCATION` work;
- no IA/navigation/component-platform rewrite;
- no broad Studio inline-style cleanup;
- no owner content, learning state, presentation-key or provider mutation;
- no production update click unless needed only to establish the current research baseline;
- no cache/image cleanup;
- no commit, push or deploy;
- no physical-device or AT claim from Kapture/automation;
- no presumption that a VF4 implementation must exist.

After the decision packet, stop and wait for:

```text
APPROVE ROOM-UX-VF4-R:
F1=...;
F2=...;
F3=...;
F4=...;
F5=...;
F6=...;
F7=...;
F8=...;
SCOPE=...;
```

Changed values are valid owner counter-decisions and must be reconciled before implementation. `F1=NO_GO_CLOSE_PROGRAM` closes the successor inquiry without runtime work.
