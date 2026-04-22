# ТЗ для Codex: PATCH-NEXT — commit/push, staging `sherpa-onnx` runtime/model assets и реальный browser smoke для `local_neural_tts_piper`

Версия: 1.0  
Проект: `tts-prototype-android`  
Цель итерации: зафиксировать уже реализованный readiness/staging-layer в Git, затем застейджить реальные `sherpa-onnx` WebAssembly runtime assets и Piper model/config files, пройти validation/checksum, выполнить реальный browser smoke с actual audio output и не допустить регрессии текущего web UI.

---

## 0. Критически важное первое действие: commit + push текущего результата

Перед тем как приступать к любым дальнейшим изменениям, обязательно зафиксировать текущую реализацию.

### 0.1 Обязательные команды PowerShell

```powershell
cd E:\projects\tts-prototype-android
git status
node --test tests\portableTtsCore.test.js tests\portableTtsRuntime.test.js tests\portableTtsManifest.test.js tests\portableTtsCache.test.js
node -e "require('./public/tts/core.js'); require('./public/tts/runtime/runtimeStatus.js'); require('./public/tts/runtime/sherpaOnnxAdapter.js'); require('./public/tts/backends.js')"
npm run db:migrate
```

Если эти targeted checks проходят, выполнить:

```powershell
git add -A
git commit -m "feat(tts): add sherpa wasm readiness and model staging flow"
git push
git status
```

### 0.2 Правило остановки

Если targeted TTS tests не проходят, коммит не делать. Нужно сначала исправить регрессию в рамках текущего diff.

Если `npm test` остаётся красным только из-за известных baseline-проблем вне нового TTS слоя, это не блокирует commit, но должно быть явно зафиксировано в отчёте:

```text
Known baseline failures remain outside new TTS layer:
- tests/premium/pipeline.test.js — pythonClient is not defined
- tests/premium/sblAcademicSpirantization.test.js — known SBL cases
```

---

## 1. Контекст текущего состояния

Уже реализовано:

```text
local_neural_tts_piper
  -> web_wasm_sherpa_piper readiness layer
  -> runtime/model staging contract
  -> explicit runtime_missing/model_missing states
  -> system_fallback only when allowed
  -> actual backend/status badge
  -> diagnostics with fallback reason
  -> model validation scripts
  -> checksum tooling
  -> runtime/model/cache/fallback tests
```

Но реальные бинарные assets пока отсутствуют:

```text
public/tts/runtime/sherpa-onnx/*
public/tts/models/*/model.onnx
public/tts/models/*/model.onnx.json
```

Поэтому следующий шаг — не создавать новый provider и не переписывать UI, а довести текущий provider до фактического audio output.

---

## 2. Главная цель итерации

После итерации должно быть доказано, что `local_neural_tts_piper` способен реально синтезировать звук в браузере через staged `web_wasm_sherpa_piper` assets.

Целевая цепочка:

```text
UI TTS button
  -> PortableTtsProvider
  -> TTSProviderRouter
  -> WebPiperSherpaBackend
  -> staged sherpa-onnx WASM runtime
  -> staged Piper ONNX model/config
  -> real synthesis output
  -> WebAudioRenderer
  -> playback
  -> diagnostics
```

Fallback остаётся, но только как честный запасной путь:

```text
runtime/model missing -> explicit fallback reason -> system_fallback, if allowed
runtime/model missing + fallback disabled -> unavailable, no crash
```

---

## 3. Scope

### Входит в scope

```text
1. Commit + push текущего readiness/staging-layer перед дальнейшей работой.
2. Staging `sherpa-onnx` WebAssembly runtime files.
3. Staging Piper ONNX model/config files минимум для одного языка.
4. Validation staged assets через scripts/check_tts_models.js.
5. Checksum update через scripts/update_tts_model_checksums.js.
6. Проверка, что manifest paths реально соответствуют staged files.
7. Реальный browser smoke с actual audio output.
8. Проверка badge/diagnostics/cache/fallback на staged assets.
9. Mobile smoke без регрессии classic table layout.
10. Документация результата и known limitations.
11. Финальный commit + push после успешного smoke.
```

### Не входит в scope

```text
1. Полноценное iOS-приложение.
2. Полноценное Android-приложение.
3. Swift/Kotlin native bridge.
4. Новый cloud TTS provider.
5. Chatterbox/Kokoro/XTTS.
6. Voice cloning.
7. Переписывание всей таблицы или UI.
8. Удаление system_fallback.
9. Автоматическая загрузка тяжёлых моделей при открытии страницы.
10. Обещание premium Hebrew voice quality без benchmark.
```

---

## 4. Required repo audit before staging

Перед staging Codex должен проверить:

