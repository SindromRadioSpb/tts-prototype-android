# Local Overrides (Windows)

## Среда
- OS: Windows 11 Enterprise 10.0.26200
- Repo path: E:\projects\tts-prototype-android
- Node.js: via system PATH
- Python: D:\virtualenvs\ (для ai-stack интеграции)

## Рекомендации запуска
1) Предпочтительно запускать smoke-check через PowerShell:
   scripts\smoke-check.ps1
2) Для bash-варианта используйте WSL:
   chmod +x scripts/smoke-check.sh && ./scripts/smoke-check.sh

## Локальные данные
- Рабочая база SQLite: data/app.db (локальный артефакт)
- Аудио и кэши: audio/, audio-cache/, gemini-cache/ (локальные артефакты)

В git эти папки должны быть исключены. Если они уже закоммичены, используйте:
- git rm -r --cached node_modules audio-cache gemini-cache data/app.db
и затем добавьте правила в .gitignore.

## ai-stack (локальный ML-стек)
- Путь: E:\projects\ai-stack
- Venv: D:\virtualenvs\ai-stack
- Модели: F:\datasets_models
- Интеграция: через subprocess или HTTP (FastAPI wrapper)
- Документация: E:\projects\ai-stack\docs\
