# ROOM-UX-VF — VF0 implementation evidence

> Date: 2026-08-15  
> Status: `OWNER_200_PASS_READY_TO_DEPLOY`  
> Source commit: `12dacd9a403ff8db2b7ad2dd20abf98e6c241386`  
> Branch: `main`; candidate implementation commit `d1a929707440320b7795932be64d4d4b893fc0fe`; `origin/main` remained at the source commit through the owner gate  
> Worktree: `DIRTY`; 34 pre-existing entries were preserved. The scoped ROOM-UX-VF research, docs, runtime, test and screenshot files are enumerated in the implementation packet.  
> Production: `https://linguistpro.kolosei.com/library.html#room=benyehuda`, still served `3.11.388`; no deploy occurred  
> Local verification: `http://127.0.0.1:8791/library.html#room=hub`, served `3.11.389`  
> Evidence classes: `CODE`, `OWNER_APPROVAL`, `OWNER_REPORTED`, `OWNER_LIVE_READ_ONLY`, `ISOLATED_AUTOMATION`, `EXTERNAL_PRIMARY`  
> Limitations: no physical-mobile device or NVDA/VoiceOver/TalkBack run. The actual desktop Chrome 200% result is owner-reported in response to the exact checklist; it is not represented as agent-observed, physical-mobile or AT evidence.

## 1. Outcome

VF0 is implemented and locally green for its additive foundation, icon provenance, SW/version, offline, locale, RTL, focus-utility, forced-colors, reduced-motion and static compatibility contracts. It does not adopt an SVG in a live component and therefore produces no intended component-level visual rewrite.

The owner reported `PASS` on 2026-08-15 in direct response to the requested local `3.11.389` actual Chrome 200% RU and HE/RTL checklist: no horizontal page overflow, lost actions or broken long-title wrapping. This clears the deployment gate. It remains owner-reported desktop evidence, separate from the earlier 380px automation and from physical-mobile/AT evidence.

VF1 has not started.

## 2. Implemented contract

- `visual-foundations.css`: existing Studio light/dark primitives, `--lp-*` role aliases, Room compatibility names, existing-font script roles, six spaces, bounded radii/elevation/targets, five status roles, focus utility, `0/120/140/160/180 ms` motion and shared presentational state anatomy.
- No reset, `@layer`, `!important`, surface component selector, `@font-face`, remote URL or runtime dependency.
- `linguistpro-ui.svg`: 23 audited Lucide system symbols plus four first-party product/surface marks; 5,161 bytes.
- Complete Lucide ISC and Feather-derived MIT notices; no npm icon package.
- Foundation link loads before Studio/Reader/Room legacy CSS. The later legacy definitions remain complete fallbacks for one compatibility release.
- SW precaches the CSS and sprite; Studio, Room, SW and API source all resolve to `3.11.389` locally.
- No JS, locale, schema, migration, data, provider, telemetry, B9 or security-lane change.

## 3. Red → green evidence

Initial command:

```text
node --test tests/visualFoundations.test.js
```

Before assets/links/version existed: `8 tests; 1 pass; 7 fail`. Failures named the missing CSS, sprite, licence/provenance, shell links, precache entries and `3.11.389` lock.

After implementation and the contrast extension: `9 tests; 9 pass; 0 fail`.

The final test verifies:

- exact additive files and serialized VF1 block;
- foundation-before-legacy order and retained fallback declarations;
- byte-equivalent established light palette values and compatibility aliases;
- approved typography/geometry/status/focus/motion roles;
- no global reset, surface ownership grab, new font or remote dependency;
- WCAG 4.5:1 status text and 3:1 meaningful icon contrast in light/dark tokens;
- exact 23-system/4-first-party symbol allowlist, 18 KB cap and inert SVG constraints;
- licence/provenance coverage and exact pinned revision;
- precache and one `3.11.389` public version.

## 4. Regression gates

| Gate | Result |
|---|---|
| VF0 + B0–B8/audio node tests | `67/67 PASS` |
| i18n smoke | `233/233 PASS` |
| Reader parity | `PASS`: 37 leaf checks, 4 builder cases, 4 reader fixtures |
| JS syntax | `public/sw.js` and `tests/visualFoundations.test.js` PASS `node --check` |
| Status contrast | all light text ratios ≥6.61, icons ≥3.07; all dark text ≥10.34, icons ≥5.78 |
| Runtime assets | CSS `11,647 B`; sprite `5,161 B`; sprite below 18 KB budget |

Existing Node `MODULE_TYPELESS_PACKAGE_JSON` warnings remain unchanged and are not caused by VF0.

## 5. Licence and provenance

