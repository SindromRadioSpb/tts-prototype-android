# Reading Room B6 Scale & Resilience — engineering closure

Дата: 2026-08-12

Статус: **CLOSED · OWNER ACCEPTED · D6 PASS · GA GO**

Owner decision: `B6-R D1–D6`, утверждён до кода.

Implementation: `main@485ba466`

Release version: `3.11.360`

Production read-back: **VERIFIED 2026-08-12 00:28 IDT**.

## Owner acceptance

После успешного выполнения опубликованного краткого D6 smoke-check владелец
явно сообщил:

> Протестировано успешно. Актуализируй документацию.

Эта строка закрывает physical/assistive gate и B6 целиком. Она подтверждает
PASS перечисленных сценариев, но не добавляет отсутствующие device/build или
artifact metadata.

## Реализованный контракт

| Decision | Результат |
|---|---|
| D1 cursor + exact total | versioned opaque cursor, predicate fingerprint, exact total, stable keyset pages, mutation restart, light allowlisted card |
| D2 history + session | versioned compact presentation state, structural URL, 24h/8KiB session mirror, read-only popstate restore |
| D3 waiting safe point | SW waiting by default, explicit activation, Room progress flush/read-back, Studio dirty/edit/media guards, no unconditional controller reload |
| D4 local-only now | bounded local diagnostic ring + explicit JSON export; no beacon, endpoint or learner-ingest reuse |
| D5 packet budgets | 1k/5k automated budgets and memory/DOM/latency gates committed and green |
| D6 full physical matrix | owner сообщил PASS полного краткого smoke-check; physical/assistive gate принят, точные build/artifact metadata не переданы |

## Evidence ledger

- B6 targeted automation: `45/45`.
- 5k exact total/window: `5 000 / 48`; payload `18 159 B`.
- cold/warm p95/search p95: `46.82 / 47.17 / 20.72 ms`.
- retained heap/DOM/long-task: `+162 284 B / +4 / 0`.
- B6 + frozen B0–B5 unit: `24/24`.
- B0–B5 full browser matrix: `838/838`.
- i18n/canon/memory: `233/233`, `18/18`, `79/79`.
- RU/HE-RTL × light/dark 380px and desktop 200% evidence inspected.
- `review_log` synthetic guard unchanged; owner profile was not mutated.
- D6 physical/assistive smoke: owner-reported PASS; explicit acceptance quoted above.

Raw evidence:
[`docs/research/room-ux-b6-scale-resilience/2026-08-12/`](../research/room-ux-b6-scale-resilience/2026-08-12/README.md).

The auxiliary continuity single-run remains explicitly inconclusive on one
environment-sensitive 50 ms measurement; accepted baseline fails the same
check on the same machine. No threshold was weakened, and targeted B6
open/search/load/back remains green. This does not reopen B0–B5.

## Release boundary

Production `client-config`, Room, Studio and SW report `3.11.360`. Manifest
SHA-256 exactly matches the local release bytes for `library.html`,
`library-ui.js`, `room-b6-core.js` and `local-db.js`; all four returned HTTP
200. Three consecutive health read-backs reported app/DB/migrations green.
Clean Chromium profiles at 380px passed RU/LTR/light and HE/RTL/dark with
`0` page errors, `0` HTTP 5xx and `0` horizontal overflow.

Engineering, production and owner D6 acceptance are complete. B6 is closed and
may be labelled `GA GO` within the recorded evidence precision. Exact device/OS/
browser/AT builds and test recordings were not supplied, so narrower claims
about particular builds remain prohibited.

B7–B9 and visual finishing are outside this closure.
