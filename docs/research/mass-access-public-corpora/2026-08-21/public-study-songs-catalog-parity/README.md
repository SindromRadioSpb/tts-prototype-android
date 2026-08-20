# Public Study Songs catalog parity — production evidence

Date: 2026-08-21 (Asia/Jerusalem)

Production URL: <https://linguistpro.kolosei.com/library.html?public_corpus=study-songs>

Application version: `3.11.418`

Implementation commit: `0210b79a14a85a5704b5b3c71040e52346ad0615`

## Product result

The public Study Songs catalog now uses the established Reading Room discovery grammar already used by My Texts:

- one catalog region with the shared introduction and responsive tool shell;
- source-aware search over title and performer, plus title-only and performer-only scopes;
- independent audio-completeness filters;
- corpus-order, title ascending, title descending, and performer ascending sorts;
- bounded 48-item pages with result range, previous/next navigation, and an empty state;
- complete RU/EN/HE copy, Hebrew RTL, keyboard focus, live result count, and accessible control names.

Discovery state is kept per public corpus in browser memory. The release adds no learner, review, publication, source-corpus, or owner-profile writer and changes no publication data.

## Production corpus evidence

- Stable public pointer returned edition `ed_016c8b8a2bd06dd389bd9118` and manifest `6e01c015e9ef2e0ccc05fc319027ca8e327df16b5ace4c1a9287272c83648d0f`.
- Catalog count: 77 works.
- Audio-complete filter: 77 works; technical-exception filter: 0 works.
- First page: `1–48 / 77`; second page: `49–77 / 77`.
- Search `03`: one title match (`איתי לוי - 03`) in title/all scope and zero matches in performer scope.
- Hebrew title-desc sorting was compared against `Intl.Collator("he", { numeric: true, sensitivity: "base" })` and passed.
- A sampled immutable work returned 42 rows; all 42 contained Hebrew, Russian translation, and transliteration.
- A sampled original MP3 returned HTTP 206 and a valid byte range.
- Package HEAD returned HTTP 200, `application/zip`, 43,154,649 bytes, `X-Publication-Package-Complete: true`, and zero missing assets.

## Responsive and accessibility evidence

- Desktop RU, 380×844 RU, and 380×844 HE/RTL were visually inspected.
- At 380×844, document width equaled viewport width and all visible discovery controls were at least 44×44 px.
- Keyboard Tab moved from the search field to the filter disclosure with a visible native outline, remaining inside the catalog region.
- The catalog exposes a named region, named search/scope/sort controls, an `aria-live` result status, pressed-state filter chips, and named pagination.
- Production cache-busted reload restored `1–48 / 77`; cache namespaces all matched `3.11.418`. An offline-emulated reload served the warmed catalog, followed by a successful online reload.
- Console contained only expected anonymous 401 responses from optional authenticated/group endpoints. Public catalog, work, Range-audio, and package requests succeeded; the verification generated GET/HEAD traffic only.

Screenshots:

- [Desktop RU](screenshots/production-public-study-songs-desktop-ru.png)
- [380 px RU](screenshots/production-public-study-songs-380-ru.png)
- [380 px HE/RTL](screenshots/production-public-study-songs-380-he-rtl.png)

## Automated gates

- Focused discovery/public-adapter tests: 11/11 passed.
- Relevant publication/Room suite: 47/48 passed. The single failure is the pre-existing `roomUxMaturity` assertion that assumes every independently revisioned asset query equals the application patch; it was already false on the `3.11.417` baseline and was not weakened for this release.
- i18n smoke: 233/233 passed; locale lock regenerated.
- Publication Center API smoke: passed, including writer isolation, anonymous catalog/work/Range-audio/ZIP, generic withdrawal response, and unchanged source/learner/review/audit counts.
- Publication Center + public Room browser smoke: passed on desktop RU, 380 px RU, 380 px HE/RTL, 200% zoom, keyboard, cache/offline/reconnect, Range audio, and ZIP; page errors 0 and public failed responses 0.
- `smoke:mass-access:p0:red`: guards 8/8, implemented 14/14, pending 0, exit 0.
- Full legacy `npm test`: 1025/1077 passed. The 52 unrelated baseline failures remain in old pinned-version and competing migration-fixture contracts; none was edited or suppressed in this slice.

## Deployment and operations

- No schema or data migration was introduced, so migration rehearsal, production migration, and database backup are not applicable to this UI-only release.
- Five consecutive post-deploy probes returned `3.11.418`, health OK, database ready, migrations ready, and disk usage 79%.
- The previous production image was retained for rollback. No Docker cache, image, volume, database, or backup cleanup was performed.
- B9 Paths/Assignments remains frozen.
- Physical iPhone, VoiceOver, TalkBack, and receipt of the archive through real Telegram/WhatsApp/Files remain owner-device acceptance; they are not inferred from Chromium evidence.
