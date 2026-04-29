# ТЗ для Codex: PATCH-NEXT — Full Hebrew Phonikud/Piper Integration, Provider UI Settings, Hebrew Web/WASM Feasibility and Noncommercial Packaging

Версия: 1.0  
Проект: `tts-prototype-android`  
Статус продукта: **noncommercial**  
Фокус: **Hebrew TTS как основной пользовательский сценарий**  
Цель итерации: перевести Hebrew Phonikud/Piper из изолированного research sidecar PoC в полноценно интегрированный некоммерческий TTS-provider с UI-настройками, fallback-логикой, cache/diagnostics, packaging-сценарием и отдельным gated-треком для проверки Hebrew `web_wasm`.

---

## 0. Контекст текущего состояния

### 0.1. Что уже доказано

В предыдущем spike был подтверждён рабочий локальный Hebrew TTS path:

```text
phonikud-onnx
  -> phonikud.phonemize()
  -> piper-onnx + shaul.onnx
  -> WAV
```

PoC сгенерировал WAV для 8 Hebrew smoke phrases; среднее время генерации составило около 158.9 ms, включая G2P и TTS.

Sidecar PoC уже существует как endpoint:

```text
POST /tts/hebrew/phonikud-piper
```

Он синтезирует WAV через `PhonikudPiperPocEngine`, возвращает `audio/wav`, отдаёт diagnostics в `X-TTS-Diagnostics`, но пока имеет ограничения: no auth, no rate limiting, no packaging story.

### 0.2. Что изменилось после manual review

Ранее документация считала качество только предварительно acceptable for experimental, потому что ручное прослушивание ещё не было выполнено.

Теперь пользователь подтвердил:

```text
Manual Hebrew TTS Quality Review выполнен.
Качество произношения устраивает.
Продукт некоммерческий.
```

Следовательно, решение меняется с:

```text
research-only sidecar PoC
```

на:

```text
noncommercial integrated Hebrew local TTS provider
```

Но не меняется на:

```text
commercial/premium release-ready provider
```

---

## 1. Главная цель итерации

Интегрировать Hebrew Phonikud/Piper как полноценный TTS-provider для некоммерческого продукта.

Целевая цепочка:

```text
UI TTS button
  -> TTS Provider Selector
  -> Hebrew Local Phonikud/Piper provider
  -> ai-local sidecar
  -> Phonikud / phonemize
  -> Piper ONNX
  -> WAV
  -> browser playback
  -> diagnostics/cache/settings
```

Fallback path:

```text
Hebrew Local Phonikud/Piper unavailable
  -> Online TTS
  -> Browser fallback
  -> unavailable/error state
```

---

## 2. Продуктовое правило

Главное правило:

```text
Hebrew TTS должен быть рабочим всегда.
```

Поэтому:

```text
1. Hebrew Phonikud/Piper можно интегрировать как основной selectable local provider.
2. Online TTS нельзя удалять.
3. Online TTS должен оставаться fallback.
4. Browser speechSynthesis должен оставаться emergency fallback.
5. Последний выбранный provider должен сохраняться.
6. Если local sidecar не запущен, пользователь не должен остаться без звука.
```

---

## 3. Provider strategy

### 3.1. Provider list

В UI должен быть единый список TTS providers:

| Provider ID | UI label | Назначение |
|---|---|---|
| `online_tts` | `Online TTS` | Старый online/default TTS |
| `hebrew_phonikud_piper` | `Hebrew Local Piper` | Новый локальный Hebrew provider через sidecar |
| `local_neural_tts_piper` | `Local Piper / Web WASM` | Текущий English `web_wasm` provider |
| `system_fallback` | `Browser fallback` | Emergency fallback через browser/OS |

---

### 3.2. Default behavior

Есть два допустимых варианта.

#### Вариант A — безопасный default

```text
Hebrew default = Online TTS
Hebrew Local Piper = selectable provider
```

Рекомендуется для первого production-like rollout.

#### Вариант B — local-first noncommercial default

```text
Hebrew default = Hebrew Local Piper
Fallback = Online TTS
```

Допустимо только если:

```text
1. sidecar auto-start или setup documented;
2. UI ясно показывает status sidecar-а;
3. fallback работает без задержек;
4. manual smoke на desktop/mobile прошёл.
```

Рекомендация для этой итерации:

```text
Сделать Hebrew Local Piper доступным и сохраняемым provider-ом, но не удалять Online TTS и не ломать fallback.
```

---

## 4. UI requirements

### 4.1. Интеграция с существующими настройками

Сейчас у online TTS уже есть настройки:

```text
1. Скорость речи
2. Тон / pitch
3. Голос TTS
```

