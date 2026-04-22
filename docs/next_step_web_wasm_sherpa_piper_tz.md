# ТЗ для Codex: PATCH-NEXT — подключение реального `web_wasm_sherpa_piper` runtime для `local_neural_tts_piper`

Версия: 1.0  
Проект: `tts-prototype-android`  
Цель итерации: перевести `local_neural_tts_piper` из архитектурного shell/fallback-режима в первый реально работающий локальный neural TTS runtime в браузере через `web_wasm_sherpa_piper`, без слома текущего UI, таблицы, fallback, cache, diagnostics и будущей переносимости на iOS/Android.

---

## 0. Контекст текущего состояния

В предыдущей итерации уже реализован переносимый TTS-слой:

- provider: `local_neural_tts_piper`;
- backend shell: `web_wasm_sherpa_piper`;
- fallback: `system_fallback`;
- TTS core;
- provider router;
- voice registry;
- model manifests;
- cache key;
- diagnostics;
- Hebrew preprocessing;
- UI integration;
- server-side client config;
- тесты для core logic;
- документация `docs/LOCAL_NEURAL_TTS_PIPER.md`.

Текущая архитектура правильная: UI не должен знать, какой runtime реально синтезирует речь; voice registry, cache key, diagnostics и preprocessing должны жить выше конкретного backend; будущие iOS/Android backend-адаптеры должны подключаться в router, а не в обработчики кнопок UI.

Но сейчас `web_wasm_sherpa_piper` фактически является shell-only backend:

- `web_wasm` backend выбирается router-ом;
- manifest загружается;
- diagnostics работают;
- fallback работает;
- но реальная загрузка `sherpa-onnx` WASM runtime ещё не подключена;
- реальный local Piper synthesis в браузере ещё не выполняется;
- звук сейчас фактически идёт через `system_fallback`, если доступен `speechSynthesis`.

---

## 1. Главная цель следующего шага

Подключить настоящий браузерный local neural TTS runtime:

```text
local_neural_tts_piper
  -> web_wasm_sherpa_piper
  -> sherpa-onnx WASM runtime
  -> Piper ONNX model
  -> real local audio synthesis
  -> WebAudioRenderer playback
  -> IndexedDB/cache
  -> diagnostics
```

После этой итерации пользователь должен получить не только fallback-озвучку через браузерный `speechSynthesis`, а реальный локальный neural TTS в браузере там, где runtime и модель доступны.

---

## 2. Что именно нужно сделать

### 2.1 Подключить реальный `sherpa-onnx` WASM runtime

Нужно исследовать и подключить рабочий browser/WASM runtime для Piper/sherpa-onnx.

Проверить варианты:

```text
1. npm-пакет sherpa-onnx для web/WASM, если доступен.
2. browser bundle из официальных sherpa-onnx examples.
3. self-hosted WASM assets в public/tts/runtime/sherpa-onnx/.
4. отдельный lightweight runtime adapter, если прямой npm import невозможен.
```

Нельзя делать скрытый remote fetch runtime-а с CDN без явного решения. Для premium/local product runtime должен быть self-hosted или явно документирован.

---

### 2.2 Доработать `WebPiperSherpaBackend`

Файл-кандидат:

```text
public/tts/backends.js
```

Нужно заменить shell-логику на реальную runtime-логику:

```text
1. loadRuntime()
2. loadModel(manifest)
3. synthesize(request)
4. convert result to unified TTSResult
5. send audio to WebAudioRenderer
6. produce diagnostics
7. fallback only when runtime/model genuinely unavailable
```

Backend не должен напрямую менять UI. UI работает только через portable provider/router contract.

---

### 2.3 Добавить runtime readiness model

Нужно различать состояния:

```text
runtime_missing
runtime_loading
runtime_ready
model_missing
model_loading
model_ready
synthesis_running
synthesis_failed
fallback_used
```

Не путать:

```text
web_wasm backend exists
```

и

```text
web_wasm реально готов синтезировать звук
```

Сейчас это критическая зона риска: badge может создавать впечатление, что `Piper Local / web_wasm` работает, хотя фактически звук идёт через `system_fallback`.

