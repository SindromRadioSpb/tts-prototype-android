# TTS Model Staging

`local_neural_tts_piper` использует self-hosted runtime/model assets. Тяжёлые бинарники по умолчанию в репозиторий не коммитятся.

## Runtime staging

Ожидаемый каталог:

```text
public/tts/runtime/sherpa-onnx/
  sherpa-onnx.js
  sherpa-onnx-wasm-main.js
  sherpa-onnx-wasm-main.wasm
  sherpa-onnx-wasm-main.data
```

Это должны быть build outputs официального `sherpa-onnx` WebAssembly TTS runtime.

## Model staging

Ожидаемые файлы:

```text
public/tts/models/he/model.onnx
public/tts/models/he/model.onnx.json
public/tts/models/ru/model.onnx
public/tts/models/ru/model.onnx.json
public/tts/models/en/model.onnx
public/tts/models/en/model.onnx.json
```

## Validation

```powershell
node scripts/check_tts_models.js
node scripts/update_tts_model_checksums.js
```

Если ассеты отсутствуют, скрипты завершаются с ошибкой и печатают `MISSING_MODEL` / `MISSING_CONFIG`.

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