```text
1. Текущая ветка и git status.
2. Последний commit readiness/staging-layer запушен.
3. public/tts/runtime/runtimeStatus.js.
4. public/tts/runtime/sherpaOnnxAdapter.js.
5. public/tts/core.js.
6. public/tts/backends.js.
7. public/tts/models/*/manifest.json.
8. docs/LOCAL_NEURAL_TTS_PIPER.md.
9. docs/TTS_MODEL_STAGING.md.
10. scripts/check_tts_models.js.
11. scripts/update_tts_model_checksums.js.
12. package.json scripts.
13. Как Express отдаёт static assets из public.
14. Есть ли ограничения размера файлов в repo/GitHub.
15. Нужно ли использовать Git LFS или не коммитить model binaries.
```

---

## 5. Runtime staging

Ожидаемый каталог:

```text
public/tts/runtime/sherpa-onnx/
  sherpa-onnx.js
  sherpa-onnx-wasm-main.js
  sherpa-onnx-wasm-main.wasm
  sherpa-onnx-wasm-main.data
```

Требования:

```text
1. Использовать self-hosted runtime assets.
2. Не подключать runtime с CDN без явного решения.
3. Не грузить runtime до необходимости, если TTS_PRELOAD=false.
4. Проверить, что файлы реально доступны из браузера по static path.
5. Проверить MIME/serving для .wasm.
6. Если .data file не нужен выбранному build, обновить docs и adapter contract.
7. Если имена файлов отличаются, обновить adapter и docs, а не хардкодить магию в UI.
```

---

## 6. Model staging

Ожидаемые файлы:

```text
public/tts/models/he/model.onnx
public/tts/models/he/model.onnx.json
public/tts/models/ru/model.onnx
public/tts/models/ru/model.onnx.json
public/tts/models/en/model.onnx
public/tts/models/en/model.onnx.json
```

Минимум для первого smoke:

```text
public/tts/models/he/model.onnx
public/tts/models/he/model.onnx.json
```

Если модели слишком большие для commit, использовать один из вариантов:

```text
Option A: Git LFS, если проект это допускает.
Option B: не коммитить binaries, но добавить scripts/stage_tts_assets.ps1 и docs/TTS_MODEL_STAGING.md.
Option C: хранить binaries вне repo и документировать локальный staging path.
```

Нельзя оставлять ситуацию, где документация говорит “stage assets”, но нет конкретной инструкции, откуда и куда их положить.

---

## 7. Manifest update

Для каждого staged языка проверить и обновить:

```text
voiceId
lang
provider
engine
runtime
modelPath
configPath
sampleRate
speakerId
license
source
checksumSha256
configChecksumSha256
modelVersion
qualityTier
platforms
```

Требования:

```text
1. modelPath/configPath должны указывать на существующие staged files.
2. checksumSha256/configChecksumSha256 должны быть заполнены после checksum script.
3. modelVersion должен быть стабильным и входить в cache key.
4. qualityTier для Hebrew пока не выше baseline, если нет benchmark.
5. UI не должен хардкодить model names.
```

---

## 8. Validation commands

После staging выполнить:

```powershell
cd E:\projects\tts-prototype-android
node scripts\check_tts_models.js
node scripts\update_tts_model_checksums.js
node scripts\check_tts_models.js
```

Ожидаемый результат:

```text
1. Нет MISSING_MODEL для staged языка.
2. Нет MISSING_CONFIG для staged языка.
3. checksum fields обновлены.
4. Manifest validation проходит.
```

Если ru/en пока не staged, скрипт должен либо:

```text
1. поддерживать режим --lang he;
```

либо документация должна явно объяснять, почему ru/en missing допустимы для первого smoke.

Рекомендуемая доработка:

```powershell
node scripts\check_tts_models.js --lang he
node scripts\update_tts_model_checksums.js --lang he
```

Если такого режима нет, добавить его.

---

## 9. Real browser smoke

Запустить приложение:

```powershell
cd E:\projects\tts-prototype-android
npm run dev
```

Если script name другой, использовать фактический script из `package.json`.

Проверить в браузере:

```text
1. Приложение открывается без console errors.
2. Таблица отображается.
3. TTS controls видны.
4. Первый TTS click показывает loading/runtime/model state.
5. Runtime status переходит в ready.
6. Model status переходит в ready.
7. Actual backend показывает web_wasm, а не system_fallback.
8. Audio реально воспроизводится через WebAudioRenderer.
9. Diagnostics показывают modelLoadMs/synthMs/renderMs.
10. Cache miss на первом запросе.
11. Cache hit на повторном том же запросе.
12. Stop останавливает playback.
13. Другой row TTS останавливает предыдущий playback.
14. Hebrew niqqud не удаляется.
15. Fallback reason отсутствует при успешном web_wasm synthesis.
```

