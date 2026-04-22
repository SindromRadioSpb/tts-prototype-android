# ТЗ для Codex: Portable `local_neural_tts_piper` Provider для web сейчас и native iOS/Android позже

Версия: 1.0  
Проект: `tts-prototype-android`  
Цель итерации: реализовать переносимую архитектуру локального neural TTS-провайдера `local_neural_tts_piper`, который сначала работает в web-приложении через WASM/backend, но спроектирован так, чтобы позже без переписывания бизнес-логики переехать в native iOS/Android-приложение.

---

## 0. Критически важное вводное требование

Перед планированием и реализацией этой итерации необходимо внимательно ознакомиться со всей актуальной документацией в репозитории проекта и с текущей архитектурой приложения.

Нельзя начинать изменение кода до выполнения repo audit и составления плана.

Цель не просто “добавить кнопку TTS”, а заложить профессиональную premium-архитектуру speech-модуля, в которой:

- web-реализация является первым backend-адаптером;
- provider API остаётся переносимым;
- будущий native iOS/Android runtime подключается без полной переделки UI, кэша, voice registry, diagnostics и routing logic;
- минимизированы риски регрессии в текущем web-приложении;
- не создаётся зоопарк несвязанных провайдеров;
- не смешиваются UI, загрузка моделей, синтез, playback, кэш и диагностика в одном файле.

---

## 1. Обязательный repo audit перед реализацией

Перед началом патчей необходимо изучить репозиторий и зафиксировать краткий audit summary.

Проверить минимум следующие области:

```text
1. Текущая структура проекта.
2. Текущий frontend entrypoint.
3. Текущий server.js / Express API.
4. Текущий Python sidecar / ai-local, если он уже используется.
5. Текущие TTS / audio / speech / niqqud / transliteration участки.
6. Текущие UI-компоненты таблицы.
7. Текущие настройки provider/provenance/status badge.
8. Текущие механизмы localStorage / IndexedDB / SQLite / cache.
9. Текущие тесты.
10. Текущие docs / README / runbook / development notes.
```

Если в репозитории есть документы вида:

```text
README.md
docs/*.md
docs/ARCHITECTURE*.md
docs/UI*.md
docs/TTS*.md
docs/NIQQUD*.md
docs/PIPELINE*.md
docs/TRANSLITERATION*.md
docs/MOBILE*.md
docs/TEST*.md
```

их нужно прочитать до планирования.

Если документация отсутствует или противоречива, это нужно явно зафиксировать в плане как risk / gap.

---

## 2. Проверка предварительных условий

Перед реализацией проверить и зафиксировать:

```text
1. Приложение запускается в текущем состоянии.
2. Текущий web UI таблицы работает без новых изменений.
3. Текущие provider/status/provenance элементы не сломаны.
4. Текущий pipeline огласовки/транслитерации работает или имеет известные ограничения.
5. Есть понятная точка подключения кнопки TTS в UI.
6. Есть понятная точка подключения нового frontend-модуля.
7. Есть возможность добавить новые JS/TS-модули без переписывания всего index.html.
8. Есть возможность добавить IndexedDB/cache слой.
9. Есть возможность добавить static assets для TTS-моделей.
10. Есть тестовый сценарий запуска проекта через PowerShell.
```

Команды должны даваться только для PowerShell.

Базовая проверка:

```powershell
cd E:\projects\tts-prototype-android
git status
npm install
npm test
npm run build
```

Если в проекте другие команды запуска или тестирования, использовать фактические команды из репозитория и зафиксировать это в плане.

---

## 3. Главная продуктовая цель

Реализовать переносимый provider:

```text
Provider:
local_neural_tts_piper
```

Первый backend в этой итерации:

```text
Backend:
web_wasm_sherpa_piper
```

Будущие backend-адаптеры, которые должны быть предусмотрены архитектурно, но не реализованы полностью в этой итерации:

