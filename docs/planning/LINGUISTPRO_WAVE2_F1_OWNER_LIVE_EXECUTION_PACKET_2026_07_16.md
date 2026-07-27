# LinguistPro Wave 2 — F1 short owner-live execution packet

**Date:** 2026-07-16

**Status:** `OWNER_PATH_TECHNICALLY_VERIFIED / LONGITUDINAL_EVIDENCE_DEFERRED`.

**Owner resolution:** same-session staged activation; short product consent copy; exact single-owner allowlist; real goals/tasks/explanations and personal anchors permitted; automatic rollback permitted; production read/env/redeploy authority approved. Longitudinal monitoring is deferred.

**Execution result:** production `3.11.188`; entry-point commit `6388269`, terminal-history hotfix `1e051dc`, visible-export hotfix `6ac91fa`. All three owner-only stages passed in one session; no longitudinal monitoring claim is made.

**Privacy:** the exact production `users.id` was verified read-only and is stored only in gitignored `.claude/F1_OWNER_LIVE_PRIVATE.md`. It must never enter git, screenshots or public evidence. The production digest secret is generated directly into the secret store and is never printed or committed.

## 1. Meaning of the evidence window

The evidence window is the bounded interval during which F1 is enabled for the single owner and watched for contract violations or rollback signals. It is not development time and it is not a required multi-day monitoring program.

For this execution the window is one staged session, target ≤90 minutes:

1. deploy the missing manual `Continue later` entry UI with all F1 flags still off;
2. Stage 1 technical/use smoke;
3. Stage 2 technical/use smoke;
4. Stage 3 technical/use smoke;
5. preserve content-safe evidence and either leave the approved owner configuration on or roll back on a stop condition.

This can prove owner-path operability. It cannot prove longitudinal educational usefulness, retention lift or consent comprehension over time; those claims remain deferred.

## 2. Short product consent copy

### Russian

- Global: **«Сохранять выбранную память наставника»**
- Boundary: **«Только выбранные вами цели и незавершённые нити. Это не память слов, не оценка и не языковая истина.»**
- Category: **«Сохранять незавершённые нити»**
- Candidates: **«Предлагать возможные продолжения»**

### English

- Global: **“Save selected mentor memory”**
- Boundary: **“Only goals and unfinished threads you choose. This is not word memory, an assessment, or linguistic truth.”**
- Category: **“Save unfinished threads”**
- Candidates: **“Suggest possible continuations”**

### Hebrew

- Global: **«לשמור זיכרון מנטור שבחרתם»**
- Boundary: **«רק מטרות וחוטים לא גמורים שבחרתם. זה אינו זיכרון מילים, הערכה או אמת לשונית.»**
- Category: **«לשמור חוטים לא גמורים»**
- Candidates: **«להציע המשכים אפשריים»**

## 3. Exact staged flags

Common prerequisites for every live stage:

```text
F1_MEMORY_ENABLED=1
F1_MEMORY_OWNER_IDS=<F1_OWNER_ID_FROM_PRIVATE_COORDINATE>
F1_MEMORY_DIGEST_SECRET=<DEDICATED_SECRET_IN_PRODUCTION_SECRET_STORE>
CP0_OBSERVER_ENABLED remains unchanged/off
```

### Stage 1 — explicit memory only

```text
F1_MEMORY_CONTEXT_USE_ENABLED=0
F1_MEMORY_CANDIDATES_ENABLED=0
```

Verify:

- non-owner and unauthenticated behavior does not expose F1;
- owner sees short consent copy;
- explicit goal save/edit works;
- a fresh plan and a live explanation expose `Continue later`;
- direct unfinished records show evidence/provenance;
- no Continue selection and no proposal scan is active;
- `review_log`, FSRS and consent history change only through their existing explicit routes.

### Stage 2 — deterministic Continue

```text
F1_MEMORY_CONTEXT_USE_ENABLED=1
F1_MEMORY_CANDIDATES_ENABLED=0
```

Verify:

- one active explicit unfinished thread appears;
- source close/purge/drift excludes it;
- Suppress removes it and Use again restores eligibility;
- Resolve removes it from Continue;
- no model/provider call occurs.

### Stage 3 — deterministic proposals

```text
F1_MEMORY_CONTEXT_USE_ENABLED=1
F1_MEMORY_CANDIDATES_ENABLED=1
```

Verify:

- only an explicit `Find possible continuations` tap starts a scan;
- at most three recent typed candidates appear as `PENDING`;
- pending candidates never enter Continue;
- Keep produces `USER_CONFIRMED_DERIVED` and preserves provenance;
- Not for me/expiry excludes the candidate;
- no provider quota or external-agent path is touched.

## 4. Permitted data and destructive boundary

Permitted during the short window:

- real user-declared goals;
- real owner-scoped tasks and explanations;
- personal-text anchors after exact consent/source recheck;
- specially labelled test records.

Safety rule: do not run consent-revoke or delete-all against a category after real F1 records exist, because those operations intentionally purge the whole category. Export may cover all owner F1 records. Per-record delete/restore evidence uses a clearly labelled test record only. A full revoke/delete-all live drill remains separately destructive even though its implementation is already proven synthetically.

No raw personal text, explanation body, prompt, key or memory payload enters logs, CP0 or the evidence packet.

## 5. Rollback

Automatic rollback is authorized without waiting for another owner response:

1. set `F1_MEMORY_CONTEXT_USE_ENABLED=0`;
2. set `F1_MEMORY_CANDIDATES_ENABLED=0`;
3. set `F1_MEMORY_ENABLED=0`;
4. restart/redeploy and verify health;
5. retain migration 040 and stored rows for bounded analysis/export/delete;
6. never modify `review_log`, FSRS, grading, linguistic truth, consent history or the account.

## 6. Immediate stop conditions

Rollback immediately on any of:

- cross-user visibility or mutation;
- pending/suppressed/expired/annulled/resolved record in Continue;
- source drift/purge ignored;
- any F1-triggered provider/external-agent call;
- canonical `review_log`, FSRS, grading, profile truth or linguistic truth mutation;
- consent revoke fails open;
- payload/source/secret in logs or CP0;
- DB/migration unhealthy, repeated lock error, API 5xx or visible UI corruption;
- owner cannot export or delete an isolated test record;
- non-allowlisted access succeeds.

## 7. Evidence result labels

- Green same-session stages: `OWNER_PATH_TECHNICALLY_VERIFIED / LONGITUDINAL_EVIDENCE_DEFERRED`.
- Any stop condition: `ROLLED_BACK / OWNER_LIVE_BLOCKED` with content-safe reason.
- Neither label means public-cohort readiness or `OPERATIONALLY_COMPLETE`.

## 8. Explicit exclusions

- No CP0 owner-live window.
- No external provider quota use for F1 gates.
- No AA2/OAuth/MCP/tool-schema implementation.
- No F2 misconception, skill or mastery memory.
- No public cohort or wildcard allowlist.
- No multi-day monitoring requirement in this execution.
