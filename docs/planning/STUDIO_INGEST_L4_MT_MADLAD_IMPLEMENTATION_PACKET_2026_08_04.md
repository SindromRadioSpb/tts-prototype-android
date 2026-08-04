# Studio Ingest L4-MT — MADLAD Productization Implementation Packet (2026-08-04)

**Статус:** OWNER-AUTHORIZED / READY FOR IMPLEMENTATION (`D-HNR-10`, 2026-08-04)
**Owner authority (verbatim):**

> GO D-HNR-10: выделить MADLAD productization в отдельный последовательный L4-MT трек до L4.0c/L4.0b; сначала исправить ложный provider-status, затем подготовить implementation packet, реализовать Browser→Companion MT без implicit fallback, провести invite beta и owner-live.

**Канон решений:** `HEBREW_NLP_RESOURCES_OWNER_DECISIONS_2026_08_04.md`
**Evidence выбора:** `docs/research/studio-l4-mt-benchmark/2026-08-04/RESULTS.md`
**Следующая сессия:** `STUDIO_INGEST_L4_MT_MADLAD_NEXT_SESSION_PROMPT_2026_08_04.md`

---

## 1. Результат, который считается productized

На production-origin пользователь явно выбирает **MADLAD (локально)**, браузер через
paired Companion проверяет capability/model readiness и отправляет текст напрямую на
`127.0.0.1:8799`. Companion переводит pinned MADLAD, возвращает результат с точным
model/provider provenance; карточка сохраняется, фильтруется и корректно открывается
после cold reopen/export-import. Ни исходный текст, ни перевод не проходят через
production-сервер. Ошибка локального пути никогда не вызывает Gemini/GCP автоматически.

До owner-live функция остаётся default-off invite beta, а результат маркируется как
исправляемый машинный draft (`LIMITED EVIDENCE / NO BILINGUAL HUMAN VALIDATION`).

## 2. Ground truth на входе

- L4.0a закрыт: MADLAD-400 — выбранный best local; Gemini — измеренный cloud ceiling.
- D-HNR-9/v3.11.301 уже создали единственную authority:
  `sentences.translation_provider` + `translation_meta_json`, Meta Edit badge и Library filter.
  Вторую provider truth создавать запрещено.
- Браузер сейчас отправляет `madlad` в production `/api/translate-table-v2`; серверный
  `db/premium/pythonClient.js` вызывает `http://127.0.0.1:8799/translate` из server/container
  context. Это не путь к Companion владельца и на production наблюдалось как `503`.
- `/api/premium/status` сейчас может сообщать `madlad.configured=true` статически; это
  ложный provider-status и первый обязательный fix до любого feature exposure.
- Companion уже имеет loopback pairing/origin/auth для `/v1/asr/*`, direct browser client,
  model lifecycle и единый `heavy_gpu_scheduler` для `asr`/`translator`.
- Legacy `/translate`, `/models/status`, `/models/warmup` не являются browser contract и
  не защищены `/v1` auth. Их нельзя просто открыть из PWA.
- Текущий локальный артефакт: `models/madlad400-10b-ct2-int8f16`, identity
  `madlad-400-10b-ct2-int8f16@v1`; веса/кеши/секреты не коммитятся.
- Последнее наблюдение production перед этим пакетом: served `v3.11.300`, MADLAD call
  `503`, provider-status false-positive, disk warning около 96%. Это снимок, а не вечная
  истина: перед любым push/deploy его надо проверить заново.

## 3. Неподвижные границы

1. `ivrit-ai/whisper-large-v3-turbo-ct2` exact pin не меняется. По D-HNR-11 он
   owner-tested и достаточен; ASR race/Q2 не prerequisite этого трека.
2. MADLAD default-off; enrollment/pairing explicit; Gemini остаётся отдельным явным выбором.
3. Нет implicit fallback в любом направлении: MADLAD↔Gemini/GCP/Google Free.
4. Нет server-hosted/proxied MADLAD и передачи текста пользователя через production-server.
5. Browser использует только versioned authenticated `/v1/mt/*`; legacy endpoints не
   становятся публичным browser API.
6. Сохранённый `translation_provider`/model provenance не переписывается preferred provider;
   mixed/unknown отображается честно.
7. Никаких default-on/GA/human-validated обещаний; invite beta — owner/trusted Windows +
   NVIDIA + Chrome cohort, пока отдельное решение не расширит его.