```text
ios_native_sherpa_piper
android_native_sherpa_piper
desktop_sidecar_piper
```

Важно: не создавать отдельные продуктовые провайдеры:

```text
web_piper
ios_piper
android_piper
desktop_piper
```

Вместо этого должен быть один provider:

```text
local_neural_tts_piper
```

с несколькими backend-адаптерами.

---

## 4. Что именно нужно получить в этой итерации

В этой итерации необходимо реализовать:

```text
1. Backend-agnostic TTS Core API.
2. Provider Router.
3. Voice Registry.
4. Model Manifest system.
5. Web WASM backend shell для Piper/sherpa-onnx.
6. Web Audio playback layer.
7. Cache abstraction.
8. IndexedDB audio cache для web.
9. Diagnostics model.
10. Hebrew text preprocessing stage.
11. UI integration: кнопка TTS, состояния, stop, speed slider, provider badge.
12. Native bridge stub для будущего iOS/Android.
13. Tests / smoke checks / docs.
```

Если полноценная WASM-интеграция sherpa-onnx требует дополнительной сборки или оказывается невозможной в рамках одного патча, необходимо реализовать архитектурный слой полностью и добавить временный mock/backend-fallback, но не ломать архитектуру.

---

## 5. Что НЕ входит в скоуп этой итерации

Явно не реализовывать в этой итерации:

```text
1. Полноценное iOS-приложение.
2. Полноценное Android-приложение.
3. Native Swift LocalTTSPlugin.
4. Native Kotlin/JNI LocalTTSModule.
5. Chatterbox / Kokoro / XTTS.
6. Voice cloning.
7. Коммерческий cloud TTS.
8. Замена всей архитектуры приложения.
9. Переписывание всего UI с нуля.
10. Скрытое удаление существующих provider/fallback механизмов.
```

Текущая итерация должна подготовить переносимую архитектуру и первый web backend.

---

## 6. Целевая архитектура

### 6.1 Общая схема

```text
UI Table
  ↓
TTS Button / Toolbar / Provider Badge
  ↓
TTSProviderRouter
  ↓
local_neural_tts_piper
  ↓
Backend selection
  ├── web_wasm_sherpa_piper          # implemented now
  ├── ios_native_sherpa_piper        # future stub
  ├── android_native_sherpa_piper    # future stub
  ├── desktop_sidecar_piper          # optional future
  └── system_fallback                # fallback only
  ↓
Text preprocessing
  ↓
Voice registry / model manifest
  ↓
Synthesis
  ↓
Audio cache
  ↓
Playback
  ↓
Diagnostics / UI status
```

### 6.2 Принцип переносимости

Web-реализация не должна быть “зашита” в UI.

Плохо:

```javascript
button.onclick = async () => {
  const model = await loadModel();
  const audio = await model.synthesize(text);
  play(audio);
};
```

Хорошо:

```javascript
await ttsProvider.synthesizeAndPlay({
  text,
  lang: "he",
  voiceId: "he-default",
  speed: 1.0
});
```

---

## 7. Требуемая структура модулей

Адаптировать под фактическую структуру репозитория после audit, но сохранить смысловую декомпозицию.

Рекомендуемая структура:

```text
src/
  tts/
    core/
      TTSProvider.ts
      TTSRequest.ts
      TTSResult.ts
      TTSProviderRouter.ts
      TTSModelManifest.ts
      TTSVoiceRegistry.ts
      TTSCacheKey.ts
      TTSDiagnostics.ts
      TextNormalizer.ts
      HebrewPreprocessor.ts

    backends/
      web/
        WebPiperSherpaBackend.ts
        WebModelLoader.ts
        WebAudioRenderer.ts
        IndexedDbAudioCache.ts

      native/
        NativeTTSBridge.ts
        NativePiperBackend.stub.ts

      fallback/
        SystemSpeechFallback.ts

    voices/
      voiceRegistry.ts

public/
  tts/
    models/
      he/
        manifest.json
      ru/
        manifest.json
      en/
        manifest.json
```

