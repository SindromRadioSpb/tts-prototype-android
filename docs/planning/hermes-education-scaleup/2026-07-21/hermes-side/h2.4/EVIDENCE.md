# H2.4 evidence — Dicta Nakdan on-demand integration

Status: CLOSED on 2026-07-24. Production deploy, live preview, corrected real-song import,
single-use receipt, Library verification and owner verdict all passed.

## 1. Slice and canonical prompt

- Slice: H2.4 Dicta Nakdan, server-side on demand; no MCP tool and no bulk/background processing.
- Canonical prompt: `prompts/H2_04_DICTA_NAKDAN.md`.
- Owner-approved endpoint correction: `https://nakdan-5-1.loadbalancer.dicta.org.il/api`.

## 2. Revisions and release

- Before HEAD and `origin/main`: `d795d648013e42d0e39dfcb1a8076177a229fc89`.
- Candidate app version: `3.11.237` (before: `3.11.236`).
- After revision: `2399c11b9dda50d48326a3c51289bf059cc0119c`.

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
- Production: PASS on image `2399c11`; `/healthz`, DB and migrations ready; public SW, core
  precache, Agent Access and Library release assets match `3.11.237`. Disk settled at 78%; no
  cleanup was performed; rollback images `d795d64` and `de29d35` remain.
- Exactly one authenticated production preview: HTTP 200, schema `nakdan.on_demand.1.0.0`,
  `from_cache:false`, result `שָׁלוֹם עוֹלָם.`, provenance `DICTA_NAKDAN_2026_07_23`.
- Owner-live tool transport: PASS after bounded OAuth recovery, both-container restart and refresh
  of the stale 16-tool `linguistpro-mcp` skill to the live 25-tool surface. Hermes called
  `propose_import_text` and created `ap_e1521c39bff98b307fffb1c5148ed91d`.
- Owner-live content integrity: **FAIL**. The owner-confirmed Reader screenshot ended after a short
  fabricated body rather than the supplied song beginning `את הזמן החולף`. Read-only production
  DB verification showed the confirmed proposal payload was 88 characters / 157 bytes, one logical
  line, three literal backslashes encoding `\n`, first text `כמה עברנו ימים ולילות`, and
  `starts_with_expected=false`; its consumed receipt truthfully recorded `rows_written:1`.
  This isolates the incident to stale Hermes conversation/input, not Nakdan, ticket/receipt, OPFS
  execution or Reader rendering. A completely new chat must create the exact full-body proposal,
  which must be inspected before confirmation. At this incident checkpoint H2.4 correctly remained
  OWNER_LIVE and was not closed.
- Replacement proposal `ap_362d5b90cb5c7561680b22b6bd69a28e` remained `PENDING` and unexecuted
  during read-only verification. Its body integrity passed the bounded checks: 901 characters /
  1599 bytes, 58 real lines, expected first/last lines, zero literal backslashes. Its source
  metadata failed the owner-supplied contract: title was changed to `את הזמן החולף`, author was
  null and the required YouTube URL was null. It must not be confirmed; a final proposal must carry
  both the already-correct full body and the exact source metadata.
- Final proposal `ap_fe9b4872eefb68afdfa8ce5df9cbad64` passed read-only production verification
  before confirmation: `PENDING`, no decision, zero execution tickets; exact title, author
  `מתן חסן`, `OWNER_SUPPLIED` origin, required YouTube URL, `language:he`, `niqqud_status:NONE`
  and exact transformation disclosure. Its body is byte-equal to the verified replacement body:
  901 characters / 1599 bytes / 58 real lines, expected first/last lines and zero literal
  backslashes. Owner execution is now permitted; final Dicta preview, receipt, Library provenance
  and readability verdict remain pending.
- Owner executed the verified final proposal. Read-only production verification: status
  `CONFIRMED`; exactly one execution ticket, issued `2026-07-23T22:39:26.318Z`, consumed once at
  `2026-07-23T22:39:27.425Z`; receipt type `IMPORT_TEXT`, text key
  `agent-4ccadbc06de0cb55fffecb798a9cdc00`, `rows_written:50` (non-empty lines).
- Owner screenshot shows the correct opening rows as separate table rows and machine-niqqud output
  in the dedicated niqqud column; owner states all lines are present.
- Owner verdict: **5/5 — «всё хорошо в этой итерации»**.
- H2.4 closure gate: PASS. H2.5 is unblocked and returns to PLANNED; its own canonical start recon
  and stop conditions remain mandatory.

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