8. L4.0c/L4.0b, L5, Q2/Q6b и ASR model selection не входят в этот implementation slice.
9. Push `main` означает auto-deploy. При disk/health/preflight STOP запрещены build/push/deploy.

## 4. Последовательные стадии

### MT-0 — P0 provider-status honesty (первый кодовый шаг)

- Удалить статическое утверждение `madlad.configured=true` из server status.
- Server status описывает только server capabilities; он не угадывает состояние Companion
  на пользовательской машине. Legacy server MADLAD path в production должен быть явно
  unavailable/disabled, а не «ready».
- UI readiness для локального MADLAD строится только из успешного paired/authenticated
  Companion capability + model status текущей browser session.
- Состояния `absent`, `unpaired`, `model_missing`, `installing`, `ready`, `busy`, `error`
  различаются; ни одно из первых пяти, кроме `ready`, не инициирует перевод.
- Сначала red tests: отсутствующий Companion не ready; false server flag не включает option;
  локальная ошибка не вызывает cloud endpoint/provider.

**Exit MT-0:** ложный статус воспроизведён тестом, тест стал зелёным, UI честен даже до MT API.

### MT-1 — versioned Browser→Companion contract

Добавить additive contract, не ломая `local_asr`:

- `local_mt` в `/v1/capabilities` с `enabled/default/auth_required/model/protocol`;
- `GET /v1/mt/model/status`;
- `GET /v1/mt/model/install-status`;
- `POST /v1/mt/model/install`, `POST .../install-cancel`, `DELETE /v1/mt/model`;
- `POST /v1/mt/model/warmup`, `POST /v1/mt/model/unload`;
- versioned translate job/API под `/v1/mt/*` с cancel/status/result, если перевод не
  гарантированно укладывается в короткий bounded request.

Все MT endpoints используют тот же строгий Origin allowlist, bearer pairing token, CORS/PNA
policy и redacted errors, что ASR. Создать отдельный `public/js/local-mt-client.js`, переиспользуя
session/pairing contract без копирования второго token store. Не вызывать legacy `/translate`.

**Exit MT-1:** auth/origin/PNA/anti-replay negative tests + schema/cardinality tests зелёные;
несопряжённая web-страница не может прочитать capability/model/output.

### MT-2 — pinned model lifecycle и GPU residency

- Зафиксировать upstream repo/revision, license snapshot, expected files/SHA-256 и размер.
- Explicit license consent; disk/VRAM preflight; resumable download в managed directory;
  verify до atomic activation; cancel/delete с receipt; красные диагностические поля исключить.
- Не предполагать наличие вручную конвертированной папки. Существующая verified модель может
  быть принята без повторной загрузки только после того же identity/hash gate.
- `heavy_gpu_scheduler` сериализует `translator` и `asr`; переключение выгружает предыдущую
  тяжёлую модель, idle unload освобождает VRAM, cancel/restart не оставляет ложную residency.

**Exit MT-2:** install/resume/cancel/delete/reinstall и ASR→MT→ASR swap проходят на RTX 3070 8GB;
нет одновременной heavy residency и нет модели/кеша в git.

### MT-3 — translation pipeline, integrity и provenance

- Один provider-neutral chunking/mapping path для Import Center, table generation и Material
  Revision; не плодить отдельную семантику строк.
- Deterministic request/job IDs, input checksum, стабильный порядок, exact result cardinality,
  schema validation, bounded batches, cancel/retry/resume и честный partial failure.
- Направления he→ru и ru→he допускаются только если совпадают с pinned model contract и
  L4.0a evidence; target/source language передаются явно.
- Каждый результат получает `provider=madlad`, точную model version/revision, local-execution
  marker и request metadata. Сохранение использует существующий D-HNR-9 path.
- Пользовательские правки создают новую correctable revision; raw/translated/corrected не
  перезаписывают друг друга молча.

**Exit MT-3:** длинный текст, повторы, пустые/RTL строки, cancel/retry и mapping round-trip не
теряют/переставляют строки; cold reopen/export-import сохраняет provider/model authority.

### MT-4 — product UX

- Provider selector показывает локальную доступность по Companion truth и объясняет следующий
  шаг: pair/install/wait/retry; недоступный provider нельзя запустить.
- Перед первой установкой/обработкой: размер, disk/VRAM requirement, privacy/local statement,
  draft-quality statement и explicit consent.
- Progress/cancel/recover, GPU busy reason, model install/delete и диагностика доступны без
  DevTools. Ошибка содержит actionable cause, но не секрет/путь/сырой текст.
