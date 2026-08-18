# Post-closure surface × component × state inventory

Artifact date: `2026-08-16`

## Evidence passport

- Source/branch: `main@d3c2e2cc4fde6fefa1b75c5769b93de8dad542a0`; local/remote `main` converged.
- Dirty: 34 unrelated entries preserved; only exact VF5 documents added.
- Production: both Room and Studio at `3.11.399`; API/SW also `3.11.399`; health/DB/migrations ready; disk 86% warning.
- URLs: `https://linguistpro.kolosei.com/library.html`, `https://linguistpro.kolosei.com/index.html`.
- Owner client: Chrome `3.11.399`, no update, Studio URL preserved.
- Evidence: `CODE_CURRENT`, `PRODUCTION_READBACK`, `OWNER_CLIENT_READ_ONLY`, `AUTOMATED_LOCAL`, `ISOLATED_AUTOMATION`.
- Limitations/safety: no physical device/AT; no owner Library navigation, content/state/provider/cache write or production non-GET action.

## Surface matrix

| Surface | Components | States inspected | Current evidence | Result |
|---|---|---|---|---|
| Library/L0 | shell, track tabs, Journey, lists, state anatomy, footer/update | initial, loading, empty, offline, reconnect, stale/update, focus | B6 `45/45`, B8 reflow/RTL/write guard PASS; isolated production 380 RU/HE has no overflow/unnamed control/update | closed |
| Ben-Yehuda | identity, Ready preview, Catalog, filters, vertical rows | cold preparation, ready, filtered/partial | isolated production cold load reached 16 work rows/12 Ready rows, `aria-busy=0`, no overflow/page error/write | closed |
| My Texts | identity, true empty, filters, paged rows | true empty, filter-empty, error | isolated empty state had no page error/write; B6/B8 current gates cover paged/filter/reflow states | known empty/error grammar debt remains backlog, not new |
| Group corpora | identity, catalog rows, protected state | initial, ready, limited/error | current closed contracts and source ownership unchanged | cache revocation/security remains other lane |
| Reader | bilingual table, row marker, row TTS, sticky header | missing/ready/mismatch/too-long/working/loading/playing/error | exact current row-audio `3/3` unit + `18/18` browser; production bytes match | closed |
| Morph | sheet, word/status/provenance/focus | loading, exact/likely, due, overlay, forced colors, reduce | current VF2 contract PASS; current CSS has bounded focus/reduce/forced-color rules | closed |
| Trainer | tabs, prompt, reveal, grading/summary | loading, empty, teach/prompt/reveal/error | B8 and existing Room contracts green; no current new evidence | closed |
| Mentor | home, consent, plan/evidence actions | loading, empty, consent, error | current VF2/visual contracts green; served JS matches source | closed |
| Studio Classic | shell, next action, import/status, empty table | initial, loading/stale/disabled/error, focus | Studio UX `9/9` + browser `92/92`; isolated production 380 RU no overflow/unnamed/page error/write | closed |
| Studio IDE | shell, panels, table, row markers, replay | initial/partial, missing/ready/too-long, focus | actual owner 544 visible markers, all named `role=img`, zero overflow/audio/update; one storage-quota console error routed out | visual closed; persistence finding routed |

## Candidate issue ledger

### VF5-01 — post-closure runtime drift

1. ID: `VF5-01`.
2. Surface/workflow: all VF0–VF4 surfaces; current shell load.
3. DOM/selector owner: existing surface owners.
4. Behavior/truth owner: existing VF0–VF4 contracts.
5. Source evidence: no runtime diff after `8dda777d`.
6. Production evidence: inspected files are byte-identical to current source.
7. Owner-client evidence: current client `3.11.399`, no update.
8. Automation: `42/42`, `233/233`, parity and surface gates green.
9. Prior backlog: not applicable.
10. Severity/users: none proved.
11. RU/EN/HE: release lock symmetric.
12. RTL: isolated HE 380 no overflow.
13. Reflow: B8 200%-equivalent and 380 gates green.
14. Keyboard/AT: focus automation green; AT speech not run.
15. Forced colors/motion: current contract gates green.
16. Offline/stale: B6 and release lock green.
17. Boundary: none.
18. Prospective allowlist: none.
19. Blast radius: any runtime change is larger than leaving no defect.
20. Rollback: not applicable.
21. Recommendation: `NO_GO`.

### VF5-02 — VF4 row-audio/TTS regression hypothesis