Если проект не использует TypeScript, реализовать то же самое в JavaScript, но сохранить интерфейсную дисциплину через JSDoc и явные object contracts.

---

## 8. Core API

Реализовать единый контракт.

Если проект TypeScript:

```typescript
export type TTSLang = "he" | "ru" | "en";

export type TTSBackend =
  | "web_wasm"
  | "ios_native"
  | "android_native"
  | "desktop_sidecar"
  | "system_fallback";

export interface TTSRequest {
  text: string;
  lang: TTSLang;
  voiceId?: string;
  speed?: number;
  pitch?: number;
  format?: "pcm" | "wav";
  cache?: boolean;
}

export interface TTSDiagnostics {
  modelLoadMs?: number;
  synthMs: number;
  renderMs?: number;
  textChars: number;
  backend: TTSBackend;
  provider: "local_neural_tts_piper";
  cacheHit: boolean;
  modelVersion?: string;
  voiceId: string;
}

export interface TTSResult {
  audioBuffer: AudioBuffer | ArrayBuffer;
  sampleRate: number;
  durationMs: number;
  provider: "local_neural_tts_piper";
  backend: TTSBackend;
  voiceId: string;
  cacheHit: boolean;
  diagnostics: TTSDiagnostics;
}

export interface TTSProvider {
  isAvailable(): Promise<boolean>;
  preload(lang: TTSLang, voiceId?: string): Promise<void>;
  synthesize(request: TTSRequest): Promise<TTSResult>;
  play(result: TTSResult): Promise<void>;
  stop(): Promise<void>;
  unload(): Promise<void>;
}
```

Если проект JavaScript:

```javascript
/**
 * @typedef {"he"|"ru"|"en"} TTSLang
 * @typedef {"web_wasm"|"ios_native"|"android_native"|"desktop_sidecar"|"system_fallback"} TTSBackend
 */

/**
 * @typedef {Object} TTSRequest
 * @property {string} text
 * @property {TTSLang} lang
 * @property {string=} voiceId
 * @property {number=} speed
 * @property {number=} pitch
 * @property {"pcm"|"wav"=} format
 * @property {boolean=} cache
 */

/**
 * @typedef {Object} TTSResult
 * @property {AudioBuffer|ArrayBuffer} audioBuffer
 * @property {number} sampleRate
 * @property {number} durationMs
 * @property {"local_neural_tts_piper"} provider
 * @property {TTSBackend} backend
 * @property {string} voiceId
 * @property {boolean} cacheHit
 * @property {Object} diagnostics
 */
```

---

## 9. Provider Router

Реализовать `TTSProviderRouter`.

Задачи:

```text
1. Определить доступные backend-и.
2. Выбрать лучший backend для текущей платформы.
3. Не ломать текущие fallback-сценарии.
4. Объяснять решение через diagnostics.
5. Не блокировать UI при preload/synthesis.
```

Логика выбора на этой итерации:

```text
1. Если доступен web_wasm_sherpa_piper и язык поддерживается:
   использовать local_neural_tts_piper / web_wasm.

2. Если web_wasm недоступен:
   использовать system_fallback, если разрешено.

3. Если ничего недоступно:
   показать ошибку TTS unavailable без падения приложения.
```

Будущая логика, которую нужно предусмотреть интерфейсно:

```text
1. iOS native app → ios_native.
2. Android native app → android_native.
3. Desktop LAN mode → desktop_sidecar.
4. Browser-only mode → web_wasm или system_fallback.
```

---

## 10. Voice Registry

Создать единый voice registry.

Не создавать platform-specific voice IDs.

Правильно:

```text
he-default
ru-default
en-default
```

Неправильно:

```text
web-he-default
ios-he-default
android-he-default
```

Пример registry:

