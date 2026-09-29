# Room Home repeated loading — 3.11.696

Owner reported 7–10 repetitions of “Собираем следующий шаг” on
`/library.html#room=hub`, then normal operation. Owner tab subsequently showed
3.11.695 and a working home; the original episode was not instrumented.

## Reproduction and cause

`refreshExternalLibrary` subscribed to every `localdb:changed` notification and
called `loadData → renderTrack → renderCorpusHub`. The hub cleared its DOM and
reran recommendations on every notification. Opening/importing/synchronizing
Studio can emit many legitimate commits. Notifications were not scoped to the
affected tables. This reproduced the reported visual symptom without a document
navigation: ten cross-tab notices produced ten loading skeletons and replaced
the mounted home. It does not prove that the owner's original document navigated.

## Fix and evidence

- Mounted Home retains its DOM and controls. External changes invalidate caches
  and show one inline Refresh library action, with RU/EN/HE labels.
- Explicit refresh reads current SQLite data. Notifications during the first
  render are retained; background notifications cannot start a competing boot.
- Async refresh cannot repaint over a reader/navigation started while it waited.
- Returning to a tab without an intervening change does not rerender the home.
- `node scripts/premium/room-hub-refresh-smoke.js`: before **FAIL**, ten skeletons;
  after **PASS**, zero skeletons, same DOM and keyboard focus. A real text created
  from another tab appears in the count after explicit refresh. Mobile 380px
  has no horizontal overflow. No owner DB writes or model requests.
- 26 targeted module/integrity/context tests and 233 i18n checks PASS.

Production verification is recorded separately after deployment. This release
does not change SQLite writes, learning grades, or service-worker activation.
