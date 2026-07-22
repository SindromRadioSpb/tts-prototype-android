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

The retry deployed revision `a3684ec12b9e4f8431c08dbe846675f799382f6b` successfully:

```text
/api/client-config: version=3.11.222
/healthz: ok=true db.ready=true migrations.ready=true disk_pct_used=70 disk_warn=false
/.well-known/oauth-protected-resource/agent-access:
  scopes_supported=16, morphology.read=true
```

Hermes install/restart evidence:

```text
config: morphology.read present; get_word_morphology selected
global SOUL: H2.1 mandatory morphology policy present; config/SOUL backups=2
restart order: hermes-agent -> hermes-webui
WebUI health: status=ok, sessions=0, active_streams=0
hermes mcp list: linguistpro = 17 selected, enabled
hermes mcp test linguistpro: connected; tools discovered=17; get_word_morphology visible
```

Before re-consent, a real Hermes-SDK call returned the expected fail-closed boundary:

```json
{"tool_visible":true,"tool_count":17,"ok":false,"error_code":"INSUFFICIENT_SCOPE"}
```

A fresh 16-scope PKCE request and ru consent card visibly stated
`PUBLIC_DICTIONARY_MORPHOLOGY` and
`NO_LEARNER_DATA_NO_LLM_NO_NETWORK_NO_SYNTHESIZED_FORMS`. The owner selected all 16 categories,
confirmed the retention boundary, and approved the request. Token exchange returned 200 and the
stored scope set contains exactly 16 scopes including `morphology.read`.

Post-consent live Hermes-SDK transcript (token values never printed):

```json
{"tool_visible":true,"tool_count":17,"ok":true,"schema_version":"aa.word_morphology.1.0.0","resolution":"EXACT","lemma":"לכתוב","root":"כתב","binyan":"paal","confidence":"EXACT","provenance":"PEALIM_OFFLINE_V12","resolver_version":"word-morphology-resolver-v1","dataset_version":"pealim-infl-v12"}
```

## Owner-live ordinary Hermes session

Owner prompt required Hermes to analyze `כשתבוא`, call `get_word_morphology` first, and avoid filling
missing fields from memory. The owner supplied this response transcript:

```text
Результат вызова get_word_morphology для слова כשתבוא:
- Лемма: לבוא
- Корень: בוא
- Биньян: paal
- Время: FUTURE
- Число: SINGULAR
- Лицо: Инструмент не вернул поле лица (person).
- Грамматическая форма с огласовками: תָּבוֹא
```

Verdict: **PASS**. The ordinary agent called the required tool, grounded the stacked proclitic,
reported only returned morphology, and explicitly refused to invent the absent `person` field.
The owner supplied a qualitative successful transcript; no numeric rating is invented. H2.1 is
`CLOSED`, and H2.2 becomes `PLANNED`.