```javascript
export const TTS_VOICES = {
  "he-default": {
    voiceId: "he-default",
    lang: "he",
    provider: "local_neural_tts_piper",
    displayName: "Hebrew Piper Local",
    qualityTier: "baseline",
    defaultSpeed: 1.0
  },
  "ru-default": {
    voiceId: "ru-default",
    lang: "ru",
    provider: "local_neural_tts_piper",
    displayName: "Russian Piper Local",
    qualityTier: "baseline",
    defaultSpeed: 1.0
  },
  "en-default": {
    voiceId: "en-default",
    lang: "en",
    provider: "local_neural_tts_piper",
    displayName: "English Piper Local",
    qualityTier: "baseline",
    defaultSpeed: 1.0
  }
};
```

Важно: конкретные имена моделей Piper не хардкодить в UI. Они должны приходить из manifest.

---

## 11. Model Manifest

Добавить manifest-файлы для voice models.

Пример:

```json
{
  "voiceId": "he-default",
  "lang": "he",
  "provider": "local_neural_tts_piper",
  "engine": "piper",
  "runtime": "sherpa-onnx",
  "modelPath": "/tts/models/he/model.onnx",
  "configPath": "/tts/models/he/model.onnx.json",
  "sampleRate": 22050,
  "speakerId": 0,
  "license": "MIT",
  "source": "rhasspy/piper-voices",
  "checksumSha256": "",
  "modelVersion": "piper-he-default-1",
  "qualityTier": "baseline",
  "platforms": ["web_wasm", "ios_native", "android_native"]
}
```

Требования:

```text
1. Не хардкодить конкретные Piper model names в бизнес-логике.
2. Manifest должен быть единственным source of truth для model path, config path, license, version.
3. Если checksum пустой, diagnostics должен явно показывать checksum: missing.
4. В будущем должен быть добавлен build-script для расчёта checksum.
5. Если модель не найдена, provider должен корректно перейти в unavailable/fallback, а не падать.
```

---

## 12. Web WASM backend

Реализовать backend:

```text
WebPiperSherpaBackend
```

Назначение:

```text
1. Загружать manifest.
2. Загружать модель.
3. Выполнять synthesis через sherpa-onnx WASM или совместимый web runtime.
4. Возвращать audio result в unified TTSResult.
5. Передавать audio в WebAudioRenderer.
6. Давать diagnostics.
```

Если полноценный sherpa-onnx WASM runtime не может быть подключён сразу:

```text
1. Реализовать backend shell полностью.
2. Добавить feature flag.
3. Добавить clear error: web_wasm_runtime_not_ready.
4. Добавить fallback на system speech.
5. Не ломать архитектуру.
```

Не допускается реализация, где TTS-код живёт прямо в обработчике кнопки UI.

---

## 13. Web Audio Renderer

Реализовать:

```text
WebAudioRenderer
```

Требования:

```text
1. Использовать AudioContext.
2. Поддерживать play.
3. Поддерживать stop.
4. Не запускать несколько аудио одновременно.
5. При запуске новой строки останавливать предыдущую.
6. Корректно обрабатывать iOS/Safari user gesture requirements.
7. Не использовать `<audio>` как основной playback-механизм.
```

Состояния:

```text
idle
loading
playing
stopping
error
```

---

## 14. Cache

### 14.1 Cache abstraction

Создать общий cache contract:

```text
TTSCache
  get(cacheKey)
  put(cacheKey, audioData, metadata)
  touch(cacheKey)
  evictIfNeeded()
  clear()
```

### 14.2 Web cache

Для web использовать:

```text
IndexedDB metadata + Blob/ArrayBuffer audio data
```

Если в проекте уже есть cache layer, интегрироваться с ним, а не создавать конфликтующую систему.

### 14.3 Cache key

Единый cache key:

```text
SHA256(
  provider +
  voiceId +
  lang +
  normalizedText +
  speed +
  modelVersion +
  preprocessingVersion
)
```

