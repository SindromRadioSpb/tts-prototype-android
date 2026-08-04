# Paste-ready prompt — D-HNR-10 MADLAD productization

Скопировать весь блок ниже в новую Codex-сессию из
`E:\projects\tts-prototype-android`.

```text
Продолжи D-HNR-10 с фактического implementation checkpoint ниже. Не повторяй уже
закрытые MT-0/MT-1/базовые MT-2…MT-4 работы. Сначала верифицируй commits/evidence и
сосредоточься на воспроизводимом fresh-conversion blocker; invite beta/production/
owner-live выполняй только после их точных preflight и stop conditions.

OWNER AUTHORITY (verbatim):
«GO D-HNR-10: выделить MADLAD productization в отдельный последовательный L4-MT трек до L4.0c/L4.0b; сначала исправить ложный provider-status, затем подготовить implementation packet, реализовать Browser→Companion MT без implicit fallback, провести invite beta и owner-live.»

CURRENT CHECKPOINT (2026-08-04):
- MT-0 commit `24cc2b54`; coherent Browser→Companion implementation commit `623b0e3b`;
  conversion-memory/evidence fix `cc785906` (web `3.11.303`, Companion source
  `0.3.0-beta.2`). Ничего из этого не push/deploy.
- 62 Python tests, 29 focused Node tests и 233 i18n checks PASS; full npm baseline имеет
  одну вне-срезовую classicModeRedesign failure, уже отсутствующую в commit baseline.
- Exact local runtime adoption, real managed MADLAD translation и real ASR→MT→ASR→unloaded
  exclusive scheduler PASS; evidence лежит в
  `docs/research/studio-l4-mt-madlad-productization/2026-08-04/`.
- Fresh lifecycle: cancel/resume PASS, все 42,854,943,654 source bytes + hashes PASS, но
  CT2 conversion завершился native Windows access violation `-1073741819` при ~6 GiB
  available physical RAM; activation не было, source cache сохранён. Новый preflight
  требует >=24 GiB currently available RAM и fail-closed `MODEL_CONVERSION_MEMORY_LOW`.
- Invite beta всё ещё NOT READY: нужно освободить/получить >=24 GiB physical RAM,
  повторить retained-source conversion→activation, затем delete/reinstall, installer,
  restart/multi-tab и production-origin save/reopen/export-import gates.
- Production всё ещё наблюдался на `3.11.300`, disk около 96%/~1.4 GB free — hard STOP.
  Никакого cleanup/push/deploy без нового read-only preflight и точной authority.

READ FIRST полностью, по порядку:
1. AGENTS.md
2. CLAUDE.md
3. docs/PROJECT_ROLES.md
4. docs/planning/HEBREW_NLP_RESOURCES_OWNER_DECISIONS_2026_08_04.md
5. docs/planning/STUDIO_INGEST_L4_MT_MADLAD_IMPLEMENTATION_PACKET_2026_08_04.md
6. docs/planning/HEBREW_NLP_RESOURCES_INTEGRATION_PLAN_2026_08_04.md
7. docs/planning/STUDIO_INGEST_LOCAL_PROCESSING_ROADMAP_2026_07_30.md
8. docs/research/studio-l4-mt-benchmark/2026-08-04/RESULTS.md
9. docs/research/studio-l4-mt-provider-provenance/2026-08-04/README.md
10. Живые пути server.js, db/premium/, public/index.html,
    public/js/local-asr-client.js, ai-local/ai_local/main.py,
    ai-local/ai_local/security.py, model lifecycle и heavy_gpu_scheduler tests.

Сначала дай владельцу обязательный 5–10-строчный recap: что закрыто, текущая ложь
provider-status, следующий шаг, boundaries/owner decisions. Затем:

A. Read-only recon: git status/log/origin, текущий served prod version/status/disk без
mutation, реальные MADLAD routes/status/client/auth/lifecycle/scheduler paths. Живой код
первичен. Покажи точный allowlist и red tests до edit.
B. MT-0 первым отдельным срезом: устрани статический/ложный madlad configured/ready.
Absent/unpaired/model-missing Companion не ready; server не угадывает client capability;
ошибка MADLAD не вызывает Gemini/GCP/Google Free. Red→green evidence, scoped commit.
C. Реализуй packet MT-1…MT-4: только authenticated versioned /v1/mt/* direct
Browser→127.0.0.1:8799; не используй legacy /translate как browser API; exact model
revision/license/hash lifecycle; общий ASR/translator GPU scheduler; deterministic
mapping/cancel/retry; existing D-HNR-9 translation_provider authority; truthful UX.
D. Проведи MT-5 gates и сохрани устойчивый evidence packet в
docs/research/studio-l4-mt-madlad-productization/2026-08-04/. Раздельно назови
AUTOMATED PASS, PRODUCTION PASS и OWNER-LIVE PASS. Synthetic browser smoke не owner-live.
E. Invite beta только trusted Windows+NVIDIA+Chrome cohort. Не открывай public
distribution/signing/GA/default-on.
F. Перед main push/build/deploy представь точный production preflight: served revision,
local/origin relation, dirty tree, flags/health, disk/Docker footprint, backup/rollback,
allowed mutations, stop conditions. Push main = auto-deploy. При disk/health STOP не
деплой и не выполняй destructive cleanup. После разрешённого deploy дождись реально
served version/service worker и только затем production browser gates.
G. Для owner-live дай точную короткую церемонию: fresh Chrome→pair→explicit MADLAD→real
learning text→save→Library provider filter→edit→cold reopen→export/import→Companion-off
no-fallback proof. Не называй PASS до фактического действия владельца.

НЕ МЕНЯТЬ И НЕ БЛОКИРОВАТЬСЯ НА ASR: D-HNR-11 фиксирует
ivrit-ai/whisper-large-v3-turbo-ct2 exact pin как owner-tested sufficient baseline.
Новый ASR race, full large-v3, Q2 и VibeVoice не входят в задачу и не являются gate.

ОБЯЗАТЕЛЬНЫЕ ГРАНИЦЫ: default-off; explicit enrollment; zero implicit fallback;
zero production-server proxy of user text; zero second provider truth; no DB migration
без доказанной необходимости; no L4.0c/L4.0b/P2/P3/P4 reopening; no secrets/models/cache
in git. Preserve every unrelated dirty/untracked owner file. Edit/stage/commit only exact
allowlist. При спорной границе остановись и спроси владельца.

Известный production baseline для проверки, не вечная истина: origin/main был
`47959ce8`; production был v3.11.300, real MADLAD POST давал 503, status ложно показывал
configured=true, disk warning был около 96%. Локальный false-status уже исправлен. Сначала
refresh, не повторяй эти production-факты как текущие без проверки.

Definition of Done: зрелый Browser→Companion MADLAD MT на production-origin, exact
provenance и cold round-trip, no cloud/server text path, invite-beta evidence и реальный
owner-live PASS; либо честный STOP с воспроизводимым blocker. Обнови ledger в том же
коммите, оставь точные команды/артефакты/known limitations и paste-ready continuation,
если owner-live физически ещё не завершён.
```