Нужно не создавать отдельный разрозненный UI для нового provider-а, а привести настройки к общей модели:

```text
TTS Provider
TTS Voice
Speech Speed
Pitch
```

---

### 4.2. Provider-aware settings

Не все provider-ы поддерживают одинаковые параметры.

| Настройка | Online TTS | Hebrew Phonikud/Piper | Web WASM Piper | Browser fallback |
|---|---|---|---|---|
| Provider select | да | да | да | да |
| Voice select | да | да, минимум `shaul` | да, `en-default` | зависит от браузера |
| Speed | да | да, если поддерживается engine; иначе через post-processing/playbackRate |
| Pitch | да | если не поддерживается — disabled с пояснением |
| Persist settings | да | да | да | да |
| Diagnostics | да | да | да | ограниченно |

---

### 4.3. UI behavior

При выборе provider-а UI должен адаптировать доступные controls.

Пример:

```text
Provider: Hebrew Local Piper
Voice: Shaul
Speed: 1.0x
Pitch: disabled / not supported by this provider
Status: Sidecar ready / Sidecar unavailable
```

Если pitch не поддерживается Phonikud/Piper:

```text
Pitch: not supported by Hebrew Local Piper
```

Не делать “фиктивную” настройку pitch, которая ничего не меняет.

---

### 4.4. Persisted settings

Сохранять:

```text
tts.selectedProvider
tts.voice.online_tts
tts.voice.hebrew_phonikud_piper
tts.voice.local_neural_tts_piper
tts.speed
tts.pitch
```

Если старые ключи уже существуют, сделать migration:

```text
old speed setting -> tts.speed
old pitch setting -> tts.pitch
old voice setting -> tts.voice.online_tts
```

Нельзя сбрасывать пользовательские настройки после обновления.

---

## 5. Sidecar integration

### 5.1. Endpoint

Использовать существующий endpoint:

```text
POST /tts/hebrew/phonikud-piper
```

Текущий sidecar уже возвращает `audio/wav` и отдаёт diagnostics в header `X-TTS-Diagnostics`.

---

### 5.2. Request contract

Расширить request:

```json
{
  "text": "שלום עולם",
  "voice": "shaul",
  "speed": 1.0,
  "pitch": 0,
  "format": "wav"
}
```

Если `speed` или `pitch` не поддерживаются на уровне engine, sidecar должен:

```text
1. принять поле;
2. вернуть в diagnostics supported=false;
3. не падать;
4. UI должен показать, что параметр не применён.
```

---

### 5.3. Response

Основной response:

```text
audio/wav
```

Headers:

```text
X-TTS-Diagnostics
```

Diagnostics JSON:

```json
{
  "provider": "hebrew_phonikud_piper",
  "runtime": "python_sidecar",
  "voice": "shaul",
  "g2pMs": 53,
  "ttsMs": 92,
  "totalMs": 159,
  "textChars": 33,
  "licenseStatus": "noncommercial_allowed",
  "qualityTier": "acceptable",
  "speedSupported": true,
  "pitchSupported": false
}
```

---

## 6. Licensing mode

Поскольку продукт некоммерческий, вводится operational mode:

```text
TTS_HEBREW_LOCAL_LICENSE_MODE=noncommercial
```

Запрещённые значения для этой итерации:

```text
commercial
premium_commercial
```

Если mode не задан, default:

```text
research_only
```

Allowed modes:

| Mode | Meaning |
|---|---|
| `research_only` | Только PoC/dev |
| `noncommercial` | Некоммерческий продукт |
| `commercial` | Запрещено до отдельной лицензии |

UI diagnostics должны показывать:

```text
License: noncommercial
```

Docs должны явно сказать:

```text
Hebrew Local Piper is allowed only for noncommercial use in this project configuration.
```

---

## 7. Cache

Добавить cache для Hebrew local sidecar.

Cache key:

```text
SHA256(
  provider +
  voice +
  normalizedText +
  speed +
  pitch +
  modelVersion +
  phonikudVersion +
  piperModelVersion
)
```

Cache policy:

```text
1. Cache WAV/audio response.
2. Не кэшировать ошибки.
3. Не кэшировать fallback как Hebrew Local Piper.
4. При изменении speed/pitch/voice cache key меняется.
5. При изменении modelVersion cache key меняется.
```

---

## 8. Fallback

Fallback chain для Hebrew:

```text
hebrew_phonikud_piper
  -> online_tts
  -> system_fallback
  -> unavailable
```

Причины fallback:

```text
sidecar_disabled
sidecar_unavailable
license_mode_blocked
model_missing
synthesis_failed
timeout
unsupported_voice
```

Diagnostics должны показывать:

