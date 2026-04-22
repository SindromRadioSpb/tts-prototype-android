# Local Neural TTS Piper

## Цель

`local_neural_tts_piper` — переносимый provider для локального neural TTS, который держит единый contract для:

- `web_wasm`
- `system_fallback`
- будущих `ios_native` / `android_native`

UI не должен знать о конкретном runtime. Он работает через provider/router/diagnostics, а не через runtime-specific кнопки.

## Текущая цепочка

```text
UI button
  -> PortableTtsProvider
  -> TTSProviderRouter
  -> WebPiperSherpaBackend
  -> sherpa-onnx worker runtime
  -> staged browser bundle assets
  -> WebAudioRenderer
  -> playback
```

Fallback path:

```text
web_wasm unavailable or model_missing
  -> system_fallback, if allowed
```

Если fallback запрещён:

```text
web_wasm unavailable
  -> unavailable/error state
  -> no UI crash
```

## Что реализовано сейчас

- `public/tts/core.js`
  - provider config
  - voice registry
  - manifest loader
  - router
  - Hebrew preprocessing
  - post-failure fallback from `web_wasm` to `system_fallback`

- `public/tts/backends.js`
  - `WebPiperSherpaBackend`
  - `WebAudioRenderer`
  - `IndexedDbAudioCache`
  - `SystemSpeechFallbackBackend`

- `public/tts/runtime/sherpaOnnxAdapter.js`
  - real worker-based runtime adapter
  - runtime probing for staged browser assets
  - model/config/tokens/data-dir readiness checks

- `public/tts/runtime/sherpa-onnx/*`
  - staged self-hosted browser runtime files

- `public/tts/models/en/*`
  - staged English Piper assets

## Product status

Local providers remain in the codebase, but are disabled by current product policy:

- `hebrew_phonikud_piper` is kept for future experiments, but disabled because current Hebrew voice quality is too robotic for product use
- `local_neural_tts_piper` is kept for future experiments, but disabled because English local synthesis is not relevant to current learning scenarios
- `system_fallback` remains available only as a clearly marked low-quality emergency path

### Verified working

- `en-default`
  - runtime: `sherpa-onnx`
  - backend: `web_wasm`
  - model: `piper-en_US-libritts_r-medium-1`
  - browser smoke: passed

### Not staged in browser `web_wasm`

- `he-default`
  - browser `web_wasm`: not staged
  - product default Hebrew local path now uses sidecar provider `hebrew_phonikud_piper`
  - browser manifest state remains `model_missing`

- `ru-default`
  - product default: online TTS
  - expected local state: `model_missing`

## Diagnostics model

Диагностика показывает:

- preferred backend
- actual backend
- runtime status
- model status
- synthesis status
- cache hit/miss
- model/config/tokens/data paths
- model version
- checksum presence
- `modelLoadMs`
- `synthMs`
- `renderMs`
- fallback reason

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

## Hebrew preprocessing

`HebrewPreprocessor`:

- удаляет HTML
- нормализует пробелы
- сохраняет niqqud
- режет длинный текст по `maxChars`
- делит текст по sentence boundaries

Текущая версия:

```text
hebrew-preprocess-v1
```

## Smoke status

Подтверждено automated browser smoke:

- `web_wasm` synthesis работает
- repeated request даёт `cache hit`
- playback path проходит через `WebAudioRenderer`
- controlled stop работает
- `TTS_WEB_WASM_ENABLED=false` даёт `system_fallback`
- `TTS_ALLOW_SYSTEM_FALLBACK=false` даёт unavailable state без краша
- mobile-width viewport не ломает main TTS button
- Online TTS remains the default provider on desktop and mobile

Не подтверждено в этой итерации:

- реальный Hebrew `web_wasm` voice
- реальный Russian `web_wasm` voice
- manual device smoke на iPhone/Android

## Known limitations

- текущий browser runtime использует staged English `.data` bundle от `sherpa-onnx`
- Hebrew voice quality в browser runtime пока `unknown`, не `premium`
- Hebrew local Phonikud/Piper path remains available only as a disabled code path for future experiments
- Russian browser runtime пока не staged
- full `npm test` остаётся красным только из-за baseline-проблем вне нового TTS слоя

## Команды

Validation:

```powershell
node scripts/check_tts_models.js --lang en
node scripts/update_tts_model_checksums.js --lang en
```

Browser smoke:

```powershell
npm run test:tts-browser-smoke
```

Повторный staging:

```powershell
npm run tts:stage:assets
```
