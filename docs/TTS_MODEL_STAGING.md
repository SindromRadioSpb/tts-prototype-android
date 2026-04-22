# TTS Model Staging

`local_neural_tts_piper` теперь работает с self-hosted browser assets, staged прямо в `public/tts/...`.

## Что реально staged сейчас

### Runtime

```text
public/tts/runtime/sherpa-onnx/
  sherpa-onnx-tts.js
  sherpa-onnx-tts.worker.js
  sherpa-onnx-wasm-main-tts.js
  sherpa-onnx-wasm-main-tts.wasm
  sherpa-onnx-wasm-main-tts.data
```

Источник:
- `k2-fsa/sherpa-onnx`
- release bundle `sherpa-onnx-wasm-simd-1.12.36-vits-piper-en_US-libritts_r-medium.tar.bz2`

Важно:
- текущий browser runtime использует `sherpa-onnx-wasm-main-tts.data`
- внутри `.data` уже упакованы runtime FS assets для English bundle
- staged `model.onnx` / `model.onnx.json` остаются source-of-truth для manifest/checksum/tooling

### Model assets

```text
public/tts/models/en/
  manifest.json
  model.onnx
  model.onnx.json
  tokens.txt
  espeak-ng-data/
  espeak-ng-data.index.json
```

Источник:
- `k2-fsa/sherpa-onnx` `tts-models`
- release bundle `vits-piper-en_US-libritts_r-medium.tar.bz2`

## Что проходит сейчас

- `en`:
  - staged
  - manifest valid
  - checksum fields filled
  - browser smoke passed
  - actual backend: `web_wasm`

- `he`:
  - manifest exists
  - model assets not staged
  - expected state: `model_missing`

- `ru`:
  - manifest exists
  - model assets not staged
  - expected state: `model_missing`

## Validation

Точечная проверка staged English assets:

```powershell
node scripts/check_tts_models.js --lang en
node scripts/update_tts_model_checksums.js --lang en
node scripts/check_tts_models.js --lang en
```

Полная проверка всех manifests сейчас будет красной, пока `he` и `ru` намеренно не staged.

## Повторный staging

```powershell
npm run tts:stage:assets
```

Этот скрипт:
- скачивает официальный browser runtime bundle
- скачивает matching English Piper model bundle
- раскладывает runtime files в `public/tts/runtime/sherpa-onnx/`
- раскладывает model/tokens/espeak files в `public/tts/models/en/`
- генерирует `espeak-ng-data.index.json`

## Browser smoke

```powershell
npm run test:tts-browser-smoke
```

Smoke покрывает:
- успешный `web_wasm` synthesis для English
- repeat request -> `cache hit`
- `WebAudioRenderer` playback path + controlled stop
- `TTS_WEB_WASM_ENABLED=false` -> `system_fallback`
- `TTS_WEB_WASM_ENABLED=false` + `TTS_ALLOW_SYSTEM_FALLBACK=false` -> unavailable state
- mobile-width viewport sanity check for main TTS button

## Feature flags

```text
TTS_ENABLED=true
TTS_WEB_WASM_ENABLED=true
TTS_WEB_WASM_RUNTIME_PATH=/tts/runtime/sherpa-onnx
TTS_PRELOAD=false
TTS_MODEL_STAGING_REQUIRED=true
TTS_ALLOW_SYSTEM_FALLBACK=true
TTS_CACHE_ENABLED=true
TTS_CACHE_MAX_MB=250
```

## Known limitations

- Hebrew browser model пока не staged, поэтому Hebrew smoke через `web_wasm` не подтверждён.
- Russian browser model пока не staged.
- Mobile smoke сейчас automated only через responsive viewport, без реального iPhone/Android device pass.
- Browser runtime сейчас привязан к staged English `libritts_r-medium` bundle.
