# Paste-ready prompt — D-HNR-10 MADLAD productization

Скопировать весь блок ниже в новую Codex-сессию из
`E:\projects\tts-prototype-android`.

```text
Продолжи D-HNR-10 с latest checkpoint ниже. Не повторяй уже закрытые
MT-0…MT-6 local/automated/binary gates. Сначала разреши зафиксированный deployment
history STOP; не push весь текущий main без точного owner-решения по четырём параллельным
Reading Room commits. Затем проведи production browser round-trip и owner-live строго
раздельно.

OWNER AUTHORITY (verbatim):
«GO D-HNR-10: выделить MADLAD productization в отдельный последовательный L4-MT трек до L4.0c/L4.0b; сначала исправить ложный provider-status, затем подготовить implementation packet, реализовать Browser→Companion MT без implicit fallback, провести invite beta и owner-live.»

LATEST CHECKPOINT (2026-08-04, after beta.4 binary closure):
- D-HNR commits `ce811de7` и `495b4991` локальны и не pushed. Final internal beta.4
  artifact: 1,867,104,763 bytes, SHA-256
  `ec65f5f4c8adc428abe96f3ed9cdf46a74515f6b1025886c0939a46f1c72550c`;
  source inputs clean at `ce811de7`, unsigned/internal-only.
- 66 Python, 29 focused Node, 233 i18n, browser provenance и Studio chunk smokes PASS;
  full npm baseline 783/784 с прежним out-of-slice classicModeRedesign failure.
- In-place upgrade, exact frozen runtime pins, 5,304-file installed-tree hash compare,
  delete→absent→remote reinstall→network fail-closed→partial resume→conversion→full
  rehash, restart/cold job и production-Origin multi-tab PASS. Blank/whitespace real-model
  hallucination была найдена и устранена deterministic inference bypass; real binary PASS.
- Production read-only preflight: всё ещё served `3.11.300` / image `47959ce8`, health,
  DB и migrations green, disk 76–77% / 8.8 GB free / `disk_warn=false`, 10 containers,
  3 volumes, rollback image `04d0a2cd`, fresh 732,143,550-byte backup сохранены.
- PUSH STOP: пока шёл D-HNR-10, в локальный main параллельно вошли out-of-scope commits
  `d35f4a0c`, `be91e519`, `2bde4a40`, `e375fc65`. Наши commits сцеплены с ними;
  обычный `git push main` задеплоит весь пакет. Нужен exact owner choice: либо явно
  разрешить совместный deploy после чужих gates, либо разрешить clean D-HNR-only chain
  и определить, как сохранить/вернуть параллельную ветку. Ничего не rewrite/force-push.
- PRODUCTION PASS и OWNER-LIVE PASS отсутствуют. После разрешённого deploy обязательны
  реально served `3.11.304`/SW, fresh production browser direct-loopback,
  save→Library provider filter→edit→cold reopen→export/import. Synthetic не owner-live.

PRIOR CHECKPOINT (historical; blockers below may already be closed):

CURRENT CHECKPOINT (2026-08-04):
- MT-0 commit `24cc2b54`; coherent Browser→Companion implementation commit `623b0e3b`;
  conversion-memory/evidence fix `cc785906` (web `3.11.303`, Companion source
  `0.3.0-beta.2`). Ничего из этого не push/deploy.
- 64 Python tests, 29 focused Node tests и 233 i18n checks PASS; full npm baseline имеет
  одну вне-срезовую classicModeRedesign failure, уже отсутствующую в commit baseline.
- Exact local runtime adoption, real managed MADLAD translation и real ASR→MT→ASR→unloaded
  exclusive scheduler PASS для прежнего v1; managed v2 load/translate/unload PASS. Evidence лежит в
  `docs/research/studio-l4-mt-madlad-productization/2026-08-04/`.
- Fresh lifecycle: cancel/resume и все 42,854,943,654 source bytes/hashes PASS. Worker
  использует одновременно `load_as_float16=True` + `low_cpu_mem_usage=True`; 22 GiB gate
  сохраняется. Два независимых conversion дали один SHA-256
  `281b69be...e9e97`; below-gate RAM floors были 0.03/0.11 GiB, поэтому ниже 22 не обещать.
- До candidate inference зафиксирован `release-regression-contract.json`: 64 shared IDs /
  128 rows. V2 прошёл все cardinality/diagnostic/metric thresholds; macro chrF++
  49.3464→49.6445. Identity честно повышена до
  `madlad-400-10b-ct2-int8f16@v2`, а не переписана под v1.
- Isolated lifecycle activation и обратимый owner-managed swap PASS; active v2 полный
  rehash PASS, v1 сохранён как `int8_float16.v1-backup-20260804`. Повтор v2
  ASR→MT→ASR не стартовал только из-за sandbox `WinError 5` на неизменённом ASR binary.
- Invite beta всё ещё NOT READY: нужны beta.4 installer, delete/reinstall через binary,
  restart/multi-tab и production-origin save/reopen/export-import gates.
- Owner-authorized bounded production cleanup PASS: 6 unreferenced app images + unused
  build cache удалены; root 97%→76%, free 1.4→8.8 GB, `disk_warn=false`; active/newest
  rollback, 10 containers, 3 volumes, backups/data сохранены. Production всё ещё `3.11.300`.
- Текущая восстановленная сессия restricted: `.git` read-only, outbound network blocked.
  Изменения web `3.11.304`/Companion `0.3.0-beta.4` не закоммичены. Build-venv имеет
  PyInstaller/CUDA deps, но не имеет exact-pinned `accelerate==1.13.0` и
  `torch==2.5.1`; сеть недоступна. Не
  собирать неполный binary копированием случайных site-packages и не переиспользовать
  beta.2 artifacts.

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