---

### 2.4 Обновить provider badge и diagnostics

Badge должен честно показывать фактический backend:

```text
TTS: Piper Local / web_wasm / ready
TTS: Piper Local / web_wasm / runtime missing
TTS: Piper Local / web_wasm / model missing
TTS: System fallback
TTS: unavailable
```

Diagnostics в debug mode должны показывать:

```text
Provider: local_neural_tts_piper
Preferred backend: web_wasm
Actual backend: web_wasm | system_fallback
Runtime: sherpa-onnx
Runtime status: ready | missing | loading | error
Voice: he-default / ru-default / en-default
Model path
Config path
Checksum status
Model version
Cache hit/miss
Model load ms
Synthesis ms
Render ms
Text chars
Fallback reason
```

Важно: если fallback сработал, diagnostics обязаны показать причину:

```text
fallbackReason: "web_wasm_runtime_not_ready"
fallbackReason: "model_missing"
fallbackReason: "runtime_load_failed"
fallbackReason: "synthesis_failed"
fallbackReason: "language_not_supported"
```

---

## 3. Model assets и manifests

### 3.1 Проверить текущие manifests

Файлы-кандидаты:

```text
public/tts/models/he/manifest.json
public/tts/models/ru/manifest.json
public/tts/models/en/manifest.json
```

Нужно проверить:

```text
1. modelPath реально указывает на существующий ONNX model asset.
2. configPath реально указывает на существующий config JSON.
3. sampleRate совпадает с моделью.
4. modelVersion заполнен.
5. license/source заполнены.
6. platforms содержит web_wasm.
7. checksumSha256 либо заполнен, либо diagnostics явно показывает checksum: missing.
```

Manifest остаётся source of truth. Нельзя хардкодить пути моделей в UI или в обработчиках кнопок.

---

### 3.2 Добавить реальные model assets или честный staging contract

Если модели нельзя включить в репозиторий из-за размера, лицензии или GitHub limits, нужно сделать честный model staging contract.

Вариант A — модели лежат в `public/tts/models/...`

```text
public/tts/models/he/model.onnx
public/tts/models/he/model.onnx.json
public/tts/models/ru/model.onnx
public/tts/models/ru/model.onnx.json
public/tts/models/en/model.onnx
public/tts/models/en/model.onnx.json
```

Вариант B — модели не коммитятся, но есть staging script:

```text
scripts/stage_tts_models.ps1
scripts/check_tts_models.js
docs/TTS_MODEL_STAGING.md
```

Вариант B предпочтителен, если модели большие.

---

### 3.3 Добавить checksum script

Нужно добавить скрипт расчёта checksum:

```text
scripts/update_tts_model_checksums.js
```

или PowerShell-вариант:

```text
scripts/update_tts_model_checksums.ps1
```

Функции:

```text
1. прочитать manifest-и;
2. найти modelPath/configPath;
3. рассчитать SHA-256;
4. обновить checksumSha256;
5. не ломать manifest structure;
6. вывести report.
```

PowerShell запуск:

```powershell
cd E:\projects\tts-prototype-android
node scripts\update_tts_model_checksums.js
```

Если модель отсутствует, скрипт должен не падать молча, а выводить:

```text
MISSING_MODEL: public/tts/models/he/model.onnx
MISSING_CONFIG: public/tts/models/he/model.onnx.json
```

---

## 4. Runtime loading strategy

### 4.1 Не грузить модель при открытии страницы

Запрещено автоматически грузить тяжёлую TTS-модель при первом открытии страницы.

Правильное поведение:

```text
1. Приложение открывается быстро.
2. TTS provider и router инициализируются lightweight.
3. Runtime availability проверяется без загрузки модели, если возможно.
4. Модель грузится только:
   - при первом нажатии TTS;
   - или при явном preload действии;
   - или при включённом debug/dev preload flag.
```

---

### 4.2 Добавить optional preload

Добавить возможность preload:

```text
TTS_PRELOAD=false
```

По умолчанию:

