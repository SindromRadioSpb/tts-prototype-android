# H2.2 evidence

## Measure-before-code

| Question | Observed fact | Implementation consequence |
|---|---|---|
| Ben-Yehuda body | Server has filesystem access to all baked chapter rows; the old 796-work vocab sidecar covers only 86.72% of sampled tokens and is not complete enough | Read and tokenize the complete baked work at request time; never treat the sidecar as truth |
| Personal body | The server replica stores complete synced rows, while S1 metadata does not contain the body | Read the complete replica only after sync consent plus the existing live connection-bound S2 grant |
| Learner state | Live server truth is `review_log` plus `srs_projections`; no server `word_status` table exists | Build a read-only deterministic projection with the shared lemma keyer and FSRS engine version guard |
| Morphology | Shipped `pealim-infl-v12` and the H2.1 resolver are server-readable | Reuse its unique-pid resolution; ambiguity/OOV remain unresolved; no LLM/network fallback |
| Runtime | Cold sample: 1,734 tokens about 1.95 s; warm sample: 1,370 tokens about 27 ms; measured largest baked work: 16,556 tokens about 210 ms after index load | Bounded resolver caps: 250,000 tokens and 50,000 token types |

Production repair (2026-07-23): the first live call found 265 current `fsrs6-core-v2`
projection rows and 4 historical `fsrs6-core-v1` rows. Rejecting the whole projection for one stale
derived row made every text unavailable. `stale-engine-filter-v1` now ignores only stale scheduled
rows (conservative `unknown`) while retaining manual marks and current-engine rows; it never promotes
stale memory to known.

Owner-approved correction (2026-07-23): the original “no migration” note conflicted
with the live closed CHECK on grant scopes. Migration 055 widens it from 16 to 17
scopes so `learner.coverage.read` is a real independently revocable grant.

## Gates

```text
npm run smoke:agent-text-coverage
PASS 75 checks; acceptance 5/5; both source classes verified; tools 17 -> 18

npm run smoke:agent-word-morphology
PASS 72 checks; acceptance 5/5; existing schema hashes unchanged

npm run smoke:agent-access
PASS checks=40 capabilities=18 network_calls=0 provider_calls=0 live_data_reads=0

npm run smoke:agent-access:mcp
PASS checks=58 tools=18 protocol=2025-11-25 external_network_calls=0 provider_calls=0

npm run smoke:agent-access:production-handlers
PASS checks=61 network_calls=0 provider_calls=0 llm_calls=0 byok_calls=0

npm run smoke:agent-access:control-plane
PASS checks=54 external_network_calls=0 provider_calls=0

npm run smoke:agent-access:oauth
PASS lifecycle checks=24; restore PASS

npm run smoke:agent-access:oidc-loopback
PASS authorization_code_pkce_s256; negativeCases=17

npm run smoke:agent-access:oauth-deployment
PASS deployment + B0 adapter + B2 consent bridge

npm run smoke:agent-personal-texts
PASS checks=36; real complete-source extractor verified

npm run test:api-smoke
API smoke: OK

fresh temporary DB migration 001 -> 055
PASS appliedCount=55; agent_connection_grants CHECK contains learner.coverage.read
```

The optional two-client fixture cannot execute its Hermes-client half on this workstation because
the required Hermes source checkout with `uv.lock` is absent. The same environment prerequisite
was recorded for H2.1; the installed Docker Hermes runtime is verified separately after deployment.

## Schema diff

`schema-before-sha256.json` records all 17 pre-H2.2 input/output schema hashes. The H2.2 smoke
recomputes all 34 hashes and proves that the sole new pair is `get_text_coverage`.
`CAPABILITY_VERSION` remains `aa-v0.1`; the cached closed `get_agent_connection` output remains
unchanged and continues to omit post-cache H2 scopes.

## Production, Hermes, consent, owner-live

Implementation commits `679deda` and repair `2209fff` were pushed to `main`. Coolify deployed
`2209fff7be3572f7f9f0abb6737964c045f95f11`; `/healthz` reported app/DB/migrations ready and
client version `3.11.223`. OAuth protected-resource metadata exposes 17 scopes including
`learner.coverage.read`.

Hermes config selects 18 LinguistPro tools and carries the mandatory H2.2 policy. Both
`hermes-agent` and `hermes-webui` were restarted; WebUI became healthy with zero active sessions.
The owner approved all 17 scopes; token exchange returned 200 and the stored scope set contains
exactly 17 scopes. Re-auth correctly invalidated the old connection-bound body grant, and the owner
issued a new personal-text grant.

Live Hermes-SDK evidence (no token, personal title/key/body, grade or raw FSRS field printed):

```json
{"source":"BEN_YEHUDA_BAKED_CORPUS","work_id":"10","status":"OK","token_total":1734,"token_known_pct":24,"lemma_known_pct":9,"content_word_known_pct":13,"recommendation_band":"FRUSTRATION_BELOW_90","learner_projection_version":"review-log-keyer-v1+fsrs6-core-v2+stale-engine-filter-v1"}
{"source":"OWNER_SYNCED_PERSONAL_TEXT","catalog_ok":true,"status":"OK","token_total":226,"token_known_pct":45,"lemma_known_pct":30,"content_word_known_pct":38,"recommendation_band":"FRUSTRATION_BELOW_90"}
```

Both required source classes were therefore live through Hermes before the owner-live check below.

## Owner-live ordinary Hermes session

The owner asked a fresh ordinary session to compare at least one synced personal text and one READY
Ben-Yehuda work using immediately relevant `get_text_coverage` calls. Hermes returned:

```text
personal (title/key redacted from tracked evidence): token 45%, lemma 30%, content-word 38%, FRUSTRATION_BELOW_90
Ben-Yehuda READY work 11784: token 21%, lemma 9%, content-word 11%, FRUSTRATION_BELOW_90
recommendation: personal text is closer to 95–98%, while explicitly warning that both are below 90%
```

Verdict: **PASS**. Both mandatory source classes were measured, all three percentages and bands were
stated, no 95–98 claim was fabricated, and the recommendation followed the returned numbers. No
personal body was quoted. The owner provided a successful qualitative transcript; no numeric rating
is invented. H2.2 is `CLOSED`.