```text
selectedProvider
actualProvider
fallbackChain
fallbackReason
```

---

## 9. Hebrew web_wasm track

### 9.1. Важно

Не пытаться заменить sidecar на `web_wasm` в этом же патче без gate.

Документация уже фиксирует: готового supported Hebrew `sherpa-onnx` browser bundle не найдено, а practically realistic path — Python sidecar, не web_wasm.

### 9.2. Цель web_wasm track

Создать отдельный gated feasibility subtrack:

```text
Can Hebrew Phonikud/Piper be moved from sidecar to browser web_wasm?
```

### 9.3. Deliverable

Создать:

```text
docs/TTS_HEBREW_WEB_WASM_FEASIBILITY.md
```

Проверить:

```text
1. Можно ли запускать Phonikud ONNX в browser.
2. Можно ли запускать Piper ONNX Hebrew model в browser.
3. Нужен ли phonemizer в JS/WASM.
4. Можно ли заменить Python phonikud.phonemize browser-side.
5. Какой размер assets.
6. Какая задержка.
7. Будет ли это работать на iPhone Safari.
8. Нужно ли разделить на:
   - browser web_wasm;
   - desktop sidecar;
   - native iOS/Android.
```

Decision:

```text
WEB_WASM_GO
WEB_WASM_NO_GO
WEB_WASM_NEEDS_SEPARATE_RESEARCH
```

---

## 10. Production packaging for noncommercial app

### 10.1. Packaging goal

Сделать packaging story для некоммерческого Hebrew local TTS.

Проверить:

```text
1. Где хранятся Hebrew model files.
2. Как sidecar получает model paths.
3. Как пользователь запускает sidecar.
4. Есть ли auto-start.
5. Что происходит, если sidecar не запущен.
6. Как UI показывает sidecar status.
7. Как отключить local provider.
```

---

### 10.2. Packaging options

| Option | Description | Рекомендация |
|---|---|---|
| Manual sidecar start | Пользователь запускает ai-local отдельно | Минимально для dev |
| Node starts sidecar | Node server поднимает Python sidecar | Хорошо для desktop web-app |
| Bundled Python sidecar | Пакуется вместе с приложением | Следующий зрелый этап |
| Web WASM | Всё в браузере | Пока отдельный feasibility track |

---

### 10.3. Required docs

Создать:

```text
docs/TTS_HEBREW_NONCOMMERCIAL_PACKAGING.md
```

Документ должен включать:

```text
1. Установка зависимостей.
2. Где лежат модели.
3. Как запустить sidecar.
4. Как проверить health.
5. Как включить provider в UI.
6. Как работает fallback.
7. Как отключить provider.
8. License notice.
```

---

## 11. Health check

Добавить sidecar health endpoint:

```text
GET /tts/hebrew/phonikud-piper/health
```

Response:

```json
{
  "status": "ready",
  "provider": "hebrew_phonikud_piper",
  "licenseMode": "noncommercial",
  "voices": ["shaul"],
  "modelLoaded": true,
  "phonikudReady": true,
  "piperReady": true
}
```

UI должен использовать health check для badge:

```text
Hebrew Local Piper: ready
Hebrew Local Piper: sidecar unavailable
Hebrew Local Piper: disabled
```

---

## 12. Tests

Добавить/обновить:

```text
tests/portableTtsProviderPolicy.test.js
tests/portableTtsSettingsPersistence.test.js
tests/test_hebrew_tts_sidecar.py
tests/test_hebrew_tts_cache.py
tests/test_hebrew_tts_license_mode.py
```

Проверить:

```text
1. Hebrew Local Piper selectable.
2. Последний выбранный provider сохраняется.
3. Online TTS остаётся fallback.
4. Sidecar unavailable -> fallback to online.
5. License mode commercial -> provider disabled.
6. License mode noncommercial -> provider enabled.
7. Speed сохраняется и передаётся.
8. Pitch сохраняется и либо передаётся, либо disabled.
9. Voice сохраняется per provider.
10. Cache hit работает для одинакового текста/settings.
11. Cache miss при изменении speed/pitch/voice.
12. Diagnostics показывают selectedProvider/actualProvider/fallbackReason.
```

---

## 13. Smoke checklist

### 13.1. Desktop smoke

Проверить:

```text
1. Запустить приложение.
2. Запустить sidecar.
3. UI показывает Hebrew Local Piper ready.
4. Выбрать Hebrew Local Piper.
5. Выбрать voice Shaul.
6. Установить speed.
7. Проверить pitch control: работает или disabled с пояснением.
8. Озвучить Hebrew phrase.
9. Проверить звук.
10. Повторить тот же текст — cache hit.
11. Остановить playback.
12. Отключить sidecar — fallback to online.
13. Выбрать Online TTS — online работает.
14. Перезагрузить страницу — provider/settings сохранились.
```

