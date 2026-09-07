# Reading Room corpus-switch / My Texts hotfix

Date: 2026-09-08. Status: PRODUCTION BROWSER ACCEPTANCE PASS; physical-device and assistive-technology acceptance remain separate.

## Owner report and reproduced failure

- Owner report: after the discovery sorting/filtering release, switching between Reading Room corpora hangs and `My Texts` does not open.
- Production baseline was `3.11.487` with local `HEAD == origin/main == e5886edd1441dfc52bad4bc167d37e10f466b8d6`.
- In the owner's ordinary browser profile, switching Ben-Yehuda -> My Texts changed the URL to `#room=mytexts` immediately but left the Ben-Yehuda DOM visible for more than six seconds. The My Texts surface appeared only after roughly 100 seconds.
- The profile contained 299 personal texts. The eventual smart-facet projection was recent 7, with-note 103, audio-noted 0, SRS-noted 0 and templated 103.
- The existing `getPersonalTextFacets()` path did not finish within a 60-second observation. A following trivial `COUNT(*)` then waited 46.67 seconds, proving that the first query was still monopolizing the tab's single OPFS database worker rather than the switch click or router failing.

## Root cause

The discovery release added four correlated smart-facet subqueries. Each used this shape for every personal text:

```sql
EXISTS (
  SELECT 1 FROM notes_v2 n
  WHERE n.text_id = t.id
     OR EXISTS (SELECT 1 FROM note_occurrences no
                WHERE no.note_id = n.id AND no.text_id = t.id)
)
```

The `OR` across a direct note link and a nested occurrence link prevents the intended indexed lookup shape and repeatedly scans `notes_v2`. Four such scans per text make the aggregate pathological on a mature owner profile. Because all local reads share one OPFS worker, later corpus renders queue behind it. `renderMyTextsCorpus()` also kept the previous corpus visible while awaiting facets, so a slow but valid transition looked like an ignored click.

This was introduced by discovery commit `c06a1bca`; the router and corpus switcher were not the cause.

## Repair

- `getPersonalTextFacets()` now constructs `note_links` once from indexed direct `notes_v2.text_id` and `note_occurrences.text_id` paths, aggregates one `note_flags` row per text, and left-joins those flags into the personal-text aggregate.
- Note-backed search and smart filters use the same indexed direct/occurrence paths through one `_noteForTextExistsSql()` helper. Search parameters are duplicated deliberately because both `UNION ALL` branches contain the same predicates.
- `renderMyTextsCorpus()` replaces the previous corpus with the existing loading state synchronously, before it awaits any local projection.
- Corpus switcher options expose stable `data-corpus` identifiers so browser regression checks do not depend on locale-specific labels.
- The cache/integrity cohort is bumped together to `3.11.488`: page version, module imports, service worker and server shell-integrity paths.

No schema, note, learner-state, review, publication, source-corpus, provider or B9 behavior changes. No production storage or Docker cleanup is authorized by this hotfix.

## Evidence and gates

- A read-only equivalent of the new set-based smart-facet query returned the same owner-profile counts in 381 ms. The provider facet took 148 ms, levels 25 ms and tags 20 ms.
- Structural regression rejects the old correlated `n.text_id = t.id OR EXISTS (...)` shape, requires the set-based facet CTEs, and requires loading state before the facet promise.
- `node --test tests/roomB6ScaleResilience.test.js tests/catalogDiscovery.test.js`: 17/17 PASS.
- Full unit suite: 1366/1366 PASS. Current-cohort visual locks: 39/39 PASS. i18n: 233/233 PASS. Shell gate: 321/321 PASS. API smoke: PASS with client config `3.11.488`.
- The pre-existing B6 browser harness was repaired to use the page's initialized, cache-busted `window.__localDB` module rather than creating an uninitialized second module instance. Its 5,000-item resilience, history, mutation, mobile, RTL, dark-theme and accessibility run passes 45/45.
- Comprehensive isolated browser smoke: PASS. It covers 65-row pagination, row/note/tag/provider/smart filters, five My Texts reloads, public/group/Ben catalogs, Studio discovery, real Import Center archive flows, desktop, 380 px, dark theme and Hebrew RTL.
- Explicit lateral switch sequence without page reload: My Texts -> public fixture 624 ms -> Ben-Yehuda 165 ms -> My Texts 143 ms. Every transition is bounded to 10 seconds; the previous Ben-Yehuda surface is removed immediately.
- The comprehensive browser run proves `review_log` byte-for-byte unchanged, zero provider requests and zero page errors. Expected signed-out 401s, fixture-index 404s and cancelled background requests are logged separately and are not application page errors.
- Production acceptance requires exact `3.11.488` client config, service worker and shell hashes; repeated health/reload probes; then the same lateral switch in the owner's existing browser profile with My Texts counts unchanged and no console error. The evidence below satisfies that browser boundary.

## Production release and owner-profile acceptance

- Release commit `cbf67fb780d4992c935968b89226370f492a31cb` is live as `3.11.488`.
- Five repeated uncached probes after the release and again after capacity cleanup returned health `ok`, database ready, migrations ready, and the same `3.11.488` cohort in client config, service worker and Reading Room HTML. All 43 published shell-integrity hashes matched their live responses.
- In the owner's existing ordinary browser profile, the pre/post `review_log` fingerprint remained exactly 7,758 rows with SHA-256 `688839bce8b13302f4f10f236de020d2d6a3ab35c7f66c969f44632af5cf76ad`. The non-archived text count remained 438; My Texts remained 299.
- Three complete Ben-Yehuda -> My Texts round trips finished without reload. Ben-Yehuda completed in 476/556/397 ms; My Texts first showed the honest loading state and then completed in 1,966/1,912/1,777 ms with 48 rendered cards and `1–48 / 299`.
- Public Study Songs completed with 48 cards and `1–48 / 77` in 797 ms; returning to My Texts completed with 48 cards and `1–48 / 299` in 2,020 ms. The public-corpus surface currently retains the legacy `#room=benyehuda` hash representation; acceptance therefore keys on the rendered corpus identity and result completion, not that legacy hash.
- Two subsequent ordinary full reloads completed the owner-profile My Texts result in page ages 3,592 ms and 3,053 ms. Each held exactly one OPFS database-owner lock with none pending. The browser console contained zero errors.

## Separately authorized capacity cleanup

The hotfix itself did not authorize storage mutation. After deployment filled the host filesystem, the owner separately authorized a safe cleanup. The cleanup removed only 7.767 GB of Docker build cache and five container-unreferenced older LinguistPro images. It retained the live `cbf67fb7` image, the immediate `e5886edd` rollback image, all eight containers, all three named volumes, backups and user data.

After cleanup the host had 9.0 GB available (75% used; health metric 76%), the disk warning was false, all eight containers were running and healthy, database and migrations were ready, and both retained LinguistPro images resolved by immutable ID.

Physical-device, VoiceOver and assistive-technology acceptance remain separate from this browser hotfix.