```text
false
```

Если `TTS_PRELOAD=true`, тогда можно preload-ить runtime/model после первого user gesture или после явного действия пользователя.

---

### 4.3 Модель должна кэшироваться в памяти после первой загрузки

После первой успешной загрузки runtime/model:

```text
1. Не загружать модель заново для каждой строки.
2. Держать backend instance/model session в памяти.
3. Добавить unload() для ручной очистки.
4. Добавить idle unload позже, но не обязательно в этой итерации.
```

---

## 5. Audio result contract

Реальный `web_wasm` backend должен вернуть результат в существующем unified contract:

```javascript
{
  audioBuffer,
  sampleRate,
  durationMs,
  provider: "local_neural_tts_piper",
  backend: "web_wasm",
  voiceId,
  cacheHit,
  diagnostics
}
```

Нужно проверить формат результата от runtime:

```text
1. Float32 PCM
2. Int16 PCM
3. WAV bytes
4. sampleRate
```

И привести его к формату, который понимает `WebAudioRenderer`.

---

## 6. Cache integration

### 6.1 Cache должен работать для реального synthesis

Нужно проверить и доработать:

```text
1. cache miss -> synthesize -> store audio;
2. cache hit -> no synthesis -> playback from cache;
3. diagnostics.cacheHit корректен;
4. cache key не включает backend, если audio semantics одинаковы;
5. cache key включает modelVersion и preprocessingVersion.
```

---

### 6.2 Не кэшировать fallback как Piper output без маркировки

Если звук пришёл от `system_fallback`, нельзя сохранять его в cache как результат `web_wasm`.

Правильно:

```text
actualBackend: "system_fallback"
cache policy: no-cache or separate backend-aware fallback cache
```

Для этой итерации безопаснее:

```text
system_fallback audio не кэшировать
```

---

## 7. Hebrew TTS quality path

### 7.1 Не ломать niqqud

Hebrew preprocessing уже должен сохранять niqqud. Нужно добавить реальные smoke cases:

```text
שלום עולם
ברוך אתה
בָּרוּךְ אַתָּה
העברית היא שפה עתיקה ומתחדשת.
אני רוצה לשמוע את הטקסט הזה בעברית טבעית.
הילדים אהבו במיוחד את הסיפורים הללו שהמורה הקריאה.
```

Проверить:

```text
1. niqqud не удаляется;
2. HTML удаляется;
3. пробелы нормализуются;
4. RTL-текст не переворачивается;
5. длинный текст режется безопасно.
```

---

### 7.2 Зафиксировать ограничение качества

Если выбранная Piper Hebrew model звучит хуже ожидаемого premium уровня, это нужно зафиксировать честно:

```text
Current Hebrew voice quality: baseline
Not yet premium neural quality
Next options: better Piper voice / Phonikud-TTS / native backend / future provider
```

Нельзя в UI или docs обещать “premium natural Hebrew voice”, пока это не подтверждено ручным smoke и сравнением.

---

## 8. UI integration requirements

### 8.1 Не менять UX радикально

Текущая UI-интеграция уже есть. В этой итерации не нужно переписывать таблицу или TTS controls с нуля.

Нужно доработать только:

```text
1. честный provider badge;
2. честный runtime status;
3. loading state во время model/runtime loading;
4. error/fallback reason;
5. diagnostics panel;
6. stop behavior при долгом synthesis/playback;
7. отсутствие layout shift в mobile classic mode.
```

---

### 8.2 Состояния кнопки

Кнопка TTS должна различать:

```text
idle
runtime_loading
model_loading
synthesizing
playing
stopping
fallback_playing
error
```

В UI можно показать компактно:

```text
▶
⏳
■
⚠
```

Но diagnostics/status должны быть точнее.

---

### 8.3 Mobile constraints

Обязательно проверить:

```text
1. classic mode table не ломается;
2. кнопка TTS не уезжает за край;
3. touch target достаточный;
4. horizontal scroll таблицы сохраняется;
5. sticky controls не перекрываются;
6. keyboard/touch editing не конфликтует с TTS;
7. stop доступен во время playback.
```