External primary sources were the official [Lucide repository](https://github.com/lucide-icons/lucide), [1.27.0 release](https://github.com/lucide-icons/lucide/releases/tag/1.27.0) and [licence](https://github.com/lucide-icons/lucide/blob/4aec3f892fd6c23063bc2fead83c899b5d412b1c/LICENSE).

- `git ls-remote` resolved tag `1.27.0` to `4aec3f892fd6c23063bc2fead83c899b5d412b1c`.
- All 23 ledger rows were re-hashed from Git blobs at that commit: `23 checked; 0 mismatches`.
- The committed licence copy is byte-equal to the upstream Git blob: SHA-256 `b495047bd93a9b06913511076f504daba17d5bbeb3e0650f3bb53a4220329c57`.
- First-party mark geometry is explicitly separated from Lucide derivatives.

## 6. Browser evidence

### Isolated local Room

| Row | Evidence | Result |
|---|---|---|
| 380×844 RU | Chrome DevTools + persisted screenshot | `clientWidth=380`, `scrollWidth=380`, no overflow, `3.11.389` |
| 380×844 HE/RTL | Chrome DevTools + persisted screenshot | `lang=he`, `dir=rtl`, main direction RTL, `380=380`, no overflow |
| desktop RU/EN/HE | Playwright at 1440×900 | all three localized titles rendered; `scrollWidth=clientWidth=1440`; no writes |
| real baked fixture | fresh non-owner OPFS import | Learning Home rendered Ben-Yehuda rows including long Hebrew titles; no synthetic owner content |
| stylesheet | computed/browser sheet list | foundation fetched `200`, 23 parsed top-level rules, loaded before Reader/Room legacy CSS |
| SVG | temporary isolated utility probe | external `<use>` fetched `200 image/svg+xml` and returned non-zero geometry |
| reduced motion | `emulateMedia(reducedMotion=reduce)` | media matched; hover/overlay `0ms`; spin `animation:none` |
| forced colors | `emulateMedia(forcedColors=active)` | media matched; focus `2px solid`; box-shadow removed; icon adjustment `auto` |
| dark/auto | Chrome dark emulation | computed body page `#0f172a`, card `#1e293b`, focus `#93c5fd`, error fg `#fecaca` |
| keyboard | first 12 Tab stops | order is shell → track tabs → primary reading action → journey actions; recent actions retain 3px focus, legacy shell retains the known 1px UA outline |
| network authority | request capture | zero non-GET/HEAD/OPTIONS requests in the RU/EN/HE visual runs |

The anonymous local shell still logs the pre-existing `/api/agent-access/proposals/summary` 404 and unauthenticated 401 probes. All new static requests succeeded; request-failure capture was empty.

### Service worker and offline

- Active controller: local `/sw.js`; caches: `linguistpro-precache-v3.11.389`, runtime and config.
- Both `/css/visual-foundations.css` and `/icons/linguistpro-ui.svg` matched the `v3.11.389` precache with status 200 and correct content types.
- Under Chrome offline network emulation, a reload returned the complete HE Learning Home, foundation CSS and sprite from the controlled origin with no horizontal overflow.

### Compatibility

| Scenario | Result |
|---|---|
| current HTML + unavailable foundation CSS | Learning Home ready at 380; legacy surface colors present; no overflow |
| baseline `12dacd9a` HTML + current assets/API | Learning Home ready at 380 without a foundation sheet; API normalized the footer to `3.11.389`; no overflow |
| sprite failure before adoption | structurally safe: VF0 has zero live sprite consumers, so no control can become blank |

These are isolated static/SW compatibility smokes, not proof of a rolling multi-container production deployment.

### Owner-live boundary

The authorized Kapture production tab remained at `https://linguistpro.kolosei.com/library.html#room=benyehuda`. Research evidence already covered real Ben-Yehuda rows and the read-only aggregate of 115 real My Texts, including long mixed titles, media/progress variants and unchanged `review_log`. VF0 implementation did not navigate, reload, zoom, filter or change that owner tab. A separate temporary Kapture localhost tab was created and closed; it contained a fresh non-owner origin only.

## 7. Findings carried into VF1

- The current HE shell updates localized `title` descriptions but some icon-only controls retain Russian `aria-label` names (`Студия`, `Наставник`, `Синхронизация`). This is concrete a11y evidence for the already-approved VF1 Room/i18n allowlist, not authorization to widen VF0.
- Legacy shell controls still show a 1px UA focus outline; recent reading actions show the stronger 3px ring. VF1 should adopt the foundation focus utility without changing tab order.
- Live emoji remains intentionally unchanged in VF0. SVG adoption and localized text/Unicode fallback begin only in VF1.

## 8. Release gate and rollback

Current decision: `READY_PUSH_DEPLOY`.

Owner-reported gate receipt:

1. actual Chrome browser-UI 200% on local `3.11.389` Room: `PASS`;
2. RU and HE/RTL, no horizontal overflow, lost action or broken long-title wrapping: `PASS`;
3. evidence class: `OWNER_REPORTED`; not agent-observed, physical-mobile or assistive-technology evidence.

Remaining work is production-only: push the scoped commits, wait for served `3.11.389`, verify SW/static assets, run a read-only real-corpus smoke, and record production separately.

No schema or data rollback exists. Static rollback restores the prior HTML/SW version and removes the two foundation links; legacy styles remain complete throughout.