Важно:

```text
1. backend не должен входить в cache key, если audio semantics одинаковы.
2. modelVersion должен входить обязательно.
3. preprocessingVersion должен входить обязательно.
4. raw text не должен использоваться без normalization.
```

### 14.4 Cache limits

Для web-версии:

```text
TTS_WEB_CACHE_MAX_MB = 250
```

Допускается вынести в config.

Политика:

```text
LRU eviction
```

---

## 15. Hebrew preprocessing

Создать отдельный слой:

```text
HebrewPreprocessor
```

Он не должен быть отдельным provider.

Назначение:

```text
1. Нормализовать Hebrew text перед TTS.
2. Убирать опасные/лишние HTML/markup элементы.
3. Сохранять полезный niqqud, если он есть.
4. Не ломать уже существующий niqqud/transliteration pipeline.
5. Подготовить место для будущего Phonikud/niqqud-aware preprocessing.
```

Минимальная логика:

```text
1. strip HTML tags.
2. normalize whitespace.
3. trim.
4. preserve Hebrew letters and niqqud marks.
5. clamp text length.
6. split long text by sentence boundaries.
```

Добавить версию preprocessing:

```text
preprocessingVersion = "hebrew-preprocess-v1"
```

---

## 16. UI integration

### 16.1 Кнопка TTS

В таблице добавить кнопку:

```text
▶
```

или использовать существующий action area, если он уже есть.

Состояния кнопки:

```text
idle:      ▶
loading:   spinner
playing:   ■
error:     warning/error state
```

Требования:

```text
1. Кнопка не должна ломать mobile layout.
2. Кнопка должна быть доступна для строк с текстом.
3. При нажатии на другую строку текущее воспроизведение останавливается.
4. Повторное нажатие на playing строку останавливает звук.
5. Ошибка не должна ломать таблицу.
```

### 16.2 Speed slider

Добавить или использовать существующий toolbar control:

```text
TTS speed: 0.5x – 2.0x
Default: 1.0x
Step: 0.1
Storage: localStorage
```

### 16.3 Provider badge

В status/provenance/sub-row добавить отображение:

```text
TTS: Piper Local / web_wasm
```

Если fallback:

```text
TTS: System fallback
```

Если недоступно:

```text
TTS: unavailable
```

### 16.4 Diagnostics panel

Минимально показывать в debug/dev mode:

```text
Provider: local_neural_tts_piper
Backend: web_wasm
Voice: he-default
Cache: hit/miss
Model load: N ms
Synthesis: N ms
Render: N ms
Text chars: N
Model version: X
```

---

## 17. Native bridge stub

Добавить stub, но не реализовывать native iOS/Android.

```text
NativeTTSBridge
```

Требования:

```text
1. Интерфейс должен совпадать с TTSProvider API.
2. Сейчас возвращает unavailable.
3. Должен быть документирован как будущая точка подключения Capacitor/React Native/Swift/Kotlin.
4. UI и router должны уметь видеть, что native backend пока недоступен.
```

---

## 18. UI/UX CONSTRAINTS

Обязательные ограничения для premium mobile UX:

```text
1. Не использовать фиксированные высоты, которые ломают mobile layout.
2. Длинный контент должен прокручиваться.
3. Таблица не должна ломать горизонтальный скролл.
4. Кнопка TTS должна быть достаточно крупной для touch.
5. Все интерактивные элементы должны иметь понятное состояние.
6. Loading state обязателен.
7. Error state обязателен.
8. Stop/cancel обязателен.
9. Нельзя блокировать UI во время synthesis/model loading.
10. Должны учитываться mobile safe areas / viewport constraints.
11. Должна быть accessibility-разметка: aria-label для кнопок TTS.
12. Keyboard/touch interaction не должны конфликтовать с редактированием таблицы.
13. При длинном тексте не должно быть layout shift, который уводит кнопку управления.
14. Визуальное состояние playing должно быть понятно пользователю.
15. Должен быть UI DoD evidence: скрин/описание состояний idle/loading/playing/error.
```