---

## 9. Feature flags / config

Расширить server/client config.

Файл-кандидат:

```text
server.js
```

Текущие флаги уже есть:

```text
TTS_ENABLED
TTS_PREFERRED_BACKEND
TTS_ALLOW_SYSTEM_FALLBACK
TTS_DEBUG_DIAGNOSTICS
```

Добавить или проверить:

```text
TTS_WEB_WASM_ENABLED=true
TTS_WEB_WASM_RUNTIME_PATH=/tts/runtime/sherpa-onnx/
TTS_PRELOAD=false
TTS_MODEL_STAGING_REQUIRED=true
TTS_CACHE_ENABLED=true
TTS_CACHE_MAX_MB=250
```

Поведение:

```text
TTS_ENABLED=false
```

должно полностью отключать TTS UI/provider/model loading.

```text
TTS_WEB_WASM_ENABLED=false
```

должно отключать только `web_wasm`, но оставить `system_fallback`, если он разрешён.

```text
TTS_ALLOW_SYSTEM_FALLBACK=false
```

должно показывать ошибку unavailable, если `web_wasm` не готов.

---

## 10. Patch plan

### PATCH-00 — Repo audit and current state verification

Перед кодом обязательно выполнить audit.

Проверить:

```text
1. public/tts/core.js
2. public/tts/backends.js
3. public/tts/models/*/manifest.json
4. public/index.html TTS integration
5. server.js /api/client-config
6. tests/portableTtsCore.test.js
7. docs/LOCAL_NEURAL_TTS_PIPER.md
8. package.json scripts
9. текущие baseline failures npm test
10. static assets serving
11. CSP/security headers, если есть
12. mobile classic mode CSS рядом с TTS controls
```

Deliverables:

```text
- audit summary;
- список точек изменения;
- список рисков;
- подтверждение baseline test status;
- финальный patch plan.
```

Код в PATCH-00 не менять, кроме возможного audit-документа.

---

### PATCH-01 — Runtime adapter scaffold

Цель: добавить адаптер для `sherpa-onnx` WASM runtime без полной интеграции моделей.

Возможные новые файлы:

```text
public/tts/runtime/sherpaOnnxAdapter.js
public/tts/runtime/runtimeStatus.js
```

Deliverables:

```text
- loadSherpaRuntime()
- detectSherpaRuntime()
- runtime status enum
- clear runtime errors
- tests for runtime unavailable/available mock
```

---

### PATCH-02 — Model loader and manifest validation hardening

Цель: сделать загрузку model/config честной и проверяемой.

Изменить:

```text
public/tts/core.js
public/tts/backends.js
public/tts/models/*/manifest.json
```

Добавить:

```text
scripts/check_tts_models.js
scripts/update_tts_model_checksums.js
```

Deliverables:

```text
- проверка modelPath/configPath;
- manifest validation;
- checksum diagnostics;
- model missing diagnostics;
- no silent fallback without reason;
- tests.
```

---

### PATCH-03 — Real web_wasm synthesis path

Цель: впервые получить реальный audio output из Piper/sherpa-onnx WASM.

Изменить:

```text
public/tts/backends.js
public/tts/runtime/sherpaOnnxAdapter.js
```

Deliverables:

```text
- runtime loads;
- model loads;
- synthesize(text) returns PCM/WAV;
- result converted to TTSResult;
- WebAudioRenderer plays output;
- fallback only on real failure;
- diagnostics show actualBackend=web_wasm.
```

---

### PATCH-04 — Cache real synthesized audio

Цель: включить IndexedDB/audio cache для реального synthesized audio.

Deliverables:

```text
- cache miss -> synthesize;
- cache hit -> no runtime synthesis;
- diagnostics.cacheHit accurate;
- no fallback audio stored as web_wasm result;
- tests for cache hit/miss.
```

---

### PATCH-05 — UI status and diagnostics hardening

Цель: сделать UI честным и понятным.

Deliverables:

