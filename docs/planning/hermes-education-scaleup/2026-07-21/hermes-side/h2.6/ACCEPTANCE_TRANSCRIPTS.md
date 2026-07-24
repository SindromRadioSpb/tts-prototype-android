# H2.6 acceptance transcripts

Дата: 2026-07-24. All audio below is controlled synthetic Microsoft Asaf `he-IL` material;
no owner speech or personal transcript is copied into this artifact. Tests used the authenticated
frontend-equivalent `/api/chat/start` + stream-status path, not the fallback synchronous endpoint.

## A — voice → preview → full H1.1 cycle → analysis → retry

Session `a27fdc03cad1`, model `gemini-3.1-flash-lite`.

1. A real `mcp__ivrit_asr__transcribe_audio` call returned one 2.72s NORMAL segment:
   `אתמול אני הולך ברחוב ושמעתי שיר יפה.` Raw was deleted.
2. Hermes showed only the hypothesis/confirmation question. The transcript was confirmed unchanged.
3. Before content, the trace contained `skill_view(linguistpro-conversation-session)` followed by
   `get_learner_profile` and `get_due_review_items`.
4. The confirmed voice utterance plus seven Hebrew typed replies produced eight learner turns,
   including a CLARIFY around a malformed typed sentence. POST_ANALYSIS was requested explicitly;
   three RETRY turns followed.

The first analysis exposed an adversarial source-provenance failure: it incorrectly described the
later typed phrase `אני שאת אותו בלב` as ASR. This run was not accepted. The skill was hardened with
an explicit ephemeral voice ledger and the invariant `TYPED never becomes ASR`, installed, and
reloaded through a real `skill_view` in the same full-cycle session.

The corrected analysis then reported:

```text
Статус подтверждения: unchanged.
Места ASR-неуверенности: Подозрительных мест ASR в подтверждённом voice-ходе не обнаружено.
```

Grammar feedback used only typed turns; the initial NORMAL, unchanged voice hypothesis was not
labelled as a learner error. Three RETRY turns completed. Verdict: **PASS after observed repair**.

## B — user correction wins

Session `f3169763cdd2`, model `gemini-3.5-flash`.

Actual ASR preview:

```text
אתמול אני הולך ברחוב ושמעתי שיר יפה.
```

User correction:

```text
אתמול הלכתי ברחוב ושמעתי שיר עצוב.
```

The trace loaded H1.1, profile and due data. Targeted analysis said the confirmed sentence had no
learner errors and placed only `אני הולך → הלכתי` and `יפה → עצוב` under ASR differences. It did
not analyse or recast the raw hypothesis as user speech. Engineering metrics for B were one preview,
one correction, 2.72s, correction rate 100%. Verdict: **PASS**.

## C — ASR unavailable

The installer removed only `mcp_servers.ivrit_asr`; both Hermes containers were restarted. Fresh
session `d6e96f754d83` then had no ASR callable and returned exactly:

```text
ASR недоступен; transcript не получен.

Файл не был удалён автоматически — удали его из voice-inbox, затем напиши ту же фразу текстом.
```

The controlled raw fixture remained, proving delete-on-success-only behavior. It was manually
deleted, the mapping was reinstalled, both containers were restarted, and the final health check
returned all three checks OK with an empty inbox. No retry or cloud fallback occurred.

Verdict: **PASS**.

## Acceptance result

**3/3 PASS.** Engineering-only speech: 5.44 seconds / 0.091 minutes across two completed previews;
one corrected preview out of two, correction rate 50%. These synthetic metrics are not owner-live
metrics and do not satisfy the closure gate.

Non-counted provider incidents: Gemini 3.6 free request quota, Gemini 3.1 input-token minute quota,
OpenRouter 402, one OpenRouter-free quality failure, and retired Gemini 2.5 model 404. None caused
ASR/cloud fallback or silent data mutation.
