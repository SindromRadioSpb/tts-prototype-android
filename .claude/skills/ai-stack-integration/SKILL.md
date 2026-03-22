---
name: ai-stack-integration
description: "Интеграция с локальным ML-стеком ai-stack: замена Google Cloud TTS/Gemini на локальные модели (XTTS, Phi-4, Whisper, NLLB)."
---

# ai-stack Integration Contract

## Scope / Trigger
Skill обязателен, если:
- Добавляется или изменяется TTS/STT/LLM/Translation endpoint, который должен работать офлайн
- Появляется параметр `provider: "local"` или `USE_LOCAL_AI=1`
- Затрагиваются файлы, содержащие: "ai-stack", "local_tts", "local_llm", "whisper", "xtts"

## ai-stack Overview
- Путь: `E:\projects\ai-stack`
- Venv: `D:\virtualenvs\ai-stack` (Python 3.11, torch 2.10+cu128)
- Модели: `F:\datasets_models\`
- Документация: `E:\projects\ai-stack\docs\`
- API: библиотека (прямой import) или FastAPI wrapper

## Integration Architecture

### Вариант A: FastAPI microservice (рекомендуемый)
```
tts-prototype-android (Node.js)
    │ HTTP
    ▼
ai-stack FastAPI (Python, localhost:8100)
    │
    ▼
Local models (CUDA / CPU)
```

Плюсы: изоляция процессов, разные рантаймы, нет конфликтов зависимостей.
Минусы: latency HTTP overhead (~50ms), нужно запускать два процесса.

### Вариант B: Subprocess call
```
server.js → child_process.exec("D:\\virtualenvs\\ai-stack\\Scripts\\python.exe script.py")
```

Плюсы: проще, не нужен отдельный сервер.
Минусы: startup time модели на каждый вызов (~3-5с), нет model reuse.

**Решение: Вариант A** — FastAPI microservice. Модели остаются загруженными между запросами.

## Mapping: Cloud → Local

| Текущий Cloud API | ai-stack модуль | Endpoint (будущий) |
|-------------------|----------------|-------------------|
| Google Cloud TTS (he) | mms-tts-heb (0.08 GB) | `POST /api/local/tts` |
| Google Cloud TTS (ru/en) | XTTS v2 (4 GB) | `POST /api/local/tts` |
| Google Gemini (translation) | NLLB-200 (1.5 GB) | `POST /api/local/translate` |
| Google Gemini (segmentation) | Phi-4-mini (3 GB) | `POST /api/local/llm` |
| — (new) | Whisper STT | `POST /api/local/stt` |
| — (new) | Embeddings | `POST /api/local/embed` |

## Non-negotiable Rules
1) **Dual-mode:** Cloud и Local должны работать параллельно. Переключение через env var `TTS_PROVIDER=cloud|local`.
2) **API-совместимость:** Local endpoints возвращают тот же формат, что и текущий код ожидает от Cloud.
3) **Graceful fallback:** если ai-stack недоступен (сервер не запущен) — fallback на Cloud без crash.
4) **VRAM awareness:** ai-stack управляет VRAM сам. Node.js не должен вызывать несколько тяжёлых моделей одновременно.
5) **Лицензии:** mms-tts-heb, XTTS v2, NLLB — non-commercial only. Если проект станет коммерческим — нужна замена.

## Required Deliverables
1) FastAPI wrapper в `E:\projects\ai-stack\` (отдельный модуль)
2) env var `AI_STACK_URL=http://localhost:8100` в `.env.example`
3) Обновить `server.js` — conditional routing cloud/local
4) Smoke test: local TTS → audio file → same format as Cloud TTS

## Verification
1) ai-stack FastAPI запускается: `curl http://localhost:8100/health`
2) TTS endpoint возвращает WAV/MP3
3) Fallback работает: остановить ai-stack → Cloud TTS подхватывает
4) Smoke-check проекта проходит в обоих режимах

## VRAM Pipeline для учебного сценария
```
Ученик вводит текст
    → Gemini/Phi-4 сегментирует (3 GB)  → unload
    → NLLB переводит (1.5 GB)           → unload
    → XTTS/mms-tts озвучивает (0.08-4 GB) → unload
    → WAV возвращается клиенту
```
Пик: 4 GB (XTTS). Последовательно, не параллельно.
