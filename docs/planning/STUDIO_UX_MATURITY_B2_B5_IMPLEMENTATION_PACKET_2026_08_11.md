# Studio UX Maturity — B2–B5 implementation packet

Date: 2026-08-11  
Decision: option B approved by the owner; after the iPhone hotfix the owner explicitly authorized B2–B5  
Source commit / production: `495409564b01ef493718f05f691b50cb635a5722` / `3.11.346`  
Target client version: `3.11.347`

## Outcome

B2–B5 close the remaining continuity and hierarchy gaps without changing OPFS canon, provider
defaults, media acquisition, transcript/table revisions, saved-text semantics or Reading Room
canon.

- B2 stores a browser-local 24-hour Downr return intent containing exactly a validated YouTube
  `video_id`, creation/expiry time and `choose-downloaded-media`. It is replaceable and explicitly
  discardable. It never stores bytes or claims that a download succeeded.
- B3 renders one read-only Import Center catalog from the existing learning-material inventory and
  unmatched media workspaces. A read cannot promote a workspace, mint a material id or duplicate a
  workspace already represented by a material.
- B4 collapses secondary navigation at 380px, keeps every expert action reachable, and places the
  phase plus the single next CTA above the first viewport. Provider disclosure is a short summary
  before file choice and gains cost/detail only after media readiness exists.
- B5 changes saved success to `Continue learning` and opens that exact saved text through the
  existing `?room=1#/t/…` Reading Room route. RU/EN/HE explain local/cloud/cost in ordinary
  language.

## Preserved contracts and regression risks

| Slice | Existing capability at risk | Must remain unchanged | Proof |
|---|---|---|---|
| B2 | YouTube preview, captions paste, Files picker | Downr remains external; no download-success receipt; picker cancellation keeps recovery | intent unit tests and popup-blocked/reopen browser flow |
| B3 | P4 export/restore/recovery and material authority | existing material keys/actions; no schema/write/promotion on catalog read | pure merge/filter tests plus P4 browser smoke |
| B4 | desktop navigation and expert controls | desktop expanded; every mobile section reachable after disclosure; one primary CTA | desktop + 380 RU/HE browser matrix |
| B5 | saved session restore and Room deep links | exact saved `textId`; existing Room router and DB-close boundary | browser-intercepted direct Room target and Room-media regression |

## Exact allowlist

```text
public/index.html
public/sw.js
public/js/studio-import.js
public/js/import-center-core.js
public/js/studio-portable-learning-package.js
public/i18n/locales/ru.js
public/i18n/locales/en.js
public/i18n/locales/he.js
tests/i18n.locale-version.lock.json
tests/studioUxMaturity.test.js
tests/importCenterCore.test.js
scripts/premium/studio-ux-maturity-browser-smoke.js
docs/planning/STUDIO_UX_MATURITY_B2_B5_IMPLEMENTATION_PACKET_2026_08_11.md
```

## Stop list

- no database schema, migration or data rewrite;
- no changes to media-package revisions, exact bindings or saved learning-material canon;
- no Downr replacement, server downloader or automatic external action;
- no provider-default/fallback change;
- no Reading Room redesign;
- no master Roadmap edit;
- no cleanup or staging of unrelated dirty files.

## Gates

1. Red/green unit contracts: Downr expiry/replacement/discard and B3 no-duplicate/no-promotion
   catalog merge.
2. Studio browser: desktop RU and iPhone-UA 380 RU/HE, light/dark coverage, one primary CTA,
   no overflow, phase above fold, collapsed/reachable navigation, Downr close/reopen/discard,
   mobile Gemini-only truth and direct saved-text Room target.
3. Import Center browser: desktop, 380 RU/HE and 200% zoom; existing recovery/export actions;
   zero provider requests.
4. Reading Room media regression, including exact 3-cue/2-row binding.
5. Full i18n symmetry/cache-bust lock and `APP_VERSION == CACHE_VERSION`.
6. Production health, DB/migrations and public revision/version convergence after deployment.

The broad `portableLearningPackageUi.test.js` still contains the pre-existing stale literal
assertion that `studio-exact-binding` must occur in `public/index.html`. Since the iPhone hotfix,
the binding activation correctly lives in `public/js/library-ui.js`; the focused Room gate proves
the live contract. This slice does not rewrite that unrelated legacy assertion.

## Owner-live iPhone checklist

Automation is engineering evidence, not owner-live PASS.

1. Safari tab and installed PWA: YouTube link → Downr → return after tab eviction/reload. Confirm
   Studio says it remembers the link but does not claim the file was downloaded; choose the file.
2. Start a second URL and confirm it replaces the first; use `Start with another link` and confirm
   the remembered flow disappears.
3. Open Import Center with one unfinished transcript and one saved material. Confirm the three
   filters show one entity each where expected and no media appears twice.
4. At 380-class width in RU and HE/RTL, confirm `Sections and settings` starts collapsed, all old
   controls remain reachable, and the phase/next action are visible before scrolling.
5. Select an actual M4A/MP4. Confirm Gemini/cloud disclosure appears before upload and the cost/time
   estimate appears before pressing Transcribe; no Companion/token UI appears on iPhone.
6. Save a material, tap `Continue learning`, and confirm the exact same material opens in Reading
   Room. Recheck original row replay/player synchronization and a cold reopen.

No GA/owner-live claim is made until these actual-device checks pass.
