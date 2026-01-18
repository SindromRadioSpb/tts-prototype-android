# Local Overrides (Windows)

## Среда
- OS: Windows 10/11
- Repo path: C:\Users\Win10_Game_OS\tts-prototype-android

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
