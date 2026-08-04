# Studio Ingest L4-MT — MADLAD productization evidence

Date: 2026-08-04; authority: D-HNR-10; local web package: `3.11.302`;
invite Companion source version: `0.3.0-beta.1`.
Status: **ENGINEERING PARTIAL / PRODUCTION NOT STARTED / OWNER-LIVE NOT STARTED**

## Outcome

The implementation now has one authenticated Browser→Companion MADLAD route. Browser
traffic is limited to `http://127.0.0.1:8799/v1/mt/*`, shares the existing session pairing
token, and has no cloud fallback. The production server rejects `provider=madlad` before
translation and no longer reports server MADLAD as configured.

The main table, Text Card Builder, and Material Revision use the same local batch/mapping
adapter. Material Revision deliberately regenerates only the unlocked `ru` field for
MADLAD; niqqud and transliteration remain under their prior or invalidated authorities.
Saved rows continue to use the D-HNR-9 authority fields `translation_provider` and
`translation_meta_json`, including exact model revision and `local_execution=true`.

## Stage ledger

| Stage | Engineering status | Evidence / remaining gate |
| --- | --- | --- |
| MT-0 | PASS, committed as `24cc2b54` | False server status reproduced and fixed; server MADLAD route fails closed; no provider switch. |
| MT-1 | Local PASS | Authenticated capabilities/lifecycle/jobs, Origin/PNA/token negatives, anti-replay, exact cardinality and cancel tests are green. Not production-verified. |
| MT-2 | PARTIAL | Exact existing 10,739,625,126-byte runtime snapshot passed SHA-256 verification; real RTX 3070 load/translate/unload passed. Fresh 42,854,943,654-byte upstream download→conversion was not run; real ASR→MT→ASR swap could not run because the managed ASR model is absent. |
| MT-3 | Local implementation PASS / end-to-end PARTIAL | Shared mapping, duplicates, empty lines, he→ru/ru→he, cancel and provenance tests pass. A real save→cold reopen→export/import ceremony against the new Companion build remains unrun. |
| MT-4 | Local browser PASS for unavailable/onboarding states | Fresh Chrome, desktop and exact 380 CSS px; RU/EN/HE live localization and Hebrew RTL; no horizontal overflow. Ready/install/busy actions still need the built invite Companion. |
| MT-5 | PARTIAL | Automated gates and synthetic real-model smoke recorded. Frozen benchmark release subset, real production-origin network assertion, multi-tab contention, Companion restart and full swap remain. |
| MT-6 | NOT OPENED | Installer source is versioned but no installer artifact was built or distributed. |
| MT-7 | BLOCKED / NOT STARTED | Production disk remained about 96% used with about 1.4 GB free. No cleanup authority; therefore no build, push, deploy or owner-live. |

## Security and privacy assertions

- `/v1/capabilities` and every `/v1/mt/*` endpoint use the existing strict Companion Origin,
  bearer-token, CORS and Private Network Access policy.
- The browser client contains no production `/api/*` route and no Gemini/GCP/Google Free
  fallback. Local failure and cancel stay on loopback.
- Model/install errors are code-based and exclude local paths, tokens and source text.
- The browser exposure flag is independent and default-off: `LOCAL_MT_BETA_ENABLED=false`.
- The invite Companion enables the MT capability only inside that explicitly installed
  cohort; browser enrollment and provider selection remain explicit.

## Real-model smoke (not bilingual validation)

Environment: Windows, NVIDIA GeForce RTX 3070 8 GB, driver 595.79. Model load was about
51.0 seconds and unload returned the translator slot to non-resident state.

Synthetic results:

- `שלום עולם.` → `Мир во всем мире.`
- `זהו מבחן מקומי.` → `Это локальная проверка.`
- `Привет, мир.` → `שלום, עולם.`
- `Это локальный тест.` → `זה מבחן מקומי.`

The first result demonstrates a material ambiguity/meaning risk. This is why all local
outputs remain correctable machine drafts marked
`LIMITED EVIDENCE / NO BILINGUAL HUMAN VALIDATION`. This smoke is runtime evidence only;
it is not owner-selected material and not an owner-live semantic PASS.

## Evidence index

- `COMMANDS.md` — commands and gate outcomes.
- `environment.json` — content-safe environment and revision snapshot.
- `model-manifest.json` — runtime identity, exact sizes and SHA-256 values.
- `raw/real-model-smoke.json` — normalized synthetic translation output.
- `known-limitations.md` — incomplete exits and STOP conditions.
- `invite-beta.md` — bounded installer/upgrade state; distribution is not authorized yet.
- `screenshots/` — fresh desktop and 380px unavailable/onboarding evidence.

Screenshots:

![Desktop unavailable state](screenshots/local-mt-desktop-unavailable.png)

![380px unavailable state](screenshots/local-mt-380-unavailable.png)

![380px Hebrew onboarding](screenshots/local-mt-380-onboarding-he.png)