---

## 19. Риски и blind spots, которые нужно проверить до патчей

Перед реализацией Codex обязан проверить:

```text
1. Есть ли в проекте bundler, который сможет обслуживать WASM/assets.
2. Как сейчас подключаются frontend-модули.
3. Не монолитный ли public/index.html.
4. Можно ли добавить ES modules без поломки.
5. Есть ли CSP/security restrictions.
6. Как в проекте устроены static assets.
7. Как работает приложение на mobile Safari.
8. Есть ли конфликт с существующим AudioContext / speechSynthesis.
9. Есть ли текущий provider badge/provenance model.
10. Есть ли текущий cache.
11. Есть ли тесты, которые нужно расширить.
12. Какой формат сборки используется.
13. Какой реальный путь модели допустим в production.
14. Как избежать огромной загрузки модели при первом открытии страницы.
15. Как отключить фичу через config/feature flag.
```

Если найден риск, не игнорировать. Внести в план и предложить безопасный mitigation.

---

## 20. Feature flags / config

Добавить config:

```javascript
export const TTS_CONFIG = {
  enabled: true,
  provider: "local_neural_tts_piper",
  preferredBackend: "web_wasm",
  allowSystemFallback: true,
  maxChars: 2000,
  cacheMaxMb: 250,
  defaultSpeed: 1.0,
  debugDiagnostics: true
};
```

Если проект использует `.env`, адаптировать к текущей системе.

Фича должна полностью отключаться:

```text
TTS_ENABLED=false
```

или эквивалентом в текущей конфигурации проекта.

При отключении:

```text
1. UI-кнопки TTS не отображаются или disabled.
2. Provider не загружается.
3. Модели не загружаются.
4. Нет ошибок в консоли.
```

---

## 21. План патчей

Перед началом изменения кода составить фактический план после repo audit.

Рекомендуемый план:

### PATCH-00 — Repo audit and implementation plan

```text
Deliverables:
- краткий audit summary;
- список прочитанных docs;
- список точек интеграции;
- список рисков;
- финальный patch plan;
- подтверждение предварительных условий.
```

Код в этом патче не менять, кроме возможного документа с планом.

### PATCH-01 — TTS Core API

```text
Deliverables:
- TTSProvider contract;
- TTSRequest/TTSResult;
- TTSProviderRouter skeleton;
- TTSDiagnostics;
- TTSCacheKey;
- VoiceRegistry skeleton;
- tests for cache key and routing basics.
```

### PATCH-02 — Model manifest and voice registry

```text
Deliverables:
- manifest loading;
- voice registry;
- validation;
- missing model handling;
- tests for manifest validation.
```

### PATCH-03 — Web backend shell

```text
Deliverables:
- WebPiperSherpaBackend;
- WebModelLoader;
- runtime availability check;
- graceful unavailable state;
- no UI integration yet.
```

### PATCH-04 — Web audio renderer

```text
Deliverables:
- WebAudioRenderer;
- play/stop;
- single active playback;
- iOS/Safari user gesture safe design;
- tests where possible.
```

### PATCH-05 — Cache

```text
Deliverables:
- TTSCache abstraction;
- IndexedDB web implementation;
- LRU policy;
- cache hit/miss diagnostics;
- tests for cache key and eviction logic.
```

### PATCH-06 — Hebrew preprocessing

```text
Deliverables:
- TextNormalizer;
- HebrewPreprocessor;
- sentence splitting;
- preprocessingVersion;
- tests with Hebrew + niqqud + punctuation.
```

### PATCH-07 — UI integration

```text
Deliverables:
- TTS button in table;
- loading/playing/error state;
- stop behavior;
- speed slider;
- provider badge;
- no mobile layout regression.
```

