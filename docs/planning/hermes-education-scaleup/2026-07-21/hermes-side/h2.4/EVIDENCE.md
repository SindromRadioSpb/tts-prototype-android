# H2.4 evidence — Dicta Nakdan on-demand integration

Status: ENGINEERING_COMPLETE locally on 2026-07-23. Production deploy, one live preview and
owner-live import remain; H2.4 is deliberately not CLOSED.

## 1. Slice and canonical prompt

- Slice: H2.4 Dicta Nakdan, server-side on demand; no MCP tool and no bulk/background processing.
- Canonical prompt: `prompts/H2_04_DICTA_NAKDAN.md`.
- Owner-approved endpoint correction: `https://nakdan-5-1.loadbalancer.dicta.org.il/api`.

## 2. Revisions and release

- Before HEAD and `origin/main`: `d795d648013e42d0e39dfcb1a8076177a229fc89`.
- Candidate app version: `3.11.237` (before: `3.11.236`).
- After revision: the scoped H2.4 commit containing this artifact; record the immutable hash in
  STATUS after commit/deploy.

## 3. Implemented boundary

- Dedicated `db/premium/nakdanOnDemand.js`: normalized whole-text SHA-256 cache, identical
  in-flight coalescing, concurrency 1, starts at most once per second, 10-second timeout,
  three-failure/30-second circuit breaker, bounded 15-minute/50-entry ephemeral server cache.
- `POST /api/niqqud/on-demand`: same-origin JSON, authenticated session, CSRF, 10/minute IP
  envelope; typed `NAKDAN_INVALID_INPUT` / `NAKDAN_UNAVAILABLE`; audit stores purpose/hash/cache
  metadata only, never personal text or returned niqqud.
- H2.3 import-preview and Library owner button require an explicit user action and outbound-data
  confirmation. Provider failure never blocks the plain-text import.
- OPFS stores machine output only under `sentences.meta_json.niqqud_derived`; asserted
  `he_niqqud` and explicit `edit_meta_json.edited.he_niqqud` always win. Whole-body edits,
  insertion, deletion and reorder invalidate/remove derived cache. Read projection exposes
  `niqqud_authority:"DERIVED"` plus provenance and the Reader shows a derived badge.
- No schema/MCP capability change, no migration, no corpus/library fan-out.

## 4. Commands and local results

- `npm run smoke:nakdan-integration` — PASS, 7 grouped checks: observed token parser and
  provenance; sequential + simultaneous cache; <=1 request/s/concurrency 1; hash projection and
  invalidation; asserted refusal; typed outage + open circuit + plain import; security/UI/i18n/SW wiring.
- `node scripts/premium/agent-w1-family-smoke.js` — PASS, 25 checks.
- `npm run smoke:reader-mytexts` — PASS in a clean real OPFS at 380x844: derived save/read,
  body invalidation, asserted refusal, one button per own-text card, no horizontal overflow,
  corpus/search/facets/reader surfaces. Screenshots: `.tmp/corpus-hub-380.png`,
  `.tmp/mytexts-380.png` (scratch evidence, intentionally untracked).
- `npm run smoke:reader-parity` — PASS (37 leaf checks, 4 builder cases, 4 parity cases);
  `npm run smoke:reader-context` and `npm run smoke:reader-ctx-overlay` — PASS. Ordinary rows
  remain byte-parity; authority/provenance fields are emitted only for derived rows.
- `npm run test:api-smoke` — PASS, including cross-origin 403 and anonymous 401 before Nakdan.
- `npm run smoke:i18n` — PASS 226/226.
- `npm run smoke:agent-access` — PASS 50; `npm run smoke:agent-access:production-handlers`
  — PASS 61; `npm run smoke:agent-access:control-plane` — PASS 54.
- `node scripts/premium/agent-word-morphology-smoke.js` — PASS 72, acceptance 5/5.
- `node scripts/premium/agent-text-coverage-smoke.js` — PASS 75, acceptance 5/5.
- `node scripts/premium/group-song-corpus-smoke.js` — PASS.
- `node --test` — unchanged known baseline: 269 passed / 9 failed / 278 total. The failures are
  pre-existing classic-HTML and GCP/BYOK fixture assertions and are unrelated to H2.4.
- `node --check` on the server client, server, Agent Access and mock smoke; esbuild parse/bundle
  checks on `local-db.js`, `library-ui.js`, `reader-core.js` — PASS.

## 5. Gates, owner-live and next slice

- Local engineering gates: PASS. Stable mock makes no live Dicta call.
- Production: pending preflight, scoped push/deploy, actual image wait, `/healthz`, migration-ready
  check and exactly one live production preview.
- Owner-live: pending one real song imported without source niqqud, with machine preview accepted;
  owner must record readability verdict. Until then H2.4 remains ENGINEERING_COMPLETE/OWNER_LIVE,
  never CLOSED.
- H2.5 remains blocked by H2.4 production verification and owner-live closure.

## 6. Incidents and unrelated findings

- Required first live Node fetch to the original canonical endpoint returned HTTP 404 HTML. Work
  stopped before mutation. Owner then approved the corrected endpoint and one additional fetch.
- Interactive Chrome at 380px opened the local shell but its persistent OPFS profile rendered an
  empty Library main after tab switch, without console errors. The canonical clean-profile
  Playwright/real-OPFS smoke passed and produced the mobile screenshots; no product defect was
  inferred from the persistent-profile state.
- Existing unrelated dirty and untracked files were neither changed for H2.4 nor staged.

## 7. Actual Nakdan request/response shape (secrets removed)

Only the two owner-authorized measure calls were made: old endpoint 404, corrected endpoint 200.
No credential or secret was present.

Request:

```json
{
  "task": "nakdan",
  "genre": "modern",
  "data": "שלום עולם. אני לומד עברית.",
  "addmorph": false,
  "keepqq": false
}
```

Corrected-endpoint response: HTTP 200, `application/json`, top-level array of 10 token objects.
Observed structural shape (provider-internal field values intentionally elided without inventing
their scalar types):

```text
Array<{
  word: string,
  sep: boolean,
  options: string[],
  fpasuk: <provider value>,
  fconfident?: <provider value>
}>

first lexical token: { word: "שלום", sep: false, options: ["שָׁלוֹם", ...] }
following separator: { word: " ", sep: true, options: [] }
```

Separator characters are separate `sep:true` tokens with empty `options`; lexical tokens use a
string array in `options`, and the first option is the selected Nakdan result. The implementation
does not assume a stale nested-option format.