1. ID: `VF5-02`.
2. Surface/workflow: Studio/Reader bilingual rows and audio readiness.
3. DOM owner: `.row-audio-ind`, `.row-tts-btn`; Reader core plus Studio duplicate path.
4. Truth owner: existing audio asset/profile/link writers.
5. Source: current VF4 semantics/signatures remain present.
6. Production: exact CSS/JS/HTML bytes match.
7. Owner client: 544 markers: 539 missing, 3 ready, 2 too-long; all named `role=img`; no audio playing or overflow.
8. Automation: row-audio `18/18`, atomic action names and non-color/motion contract green.
9. Prior backlog: VF4 is closed/accepted, not backlog.
10. Severity/users: no regression observed.
11. Locale: RU/EN/HE label keys green.
12. RTL: HE isolated contract green.
13. Reflow: 380 zero overflow.
14. Keyboard/AT: DOM/ARIA green; AT speech not run.
15. Forced colors/motion: five signatures and static reduced-motion result green.
16. Offline/stale: release/SW locks green.
17. Boundary: none.
18. Allowlist: none.
19. Blast radius: reopening shared Reader/Studio code would exceed evidence.
20. Rollback: not applicable.
21. Recommendation: `NO_GO`.

### VF5-03 — Studio table-width persistence quota error

1. ID: `VF5-03`.
2. Surface/workflow: actual owner Studio IDE auto-restores a 544-row table.
3. DOM/code owner: `saveTableSettings()` in `public/index.html`; key `ide.table.widths.v1`.
4. Truth owner: local presentation persistence, not visual state.
5. Source: `localStorage.setItem` is caught and logged.
6. Production: served `index.html` matches source.
7. Owner client: current console reports `QuotaExceededError`; layout remains visible with zero overflow.
8. Automation: empty isolated contexts do not reproduce owner-profile quota.
9. Prior backlog: not a VF0–VF4 visual item.
10. Severity/users: persistence/reliability impact is plausible for a storage-full profile; no visible failure proved.
11. Locale: locale-neutral.
12. RTL: not implicated.
13. Reflow: current owner layout has no overflow.
14. Keyboard/AT: not implicated.
15. Forced colors/motion: not implicated.
16. Offline/stale: local-storage capacity/ownership investigation required.
17. Smallest boundary: separately named Studio local-storage quota/presentation-persistence recon.
18. Prospective allowlist: intentionally not defined in VF5; storage inspection/mutation is outside authority.
19. Blast radius: quota cleanup/key migration would exceed a visual slice and risks owner state.
20. Rollback: must be defined by that lane; no owner key deletion is allowed here.
21. Recommendation: `ROUTE_TO_OTHER_LANE` — `STUDIO_LOCAL_STORAGE_QUOTA_AND_PRESENTATION_PERSISTENCE`.

### VF5-04 — non-audio Reader action localization

1. ID: `VF5-04`.
2. Surface/workflow: Reader note/edit/column-resize actions in EN/HE.
3. DOM owner: shared builder in `public/js/reader-core.js`.
4. Truth owner: existing note/edit/resize behavior.
5. Source: Russian titles/names remain hardcoded for note/edit/resizer actions.
6. Production: served module matches source.
7. Owner client: no current EN/HE owner Reader workflow was opened.
8. Automation: source/parity establishes presence, not current workflow harm.
9. Prior backlog: explicitly recorded and excluded by VF4.
10. Severity/users: potential localized AT friction; no new current production harm evidence.
11. Locale: affects EN/HE; RU is native.
12. RTL: semantics, not geometry.
13. Reflow: no layout change proposed.
14. Keyboard/AT: potential name-language mismatch; no AT speech session.
15. Forced colors/motion: not implicated.
16. Offline/stale: any later correction requires locale/SW lock.
17. Boundary: shared Reader non-audio action labels only, if independently re-entered.
18. Prospective allowlist: not authorized; would require exact Reader/locales/release/test list.
19. Blast radius: shared Studio/Reader parity is larger than current unproved harm.
20. Rollback: future static revert/re-release only.
21. Recommendation: `BACKLOG`.

### VF5-05 — Studio/CSS debt counts

1. ID: `VF5-05`.
2. Surface/workflow: Studio and shared CSS cascade.
3. Owner: existing surface sheets/inline Studio shell.
4. Truth owner: none; topology only.
5. Source: Studio has 446 inline styles/347 `!important`; other counts unchanged.
6. Production: current bytes match stable source.
7. Owner client: visible workflow has zero horizontal overflow.
8. Automation: surface gates green.
9. Prior backlog: explicitly deferred by VF0–VF4.
10. Severity/users: no current user-visible defect from counts.
11. RU/EN/HE: the topology counts are locale-neutral; no locale regression is evidenced.
12. RTL: isolated HE/RTL has no failing evidence attributable to the cascade counts.
13. Reflow: owner and isolated 380/reflow checks show no page overflow attributable to the debt.
14. Keyboard/AT: current focus/name contracts are green; no AT speech claim is made.
15. Forced colors/motion: current forced-colors and reduced-motion contracts are green.
16. Offline/stale: current B6/release-lock evidence is green; no debt-induced failure is evidenced.
17. Boundary: none safely justified.
18. Allowlist: none.
19. Blast radius: broad cleanup is much larger than leaving debt.
20. Rollback: technically static but verification cost disproportionate.
21. Recommendation: `NO_GO`.