### PATCH-08 — Native bridge stub

```text
Deliverables:
- NativeTTSBridge;
- ios/android unavailable stubs;
- router awareness;
- docs for future native integration.
```

### PATCH-09 — Docs, smoke, regression hardening

```text
Deliverables:
- docs/LOCAL_NEURAL_TTS_PIPER.md;
- docs/TTS_PROVIDER_ARCHITECTURE.md or update existing docs;
- smoke checklist;
- regression checklist;
- known limitations.
```

---

## 22. Tests

Добавить тесты по возможности в текущем test framework проекта.

Минимальные тесты:

```text
1. TTS cache key deterministic.
2. Different speed creates different cache key.
3. Different modelVersion creates different cache key.
4. Same normalized text creates same cache key.
5. Hebrew niqqud preserved by preprocessing.
6. HTML stripped by preprocessing.
7. Long Hebrew text split safely.
8. Router selects web_wasm when available.
9. Router falls back when web_wasm unavailable.
10. Voice registry returns default voice by lang.
11. Missing manifest does not crash provider.
12. TTS_ENABLED=false disables provider.
```

Если возможно добавить browser smoke:

```text
1. Button appears.
2. Button enters loading state.
3. Button enters playing state with mock backend.
4. Stop works.
5. Error state shown when backend unavailable.
6. Mobile layout does not break.
```

---

## 23. Hebrew golden smoke phrases

Добавить smoke cases для ручной проверки:

```text
שלום עולם
בָּרוּךְ אַתָּה
העברית היא שפה עתיקה ומתחדשת.
אני רוצה לשמוע את הטקסט הזה בעברית טבעית.
הילדים אהבו במיוחד את הסיפורים הללו שהמורה הקריאה.
```

Также проверить неогласованный и огласованный варианты:

```text
ברוך אתה
בָּרוּךְ אַתָּה
```

Цель: убедиться, что preprocessing не уничтожает niqqud и не ломает Hebrew text.

---

## 24. Regression risk policy

Запрещено:

```text
1. Удалять существующие TTS/niqqud/transliteration механизмы без явного плана миграции.
2. Менять существующий pipeline перевода/огласовки без необходимости.
3. Делать TTS обязательной зависимостью для запуска приложения.
4. Загружать модель автоматически при открытии страницы без feature flag / user action.
5. Блокировать UI во время загрузки модели.
6. Ломать mobile classic mode table layout.
7. Ломать существующее редактирование таблицы.
8. Смешивать TTS code с UI event handlers.
9. Хардкодить пути моделей в UI.
10. Хардкодить конкретные названия Piper-моделей вместо manifest.
```

---

## 25. Performance requirements

Для web backend:

```text
1. UI не блокируется во время model loading.
2. TTS button показывает loading state.
3. Повторный cache hit должен быть заметно быстрее synthesis.
4. При unavailable backend fallback должен срабатывать без зависания.
5. Один активный playback за раз.
6. Stop должен срабатывать быстро.
```

Целевые метрики для diagnostics:

```text
modelLoadMs
synthMs
renderMs
cacheHit
textChars
voiceId
backend
modelVersion
```

Не обещать production-скорость на iPhone Safari до реального benchmark.

---

## 26. Security / safety

Требования:

```text
1. Strip HTML tags from TTS input.
2. Clamp max chars to 2000.
3. Validate lang by allowlist: he, ru, en.
4. Validate speed in range 0.5–2.0.
5. Never execute text as HTML.
6. Do not expose raw cache internals to UI.
7. Do not log full user text in production diagnostics unless debug enabled.
8. Do not fetch remote models silently without explicit product decision.
```

---

## 27. Documentation

Создать или обновить документацию:

```text
docs/LOCAL_NEURAL_TTS_PIPER.md
```

Документ должен описывать:

