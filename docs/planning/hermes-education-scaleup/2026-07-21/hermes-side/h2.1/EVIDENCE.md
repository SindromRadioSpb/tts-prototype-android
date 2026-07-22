# H2.1 evidence — get_word_morphology

Date: 2026-07-23

Baseline HEAD: `ee4a2cc2a00ffac4d35a6fce0c671526b0eeea0d`

Package: `3.11.221` -> `3.11.222`

Capability version: `aa-v0.1` (unchanged)

## Gate and owner correction

- `G-H1-CLOSURE: PASS`, `G-H2-START: PASS`, exact owner decision `Д5: GO H2`.
- H2.1 was `PLANNED` before work and is `IN_PROGRESS` until production consent and owner-live pass.
- The live `agent_connection_grants.scope` CHECK contained only the previous 15 scopes. The owner
  explicitly approved migration 054 and correction of the original no-migration rollback assumption.
  Migration 054 widens the CHECK to 16 scopes and is a backward-compatible superset.

## Measure before code

`public/data/inflection/pealim-infl-v12.json.gz` was read through server-side `fs` + `gunzip`:

- gzip bytes: `3463862`; JSON bytes: `34761326`;
- top-level keys: `model_version`, `paradigms`, `index`;
- dataset/model version: `pealim-infl-v12`; paradigms: `9279`;
- sample paradigm keys: `lemma`, `lemma_niqqud`, `root`, `pos`, `binyan`, `kind`, `meaning`,
  `source`, `pealim_id`, `pealim_url`, `model_version`, `gizra_note`, `disambig`, `cells`, `form`.

The resolver reuses the shipped pure cores from `notes-autogen.js` and `proclitic-segment.js`.
It performs no LLM, provider, Dicta, or network call. The index is lazy and process-local. An
adversarial heap pass reduced retained JS heap from about 344 MiB to 164 MiB by sharing candidates
between indexes and retaining compact paradigm metadata. Measured cold resolution of four acceptance
words was about 1.6 s; cached calls were 0-12 ms on the development host.

## Schema diff

`schema-before-sha256.json` records all 16 pre-H2.1 input/output schema hashes at baseline HEAD.
The H2.1 smoke recomputes every hash from the changed tree:

```text
[agent-word-morphology] PASS 72 checks; acceptance 5/5; tools 16 -> 17; existing schema hashes unchanged
```

Diff verdict: exactly one tool/schema pair added, `get_word_morphology`; no existing input or output
schema changed. `get_agent_connection` retains its historical closed scope enum and filters the new
scope from that legacy payload; the new scope remains discoverable through OAuth consent and its own tool.

## Local gates

```text
npm run smoke:agent-word-morphology
PASS 72 checks; acceptance 5/5; tools 16 -> 17; existing schema hashes unchanged

npm run smoke:agent-access
PASS checks=39 capabilities=17 network_calls=0 provider_calls=0 live_data_reads=0

npm run smoke:agent-access:production-handlers
PASS checks=61 network_calls=0 provider_calls=0 llm_calls=0 byok_calls=0

npm run smoke:agent-access:mcp
PASS checks=57 tools=17 protocol=2025-11-25 external_network_calls=0 provider_calls=0

npm run smoke:agent-access:control-plane
PASS checks=54 external_network_calls=0 provider_calls=0

npm run smoke:agent-access:oauth
PASS lifecycle checks=24; restore PASS

npm run smoke:agent-access:oidc-loopback
PASS authorization_code_pkce_s256; negativeCases=17

npm run smoke:agent-access:oauth-deployment
PASS deployment + B0 adapter + B2 consent bridge

npm run test:api-smoke
API smoke: OK
```

The optional two-client fixture did not execute because this workstation does not contain the Hermes
source checkout/`uv.lock` required by `AA2C2_HERMES_REPO`; the installed Docker Hermes runtime is
verified separately below. This is an environment prerequisite failure, not a product assertion failure.

## Acceptance cases

| Case | Result |
|---|---|
| `לכתוב` | `EXACT`, lemma/root/binyan/provenance from Pealim |
| `בא` | `AMBIGUOUS`, adjective + verb alternatives, neither `EXACT` |
| `כשתבוא` | unique lemma `לבוא`, confidence `PROBABLE`, future |
| `garbage` | typed `AA_INVALID_INPUT`, non-retryable |
| `זזזזזז` | successful `UNRESOLVED/NOT_IN_DICTIONARY`, empty entries |

## Production, Hermes, consent, owner-live

Scoped implementation commit `7b0a0a3` was pushed to `main`. The first webhook arrived while the
production root disk was at 100%, leaving the old `ee4a2cc` container active and Coolify/Coolify DB
unhealthy. A bounded cleanup removed exactly 12 inactive H1 doc-build app images, retained the active
image plus the two nearest rollback images (`f4ea132`, `c6dbcec`), and removed only inactive build
cache. No volume, service image, or active container was removed. Result: disk 100% -> 64%, 14 GiB
free, Coolify and its DB healthy.

Pending Coolify deployment retry. This section must be completed with production
revision/health, live `tools/list`, a real call transcript, Hermes restart/new-session evidence, consent
ceremony result, and the owner's live verdict before H2.1 can become `CLOSED`.