```text
- runtime/model status badge;
- fallback reason visible in debug diagnostics;
- loading states for runtime/model/synthesis;
- error state without page breakage;
- stop behavior still works;
- no mobile layout regression.
```

---

### PATCH-06 — Smoke docs and regression hardening

Цель: зафиксировать реальное состояние и ручные проверки.

Изменить:

```text
docs/LOCAL_NEURAL_TTS_PIPER.md
docs/TTS_MODEL_STAGING.md
README.md, если принято
```

Deliverables:

```text
- actual runtime status;
- model staging instructions;
- PowerShell commands;
- browser smoke checklist;
- mobile smoke checklist;
- known limitations;
- baseline npm test status;
- commit message.
```

---

## 11. Tests to add/update

### Unit tests

Добавить/расширить:

```text
tests/portableTtsCore.test.js
tests/portableTtsRuntime.test.js
tests/portableTtsManifest.test.js
tests/portableTtsCache.test.js
```

Покрыть:

```text
1. runtime unavailable -> fallback reason web_wasm_runtime_not_ready;
2. runtime disabled -> system_fallback if allowed;
3. runtime disabled + fallback disabled -> unavailable;
4. missing model -> model_missing;
5. missing config -> config_missing;
6. invalid manifest -> manifest_invalid;
7. checksum missing -> diagnostics checksum missing;
8. cache miss -> synthesize called;
9. cache hit -> synthesize not called;
10. fallback audio not cached as web_wasm;
11. Hebrew niqqud preserved;
12. long Hebrew text chunks preserved.
```

---

### Browser/manual smoke

Проверить в браузере:

```text
1. TTS button visible.
2. First click shows runtime/model loading.
3. If model exists, real web_wasm synthesis happens.
4. Provider badge shows actualBackend=web_wasm.
5. If runtime missing, fallback happens.
6. Fallback reason visible in debug diagnostics.
7. Stop works.
8. Second click same text uses cache.
9. Hebrew with niqqud is not stripped.
10. Mobile classic mode table layout is not broken.
11. Console has no critical errors.
12. TTS_ENABLED=false disables feature.
13. TTS_WEB_WASM_ENABLED=false uses fallback if allowed.
14. TTS_ALLOW_SYSTEM_FALLBACK=false shows unavailable instead of fallback.
```

---

## 12. PowerShell commands

Базовая проверка до изменений:

```powershell
cd E:\projects\tts-prototype-android
git status
npm install
npm test
node --test tests\portableTtsCore.test.js
node -e "require('./public/tts/core.js'); require('./public/tts/backends.js'); console.log('portable-tts-modules-ok')"
```

Проверка моделей:

```powershell
cd E:\projects\tts-prototype-android
node scripts\check_tts_models.js
node scripts\update_tts_model_checksums.js
```

Проверка после изменений:

```powershell
cd E:\projects\tts-prototype-android
node --test tests\portableTtsCore.test.js
node --test tests\portableTtsRuntime.test.js
node --test tests\portableTtsManifest.test.js
node --test tests\portableTtsCache.test.js
npm test
npm run db:migrate
git status
```

Если `npm test` остаётся красным из-за известных старых `tests/premium/*`, это нужно явно зафиксировать:

```text
npm test baseline remains red due to pre-existing tests/premium failures.
New/changed TTS tests pass.
No new TTS regression introduced.
```

---

## 13. Definition of Done

Итерация считается завершённой, если выполнено:

