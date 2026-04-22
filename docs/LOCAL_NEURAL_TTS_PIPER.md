# Local Neural TTS Piper

## Цель
`local_neural_tts_piper` — единый переносимый provider для локального neural TTS.  
В этой итерации он подключён в web-runtime как:

- provider: `local_neural_tts_piper`
- backend: `web_wasm_sherpa_piper`
- fallback: `system_fallback`

Архитектура намеренно не создаёт отдельные product-provider'ы вроде `web_piper` или `android_piper`.

## Почему provider backend-agnostic
- UI не должен знать, какой runtime реально синтезирует речь.
- Voice registry, cache key, diagnostics и preprocessing должны жить выше конкретного backend.
- Будущие iOS/Android backend-адаптеры должны подключаться в router, а не в обработчики кнопок.

Текущая цепочка:

```text
UI button
  -> PortableTtsProvider
  -> TTSProviderRouter
  -> web_wasm | system_fallback
  -> playback
  -> diagnostics
```

## Текущая реализация
- `public/tts/core.js` — config, contracts, router, voice registry, manifest loader, cache key, Hebrew preprocessor.
- `public/tts/backends.js` — `WebPiperSherpaBackend`, `WebAudioRenderer`, `IndexedDbAudioCache`, `SystemSpeechFallbackBackend`.
- `public/tts/models/*/manifest.json` — source of truth по моделям.

## Web backend в этой итерации
`web_wasm_sherpa_piper` теперь умеет честно различать runtime/model readiness и работать через staging contract.

Что уже есть:
- backend selection
- manifest loading
- cache contract
- diagnostics model
- renderer contract
- runtime adapter scaffold
- runtime/model status model
- manifest/model validation scripts

Что пока не готово:
- runtime/model binaries по умолчанию не застейджены в репозитории
- без staged assets backend честно уходит в `runtime_missing` / `model_missing`

Поведение до подключения runtime:
- router предпочитает `web_wasm`
- если runtime/model unavailable, происходит explicit fallback в `system_fallback`, только если он разрешён
- UI не падает и показывает фактический backend/status badge

## Voice registry
Единые voice IDs:

- `he-default`
- `ru-default`
- `en-default`

UI не должен хардкодить конкретные имена Piper-моделей.

## Model manifest
Manifest хранит:
- `modelPath`
- `configPath`
- `modelVersion`
- `license`
- `platforms`
- `checksumSha256`
- `configChecksumSha256`

Если checksum-поля пустые, diagnostics помечает их как `missing`.

## Cache key
Используется:

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
- backend не включён в key
- `modelVersion` обязателен
- `preprocessingVersion` обязателен

## Hebrew preprocessing
`HebrewPreprocessor`:
- удаляет HTML
- нормализует пробелы
- сохраняет niqqud
- обрезает текст по `maxChars`
- делит длинный текст на chunks по границам предложений

Текущая версия preprocessing:
- `hebrew-preprocess-v1`

## Future native integration
Зарезервированы backend ids:
- `ios_native`
- `android_native`
- `desktop_sidecar`

Текущий stub:
- `NativeTTSBridge` в core возвращает `unavailable`

Для будущего native runtime нужно реализовать backend с тем же контрактом, без переписывания UI.

## Known limitations
- Реальный synthesis требует staged `sherpa-onnx` runtime assets и staged model/config files.
- Browser fallback зависит от `speechSynthesis`.
- Existing legacy Google TTS/server code остаётся в репозитории как старый path и не удаляется этой итерацией.
- `npm test` уже имеет baseline-failures вне нового TTS слоя.
- Hebrew voice quality пока следует считать `baseline`, а не premium.

## Smoke checklist
- `TTS_ENABLED=false` скрывает/disable TTS UI и не запускает provider.
- `TTS_WEB_WASM_ENABLED=false` отключает только `web_wasm` и оставляет `system_fallback`, если он разрешён.
- При доступном `speechSynthesis` row/main TTS отрабатывает через `system_fallback`.
- Provider badge показывает реальный status: `runtime missing`, `model missing`, `ready`, `System fallback`, `unavailable`.
- Диагностика в debug mode показывает preferred/actual backend, runtime/model status, cache, checksums, fallback reason.
- Hebrew phrases с niqqud не теряют огласовки.

## Model staging
См. [TTS_MODEL_STAGING.md](/E:/projects/tts-prototype-android/docs/TTS_MODEL_STAGING.md).