```text
1. Цель provider-а.
2. Почему provider backend-agnostic.
3. Почему web backend является первым backend, а не финальным mobile runtime.
4. Как потом подключить iOS native backend.
5. Как потом подключить Android native backend.
6. Как работает voice registry.
7. Как работает model manifest.
8. Как работает cache key.
9. Как работает fallback.
10. Known limitations.
11. Smoke checklist.
```

Также добавить короткий раздел в README, если в проекте принято документировать features там.

---

## 28. Definition of Done

Итерация считается завершённой, если выполнено:

```text
1. Codex прочитал актуальную документацию и зафиксировал repo audit summary.
2. Перед кодовыми изменениями составлен план патчей.
3. План актуализировался по мере обнаружения новых деталей.
4. Реализован backend-agnostic `local_neural_tts_piper`.
5. Реализован web backend shell для `web_wasm_sherpa_piper`.
6. UI не зависит напрямую от web backend.
7. Есть Provider Router.
8. Есть Voice Registry.
9. Есть Model Manifest.
10. Есть Cache abstraction.
11. Есть IndexedDB cache или documented fallback, если IndexedDB невозможен.
12. Есть WebAudioRenderer.
13. Есть HebrewPreprocessor.
14. Есть NativeTTSBridge stub.
15. Есть feature flag для полного отключения TTS.
16. Есть fallback при недоступности web backend.
17. Есть provider badge.
18. Есть loading/playing/error UI states.
19. Есть stop behavior.
20. Есть speed slider.
21. Есть tests для core logic.
22. Есть smoke checklist.
23. Не сломан текущий mobile layout.
24. Не сломано редактирование таблицы.
25. Не сломаны текущие niqqud/transliteration flows.
26. Не создан зоопарк провайдеров.
27. Документация обновлена.
28. `git status` чистый после commit.
```

---

## 29. PowerShell smoke commands

После реализации выполнить:

```powershell
cd E:\projects\tts-prototype-android
git status
npm install
npm test
npm run build
```

Если есть dev server:

```powershell
npm run dev
```

Если используется другой script name, использовать фактический script из `package.json`.

После ручного smoke:

```powershell
git status
```

---

## 30. Ручной smoke checklist

Проверить в браузере:

```text
1. Приложение открывается.
2. Таблица отображается.
3. Classic/mobile mode не сломан.
4. Кнопка TTS видна там, где должна быть.
5. Нажатие TTS не ломает страницу.
6. Loading state отображается.
7. Stop работает.
8. При недоступном backend показывается fallback/error без падения.
9. Speed slider сохраняет значение.
10. Provider badge обновляется.
11. Hebrew text с niqqud не портится.
12. Hebrew text без niqqud не ломает pipeline.
13. Повторный запрос использует cache, если cache включён.
14. Консоль браузера не содержит критических ошибок.
15. TTS_ENABLED=false отключает фичу.
```

---

## 31. Commit message

Рекомендуемый commit message:

```text
feat(tts): add portable local neural piper provider architecture
```

Если реализация разбита на несколько коммитов:

```text
docs(tts): add local neural piper implementation plan
feat(tts): add backend-agnostic tts core and voice registry
feat(tts): add web wasm piper backend shell
feat(tts): add web audio playback and cache layer
feat(tts): integrate local neural tts controls into table ui
test(tts): add core provider routing and preprocessing coverage
docs(tts): document portable local neural tts architecture
```

---

## 32. Финальная продуктовая формулировка

Эта итерация должна заложить не временный browser hack, а переносимый premium speech module:

```text
Сейчас:
local_neural_tts_piper → web_wasm backend

Позже:
local_neural_tts_piper → ios_native backend
local_neural_tts_piper → android_native backend
```

Цель — сохранить единый provider, единый voice registry, единый cache key, единый diagnostics model и единый UI contract.

Web-страница является первым runtime, но архитектура должна быть готова к переносу в полноценное мобильное приложение без переписывания всей логики.
