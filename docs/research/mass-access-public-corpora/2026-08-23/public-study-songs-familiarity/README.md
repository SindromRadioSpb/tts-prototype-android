# Public Study Songs familiarity parity — 2026-08-23

## Outcome

- The learner-facing name of public `study-songs` is now **Публичные учебные песни** / **Public Study Songs** / **שירי לימוד ציבוריים**.
- The canonical publication slug, corpus row, immutable edition, rights facts, source group corpus, and learner truth are unchanged.
- Public catalog cards use the same B7 lower-bound familiarity contract as My Texts, Ben-Yehuda, and restricted group corpora.
- The public sort now includes `familiar_desc` and rejects a misleading no-op when the local learner profile or reliable-ranked items are unavailable.

## Data and safety boundary

`GET /api/public-corpora/:slug/learning-index` is anonymous and read-only. A worker builds a discardable sidecar bound to the current immutable `edition_id`, `manifest_sha256`, every `public_work_id`, every `snapshot_sha256`, and the shared lexical resolver version. Responses contain aggregate pid frequencies and counts only; no title, creator, Hebrew/Russian body, learner state, identity, session, review log, or audit write.

The browser combines those content-free aggregates with the existing local learner projection. The displayed value remains the auditable lower bound (“Не менее N% знакомы”), not a comprehension score. Only `AVAILABLE + rank_eligible` rows participate in reliable-familiarity ranking.

## Verification

- `node --test tests/learningCompass.test.js tests/publicCorpusAdapter.test.js tests/publicationDomain.test.js`
- `node scripts/premium/publication-center-api-smoke.js`
- `node scripts/premium/publication-center-browser-smoke.js`
- `node tests/i18n.smoke.js`
- Browser matrix: 1280px Russian, 380px Russian, 380px Hebrew RTL, keyboard focus, no horizontal overflow or undersized controls.
- API smoke proves anonymous learning-index reads leave source corpus, learner, review, and audit fingerprints unchanged.
- The presenter module is cache-busted at both its import and precache/integrity keys; this prevents a rolling deploy from combining the new catalog UI with a stale presenter export.

## Visual evidence

- [Desktop Russian](screenshots/public-study-songs-desktop-ru.png)
- [380px Russian](screenshots/public-study-songs-380-ru.png)
- [380px Hebrew RTL](screenshots/public-study-songs-380-he-rtl.png)

Production revision and live probes are reported in the release handoff after deployment.