```text
1. Codex прочитал актуальную документацию и зафиксировал audit summary.
2. Проверено текущее состояние `local_neural_tts_piper`.
3. Подключён или честно застейджен `sherpa-onnx` WASM runtime.
4. `WebPiperSherpaBackend` больше не является только shell при наличии runtime/model.
5. Реальная модель загружается через manifest.
6. Реальный synthesis возвращает audio output.
7. WebAudioRenderer воспроизводит результат.
8. Provider badge показывает actual backend, а не желаемый backend.
9. Diagnostics показывают runtime/model/cache/synthesis timings.
10. Fallback показывает fallback reason.
11. Missing runtime/model/config не ломают UI.
12. `TTS_WEB_WASM_ENABLED=false` работает.
13. `TTS_ALLOW_SYSTEM_FALLBACK=false` работает.
14. Cache работает для real web_wasm audio.
15. Fallback audio не сохраняется как web_wasm cache result.
16. Hebrew niqqud сохраняется.
17. Mobile classic mode layout не сломан.
18. Existing TTS/fallback path не удалён без миграции.
19. Добавлены тесты runtime/model/cache/fallback diagnostics.
20. Обновлена документация.
21. Ручной browser smoke выполнен.
22. Ручной mobile smoke выполнен или явно зафиксирован как pending.
23. Все новые TTS tests проходят.
24. Baseline failures `npm test`, если остались, явно отделены от этой итерации.
25. Создан commit.
26. `git status` чистый после commit.
```

---

## 14. Non-goals

В этой итерации НЕ делать:

```text
1. Полноценное iOS-приложение.
2. Полноценное Android-приложение.
3. Swift/Kotlin native TTS bridge.
4. Новый cloud TTS provider.
5. Chatterbox/Kokoro/XTTS.
6. Voice cloning.
7. Полную замену UI.
8. Удаление `system_fallback`.
9. Автоматическую загрузку огромной модели при открытии страницы.
10. Remote CDN model/runtime loading без явного решения.
11. Обещание premium Hebrew voice quality без benchmark.
```

---

## 15. Risks and mitigations

| Риск | Вероятность | Влияние | Митигация |
|---|---:|---:|---|
| `sherpa-onnx` WASM package не подключается напрямую через текущую систему scripts | Высокая | Высокое | Сделать runtime adapter и self-hosted assets path; не ломать fallback |
| ONNX model слишком большая для GitHub/repo | Высокая | Среднее | Ввести model staging contract и не коммитить большие binary без решения |
| Hebrew Piper voice quality ниже premium ожиданий | Средняя | Высокое | Честно маркировать qualityTier=baseline; добавить smoke и docs |
| Badge показывает `web_wasm`, хотя работает fallback | Высокая | Высокое | Ввести preferredBackend vs actualBackend |
| Runtime/model грузится слишком долго и блокирует UI | Средняя | Высокое | Lazy loading, loading state, no blocking UI, optional preload |
| Cache сохраняет неверный audio result | Средняя | Среднее | Строго разделить web_wasm result и fallback result |
| Mobile layout ломается из-за новых статусов | Средняя | Высокое | Минимальный UI diff, mobile smoke, no fixed heights |
| Старые premium tests маскируют новые падения | Высокая | Среднее | Отдельно прогонять targeted TTS tests и фиксировать baseline failures |

---

## 16. Рекомендуемый commit message

```text
feat(tts): enable real web wasm piper runtime path
```

Если разбивать на несколько коммитов:

```text
docs(tts): audit current portable tts runtime state
feat(tts): add sherpa wasm runtime adapter
feat(tts): validate piper model manifests and checksums
feat(tts): wire real web wasm synthesis path
feat(tts): cache real web wasm tts audio
fix(tts): show actual tts backend and fallback reason
test(tts): add runtime model cache and fallback coverage
docs(tts): document web wasm piper model staging and smoke
```

---

## 17. Финальная формулировка для Codex

Текущая задача — не создавать новый provider и не переписывать TTS заново. Нужно довести уже созданный `local_neural_tts_piper` до первого реального runtime:

```text
Было:
local_neural_tts_piper -> web_wasm shell -> system_fallback

Должно стать:
local_neural_tts_piper -> web_wasm_sherpa_piper -> real local Piper synthesis

При ошибке:
local_neural_tts_piper -> web_wasm unavailable -> explicit fallback reason -> system_fallback / unavailable
```

Сохраняем главный архитектурный принцип:

```text
один provider
один voice registry
один manifest system
один cache key model
один diagnostics contract
один UI contract
несколько backend adapters
```

Не допускать превращения проекта в набор разрозненных `web_piper`, `ios_piper`, `android_piper`. Web runtime — это только первый backend-адаптер для переносимого premium speech module.