### VF5-06 — specialist emoji and glyph residuals

1. ID: `VF5-06`.
2. Surface/workflow: specialist Studio controls, content and status fallbacks.
3. Owner: surface-local HTML/JS/locale copy.
4. Truth owner: control label or content, not the glyph.
5. Source: examples include `🎙 C1`, note/training/audio/export tab decoration and Unicode fallbacks.
6. Production: current owner Studio exposes the C1 control; SVG consumers hydrate with zero visible fallback in isolated runs.
7. Owner client: no unnamed shell regression proved.
8. Automation: isolated Studio reports zero unnamed controls.
9. Prior backlog: specialist emoji replacement was explicitly deferred.
10. Severity/users: no measured workflow harm.
11. Locale: paired text/name remains owner.
12. RTL: non-directional identity/status glyphs are not mirrored.
13. Reflow: no overflow.
14. Keyboard/AT: names remain on controls; decorative icons are silent.
15. Forced/motion: no finding.
16. Offline/stale: Unicode remains compatibility fallback.
17. Boundary: none.
18. Allowlist: none.
19. Blast radius: sweep would violate the no-emoji-sweep rule.
20. Rollback: not applicable.
21. Recommendation: `BACKLOG`.

### VF5-07 — disk warning

1. ID: `VF5-07`.
2. Surface/workflow: production operations, not UI.
3. Owner: host/container capacity.
4. Truth owner: `/healthz` disk telemetry.
5. Source: no visual owner.
6. Production: `disk_pct_used=86`, `disk_warn=true`; app/DB/migrations ready.
7. Owner client: no visible release/update failure.
8. Automation: not applicable.
9. Prior backlog: capacity is operational, separate from Visual Finishing.
10. Severity/users: future deployment risk, not current visual harm.
11. RU/EN/HE: not applicable to host capacity.
12. RTL: not applicable to host capacity.
13. Reflow: not applicable to host capacity.
14. Keyboard/AT: not applicable to host capacity.
15. Forced colors/motion: not applicable to host capacity.
16. Offline/stale: no current application offline/stale failure; a future deployment capacity risk is routed separately.
17. Boundary: evidence-first production capacity lane.
18. Allowlist: none in VF5.
19. Blast radius: cleanup can remove rollback assets if mishandled.
20. Rollback: ops lane must preserve active/required rollback images and all volumes/data.
21. Recommendation: `ROUTE_TO_OTHER_LANE`; no cleanup authorized.

### VF5-08 — physical-device and AT evidence gaps

1. ID: `VF5-08`.
2. Surface/workflow: all accepted visual surfaces.
3. Owner: verification evidence, not runtime.
4. Truth owner: explicit owner/device/AT reports.
5. Source evidence: no source defect follows from a missing evidence class.
6. Production evidence: current production checks are green, but they are not physical-device/AT evidence.
7. Owner-client evidence: the actual Chrome observation is desktop and not AT speech.
8. Automation: isolated mobile-sized, RTL, forced-color and reduced-motion evidence remains separately labelled and cannot become physical/AT evidence.
9. Prior state: explicitly accepted limitation at closure.
10. Severity/users: unknown because no defect is evidenced.
11. RU/EN/HE: automated locale coverage is green but does not convert the evidence gap.
12. RTL: isolated HE/RTL is green but is not a physical-device result.
13. Reflow: 380 and 200%-equivalent automation is green but is not physical-device owner evidence.
14. Keyboard/AT: DOM/focus automation is green; VoiceOver/NVDA/JAWS/TalkBack remain `NOT_RUN`.
15. Forced colors/motion: automated forced-colors/reduced-motion checks are green and remain automation.
16. Offline/stale: automated coverage is green and does not change the missing physical/AT class.
17. Boundary: future verification only if owner chooses; no implementation scope.
18. Allowlist: none.
19. Blast radius: manufacturing code from an evidence gap is larger than leaving accepted closure.
20. Rollback: not applicable.
21. Recommendation: `NO_GO`.