---

### 13.2. Mobile smoke

Проверить на реальном устройстве или зафиксировать pending:

```text
1. Provider selector доступен.
2. Speed/pitch/voice controls не ломают layout.
3. Hebrew Local Piper либо работает через sidecar, либо fallback.
4. Online fallback работает.
5. Stop работает.
6. Настройки сохраняются после reload.
```

---

## 14. Documentation to update/create

```text
docs/TTS_PROVIDER_POLICY.md
docs/TTS_HEBREW_DECISION.md
docs/TTS_HEBREW_SIDECAR_POC.md
docs/TTS_HEBREW_NONCOMMERCIAL_PACKAGING.md
docs/TTS_HEBREW_WEB_WASM_FEASIBILITY.md
docs/LOCAL_NEURAL_TTS_PIPER.md
docs/TTS_MODEL_STAGING.md
```

Обновить decision:

```text
DECISION_B_ADD_RESEARCH_ONLY_SIDECAR
```

на:

```text
DECISION_F_INTEGRATE_NONCOMMERCIAL_HEBREW_SIDECAR
```

с пояснением:

```text
Manual quality review passed.
Product is noncommercial.
Commercial usage remains blocked.
```

---

## 15. PowerShell commands

Pre-flight:

```powershell
cd E:\projects\tts-prototype-android
git status
npm run db:migrate
node --test tests\portableTtsCore.test.js tests\portableTtsRuntime.test.js tests\portableTtsManifest.test.js tests\portableTtsCache.test.js tests\portableTtsProviderPolicy.test.js
npm run test:tts-browser-smoke
```

Sidecar tests:

```powershell
uv run --with pytest --with fastapi --with httpx pytest tests/test_hebrew_tts_poc.py tests/test_hebrew_tts_sidecar.py -v
```

Run sidecar:

```powershell
cd E:\projects\tts-prototype-android
uvicorn ai-local.hebrew_tts_sidecar:app --host 127.0.0.1 --port 8766
```

Health check:

```powershell
Invoke-RestMethod http://127.0.0.1:8766/tts/hebrew/phonikud-piper/health
```

---

## 16. Definition of Done

Итерация считается завершённой, если выполнено:

```text
1. Hebrew Phonikud/Piper интегрирован как selectable TTS provider.
2. Product mode documented as noncommercial.
3. Commercial mode explicitly blocked.
4. Existing Online TTS сохранён.
5. Online TTS работает как fallback.
6. Browser fallback работает как emergency fallback.
7. UI provider selector поддерживает Hebrew Local Piper.
8. Последний выбранный provider сохраняется после reload.
9. Existing speed setting интегрирован.
10. Existing pitch setting интегрирован или корректно disabled для provider-а.
11. Existing voice setting интегрирован per provider.
12. Sidecar health check добавлен.
13. Sidecar diagnostics отображаются в UI.
14. Cache работает для Hebrew Local Piper.
15. Fallback не кэшируется как local output.
16. Desktop smoke пройден.
17. Mobile smoke пройден или честно documented pending.
18. Hebrew web_wasm feasibility doc создан.
19. Noncommercial packaging doc создан.
20. Targeted tests проходят.
21. English web_wasm smoke не сломан.
22. npm run db:migrate проходит.
23. Documentation updated.
24. Commit создан.
25. Push выполнен.
```

---

## 17. Recommended commit messages

```text
feat(tts): integrate noncommercial hebrew phonikud piper provider
```

или по частям:

```text
feat(tts): add hebrew phonikud piper provider integration
feat(tts): persist provider voice speed and pitch settings
feat(tts): add hebrew tts sidecar health and diagnostics
feat(tts): cache hebrew local tts audio
docs(tts): document noncommercial hebrew tts packaging
docs(tts): add hebrew web wasm feasibility plan
test(tts): cover hebrew provider settings and fallback policy
```

---

## 18. Final product rule

Финальное правило:

```text
Hebrew Local Piper можно интегрировать для некоммерческого продукта,
потому что ручное качество принято пользователем,
но commercial usage остаётся запрещённым до отдельной лицензии.
```

UX-правило:

```text
Пользователь выбирает provider.
Настройки speed / pitch / voice работают в единой панели.
Если выбранный provider не поддерживает настройку, UI честно показывает это.
Если local sidecar недоступен, Hebrew TTS fallback-ится в Online TTS.
```

Стратегическое правило:

```text
Sidecar integration now.
Hebrew web_wasm only after separate feasibility proof.
Native/mobile packaging later.
```