- Meta Edit/Library используют уже реализованные D-HNR-9 badge/filter; добавить только точную
  model/local provenance там, где это не создаёт новую authority.

**Exit MT-4:** RU/HE и 380px/desktop keyboard/touch flows; no-Companion/model-missing/busy/error
сценарии понятны; Gemini не вызывается без отдельного явного выбора.

### MT-5 — engineering/release evidence

Минимум:

1. unit/API: auth, Origin, PNA, lifecycle state machine, hashes, scheduler, cardinality;
2. browser smoke на реальном production Origin в fresh Chrome: pair→install/verify→translate→
   save→Library provider filter→reopen→export/import;
3. network assertion: при MADLAD нет cloud MT request и исходного текста на server endpoint;
4. frozen L4.0a Stage A regression либо заранее зафиксированный representative release subset
   с порогом не хуже выбранного MADLAD baseline; любое сокращение фиксируется до результата;
5. long text/chunk mapping, RTL/nikud/punctuation, duplicate rows, cancel/restart;
6. ASR→MT→ASR GPU swap, cold start, idle unload, Companion restart и multi-tab contention;
7. owner-selected учебный материал: критическая потеря/добавление смысла = STOP/fix, но
   отсутствие bilingual-human gate сохраняет draft positioning.

Evidence хранится в `docs/research/studio-l4-mt-madlad-productization/2026-08-04/` с README,
commands, commit, environment, raw/normalized results, screenshots и known limitations.

### MT-6 — invite beta

- Только owner/personally trusted Windows+NVIDIA+Chrome cohort существующего Companion.
- Exact installer/version/upgrade path; public hosting/signing/general distribution не открываются.
- Наблюдаем readiness, completion, cancel/retry, OOM/disk/model-install failures и correction
  burden; учебный текст/перевод не телеметрируются без отдельного согласия.
- Beta PASS не равен owner-live и не означает GA.

### MT-7 — production preflight, deploy и owner-live

Перед mutation: served version/commit, local HEAD/origin relation, dirty tree, health/flags,
disk+Docker footprint, backup/rollback и точный allowlist. Если disk warning/health STOP не
устранён безопасно — не build/push/deploy; зафиксировать blocker. Push считать только началом:
дождаться реально served service-worker/version и повторить browser gates.

Owner-live ceremony:

1. fresh normal Chrome на production Origin, Companion paired;
2. выбрать MADLAD явно, подтвердить readiness точного model identity;
3. перевести реальный owner-selected учебный материал без cloud MT traffic;
4. сохранить карточку, увидеть MADLAD provenance/filter, исправить строку;
5. cold reopen и export/import подтвердят перевод, correction и provenance;
6. смоделировать недоступный Companion: честная ошибка, ноль implicit Gemini fallback.

**PASS:** engineering, production и owner-live записываются раздельно. Rollback выключает
exposure/возвращает честный status, не удаляет пользовательские карточки и не переписывает
их provider provenance.

## 5. Разрешённая зона и работа с dirty tree

До ред-тестов следующая сессия делает read-only recon и публикует точный allowlist. Ожидаемая
зона: status/translation routing в `server.js` и `public/index.html`; новый local MT client;
существующие Companion security/config/model lifecycle/scheduler modules; узкие tests/scripts;
version/i18n/evidence docs. Изменения вне этой зоны, новая DB migration, cloud fallback,
server-hosted weights или переоткрытие P2/P3/P4 требуют остановки и нового решения.

Рабочее дерево уже содержит чужие owner-файлы. Не форматировать, не stage и не коммитить их.
Коммиты — по exact allowlist: отдельно MT-0 honesty, затем coherent MT implementation/evidence.

## 6. Stop conditions

- Нельзя доказать authenticated direct Browser→Companion path без ослабления Origin/token/PNA.
- Требуется неявный cloud fallback или проксирование текста production-сервером.
- Точная MADLAD revision/license/hash не воспроизводится.
- RTX 3070 не может безопасно менять ASR/MT residency или перевод даёт critical semantic regressions.
- Не удаётся сохранить exact row mapping/provider provenance.
- Production disk/health/backup/rollback preflight не проходит.
- Нужен файл вне согласованного allowlist либо destructive cleanup.

При STOP оставить воспроизводимое evidence и точный blocker; не подменять зрелый результат
заглушкой и не объявлять локальный engineering PASS production/owner-live PASS.