Hebrew smoke phrases:

```text
שלום עולם
ברוך אתה
בָּרוּךְ אַתָּה
העברית היא שפה עתיקה ומתחדשת.
אני רוצה לשמוע את הטקסט הזה בעברית טבעית.
```

---

## 10. Fallback smoke

Проверить controlled failure modes.

### 10.1 Disable web_wasm

```powershell
$env:TTS_WEB_WASM_ENABLED="false"
npm run dev
```

Ожидание:

```text
1. web_wasm не используется.
2. system_fallback используется, если TTS_ALLOW_SYSTEM_FALLBACK=true.
3. Badge показывает System fallback.
4. Diagnostics показывают fallback reason.
```

### 10.2 Disable fallback

```powershell
$env:TTS_ALLOW_SYSTEM_FALLBACK="false"
npm run dev
```

Ожидание при missing/unavailable runtime:

```text
1. fallback не используется.
2. UI показывает unavailable/error state.
3. Приложение не падает.
4. Таблица не ломается.
```

### 10.3 Missing model

Временно переименовать staged model или использовать test config.

Ожидание:

```text
model_missing -> fallback or unavailable according to config
```

---

## 11. Mobile smoke

Проверить mobile layout, минимум через browser responsive mode, лучше на реальном iPhone/Android.

Проверить:

```text
1. Classic mode table не ломается.
2. Horizontal scroll сохраняется.
3. TTS button не уезжает за край.
4. Touch target достаточный.
5. Loading/playing/error state видимы.
6. Stop доступен.
7. Редактирование таблицы не конфликтует с TTS controls.
8. Нет layout shift при длинном Hebrew text.
```

---

## 12. Tests

После staging и smoke выполнить:

```powershell
cd E:\projects\tts-prototype-android
node --test tests\portableTtsCore.test.js tests\portableTtsRuntime.test.js tests\portableTtsManifest.test.js tests\portableTtsCache.test.js
node scripts\check_tts_models.js
npm run db:migrate
npm test
```

Если `npm test` остаётся красным только на известных baseline failures, зафиксировать это в финальном отчёте.

---

## 13. Documentation update

Обновить:

```text
docs/LOCAL_NEURAL_TTS_PIPER.md
docs/TTS_MODEL_STAGING.md
```

Документация должна честно отражать:

```text
1. Какие runtime assets staged.
2. Какие model assets staged.
3. Какие языки реально прошли smoke.
4. Какие языки пока model_missing.
5. Как запускать validation.
6. Как запускать browser smoke.
7. Как отключить web_wasm.
8. Как отключить fallback.
9. Какие known limitations остались.
10. Hebrew voice quality status: baseline/premium candidate/unknown.
```

---

## 14. Definition of Done

Итерация считается завершённой, если выполнено:

```text
1. Текущий readiness/staging-layer закоммичен и запушен до начала дальнейших действий.
2. Runtime assets staged или создана точная инструкция staging.
3. Минимум одна Piper model/config pair staged.
4. `check_tts_models.js` проходит для staged языка.
5. `update_tts_model_checksums.js` заполняет checksum fields.
6. Manifest paths соответствуют staged files.
7. Browser smoke показывает actualBackend=web_wasm.
8. Audio реально воспроизводится через WebAudioRenderer.
9. Diagnostics показывают runtime/model ready.
10. Diagnostics показывают timings и cache state.
11. Повторный запрос даёт cache hit.
12. Controlled fallback работает.
13. Controlled unavailable state работает при fallback disabled.
14. Hebrew niqqud не теряется.
15. Mobile/classic table layout не сломан.
16. Targeted TTS tests проходят.
17. Documentation updated.
18. Финальный commit создан и запушен.
19. `git status` чистый после финального commit/push.
```

---

## 15. Рекомендуемые commit messages

Первый обязательный commit перед дальнейшей работой:

```text
feat(tts): add sherpa wasm readiness and model staging flow
```

Финальный commit после staging/smoke:

```text
feat(tts): stage piper wasm assets and validate browser synthesis
```

Если binaries не коммитятся:

```text
docs(tts): document piper wasm asset staging and browser smoke
```

или:

```text
feat(tts): add piper asset staging scripts and browser smoke validation
```

---

## 16. Финальная формулировка

Этот шаг должен перевести проект из состояния:

```text
готовый readiness/staging-layer, но без staged assets
```

в состояние:

```text
готовый и проверенный web_wasm local neural TTS path минимум для одного языка
```

Главное: сначала сохранить текущий результат в Git, затем работать с runtime/model assets. Нельзя продолжать изменения поверх незакоммиченного readiness-layer, потому что это смешает два разных этапа и усложнит откат при проблемах с WASM/model staging.
