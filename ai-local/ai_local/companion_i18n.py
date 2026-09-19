"""Companion window strings in the two languages of the invite beta.

The window was English-only while its guides shipped in ru/en/he, so the person running it
had to read the one surface that decides whether media stays on this computer in a language
they had not chosen. The language is a stored setting, not a guess from the OS locale: an
invite beta is used on machines whose system language says little about its reader.

Every string is defined for both languages; :func:`translate` returns the key itself if one
is ever missing, which is visible in a screenshot rather than silently falling back to
English and looking translated.
"""

from __future__ import annotations

LANGUAGES = ("en", "ru")

LANGUAGE_NAMES = {"en": "English", "ru": "Русский"}

STRINGS: dict[str, dict[str, str]] = {
    "app.title": {
        "en": "LinguistPro Local AI Companion",
        "ru": "LinguistPro Local AI Companion",
    },
    "app.heading": {"en": "Local Hebrew AI", "ru": "Локальный ИИ для иврита"},
    "app.subtitle": {
        "en": "Invite-only beta · Windows 11 · NVIDIA/CUDA · Chrome",
        "ru": "Бета по приглашению · Windows 11 · NVIDIA/CUDA · Chrome",
    },
    "app.privacy": {
        "en": "MEDIA / TEXT  →  THIS COMPUTER  →  127.0.0.1     ☁ cloud fallback: off",
        "ru": "МЕДИА / ТЕКСТ  →  ЭТОТ КОМПЬЮТЕР  →  127.0.0.1     ☁ облачный запас: выкл",
    },
    "app.footer": {
        "en": "Companion {version} · model revision {revision}… · Apache-2.0 · unsigned internal build",
        "ru": "Companion {version} · ревизия модели {revision}… · Apache-2.0 · внутренняя сборка без подписи",
    },
    "row.companion": {"en": "Companion", "ru": "Companion"},
    "row.device": {"en": "Device", "ru": "Устройство"},
    "row.asrModel": {"en": "ASR model", "ru": "Модель распознавания"},
    "row.mtModel": {"en": "MADLAD model", "ru": "Модель MADLAD"},
    "status.checkingCompanion": {"en": "Checking Companion…", "ru": "Проверяем Companion…"},
    "status.checkingDevice": {
        "en": "Checking Windows/NVIDIA/CUDA…",
        "ru": "Проверяем Windows/NVIDIA/CUDA…",
    },
    "status.checkingModel": {"en": "Checking pinned model…", "ru": "Проверяем закреплённую модель…"},
    "status.checkingMtModel": {
        "en": "Checking pinned MADLAD model…",
        "ru": "Проверяем закреплённую модель MADLAD…",
    },
    "status.deviceReady": {"en": "Ready", "ru": "Готово"},
    "status.deviceAttention": {"en": "Needs attention: {codes}", "ru": "Требует внимания: {codes}"},
    "status.modelVerified": {"en": "Verified and ready", "ru": "Проверена и готова"},
    "status.modelNot": {"en": "{state}: {reason}", "ru": "{state}: {reason}"},
    "status.notInstalled": {"en": "not installed", "ru": "не установлена"},
    "pairing.frame": {
        "en": "Connect LinguistPro in Chrome",
        "ru": "Подключите LinguistPro в Chrome",
    },
    "pairing.steps": {
        "en": "1. Wait for Companion: RUNNING   2. Copy the token   3. Paste it in Local ASR or MADLAD settings",
        "ru": "1. Дождитесь Companion: RUNNING   2. Скопируйте токен   3. Вставьте его в настройках Local ASR или MADLAD",
    },
    "pairing.copy": {"en": "Copy token for browser", "ru": "Скопировать токен для браузера"},
    "pairing.idle": {
        "en": "The token is created automatically. Start the service, then copy it here.",
        "ru": "Токен создаётся автоматически. Запустите службу и скопируйте его здесь.",
    },
    "pairing.copied": {
        "en": "Copied. Return to LinguistPro, paste it, and click Connect.",
        "ru": "Скопировано. Вернитесь в LinguistPro, вставьте токен и нажмите «Подключить».",
    },
    "pairing.copiedStatus": {
        "en": "RUNNING · pairing token copied for this browser session",
        "ru": "RUNNING · токен сопряжения скопирован для этой сессии браузера",
    },
    "service.frame": {"en": "Service", "ru": "Служба"},
    "service.start": {"en": "Start", "ru": "Запустить"},
    "service.stop": {"en": "Stop", "ru": "Остановить"},
    "service.restart": {"en": "Restart", "ru": "Перезапустить"},
    "model.frame": {"en": "Model and local data", "ru": "Модель и локальные данные"},
    "model.install": {"en": "Install pinned model…", "ru": "Установить закреплённую модель…"},
    "model.cancel": {"en": "Cancel download", "ru": "Отменить загрузку"},
    "model.delete": {"en": "Delete model…", "ru": "Удалить модель…"},
    "model.deleteJobs": {"en": "Delete jobs…", "ru": "Удалить задания…"},
    "mt.frame": {"en": "MADLAD translation model", "ru": "Модель перевода MADLAD"},
    "mt.install": {"en": "Install exact MADLAD…", "ru": "Установить точную MADLAD…"},
    "mt.cancel": {"en": "Cancel MT install", "ru": "Отменить установку MT"},
    "mt.delete": {"en": "Delete MADLAD…", "ru": "Удалить MADLAD…"},
    "settings.frame": {"en": "Settings", "ru": "Настройки"},
    "settings.language": {"en": "Language", "ru": "Язык"},
    "settings.encoder": {"en": "Video conversion", "ru": "Конвертация видео"},
    "settings.encoderCpu": {
        "en": "Processor (libx264) — the same file on any computer",
        "ru": "Процессор (libx264) — одинаковый файл на любом компьютере",
    },
    "settings.encoderGpu": {
        "en": "NVIDIA graphics card (h264_nvenc) — faster, somewhat larger file",
        "ru": "Видеокарта NVIDIA (h264_nvenc) — быстрее, файл немного больше",
    },
    "settings.encoderProbing": {
        "en": "Checking whether this computer can encode on the graphics card…",
        "ru": "Проверяем, может ли этот компьютер кодировать на видеокарте…",
    },
    "settings.encoderAvailable": {
        "en": "Checked: the graphics card encodes here (one test frame).",
        "ru": "Проверено: видеокарта кодирует на этом компьютере (один тестовый кадр).",
    },
    "settings.encoderUnavailable": {
        "en": "Checked: the graphics card cannot encode here. Conversion will use the processor.",
        "ru": "Проверено: кодировать на видеокарте не удалось. Конвертация пойдёт на процессоре.",
    },
    "settings.encoderHint": {
        "en": "The choice is stored for this Windows account and applies to running conversions "
              "without a restart. Studio can still pick the other one for a single file.",
        "ru": "Выбор сохраняется для этой учётной записи Windows и действует без перезапуска. "
              "Для отдельного файла Студия может выбрать другой вариант.",
    },
    "settings.saveFailed": {
        "en": "The setting could not be saved: {error}",
        "ru": "Не удалось сохранить настройку: {error}",
    },
    "support.diagnostics": {
        "en": "Export redacted diagnostics…",
        "ru": "Выгрузить обезличенную диагностику…",
    },
    "support.help": {"en": "Help / Справка", "ru": "Справка / Help"},
    "support.helpOpened": {
        "en": "Help opened in Notepad. English and Hebrew guides are bundled too.",
        "ru": "Справка открыта в «Блокноте». В комплекте также английское и ивритское руководства.",
    },
    "support.diagnosticsDone": {
        "en": "Redacted diagnostics exported; no media, transcript, filename, or token included.",
        "ru": "Диагностика выгружена: без медиа, расшифровок, имён файлов и токенов.",
    },
    "dialog.error": {"en": "Local AI Companion", "ru": "Local AI Companion"},
    "dialog.installAsrTitle": {
        "en": "Install pinned Local ASR model",
        "ru": "Установить закреплённую модель Local ASR",
    },
    "dialog.installAsrBody": {
        "en": "Download about 1.62 GB to this Windows account?\n\n"
              "ivrit-ai/whisper-large-v3-turbo-ct2\n{revision}\nLicense: Apache-2.0\n\n"
              "The revision and every runtime SHA-256 will be verified before activation.",
        "ru": "Скачать около 1,62 ГБ в эту учётную запись Windows?\n\n"
              "ivrit-ai/whisper-large-v3-turbo-ct2\n{revision}\nЛицензия: Apache-2.0\n\n"
              "Ревизия и все SHA-256 файлов будут проверены до включения.",
    },
    "dialog.deleteAsrTitle": {"en": "Delete Local ASR model", "ru": "Удалить модель Local ASR"},
    "dialog.deleteAsrBody": {
        "en": "Delete the managed pinned model from this Windows account?",
        "ru": "Удалить закреплённую модель из этой учётной записи Windows?",
    },
    "dialog.deleteJobsTitle": {"en": "Delete Local ASR jobs", "ru": "Удалить задания Local ASR"},
    "dialog.deleteJobsBody": {
        "en": "Delete all terminal/recoverable local media jobs and outputs?",
        "ru": "Удалить все завершённые и восстановимые локальные задания и их результаты?",
    },
    "dialog.installMtTitle": {"en": "Install pinned MADLAD model", "ru": "Установить закреплённую MADLAD"},
    "dialog.installMtBody": {
        "en": "Download the exact upstream revision and reproduce the 10.74 GB verified CT2 artifact?\n\n"
              "Up to 60 GB free disk and 8 GB NVIDIA VRAM are required.\n"
              "google/madlad400-10b-mt\n{revision}\nLicense: Apache-2.0\n\n"
              "Text stays on this computer. Output is a correctable machine draft with "
              "LIMITED EVIDENCE / NO BILINGUAL HUMAN VALIDATION.",
        "ru": "Скачать точную исходную ревизию и воспроизвести проверенный артефакт CT2 на 10,74 ГБ?\n\n"
              "Потребуется до 60 ГБ свободного диска и 8 ГБ видеопамяти NVIDIA.\n"
              "google/madlad400-10b-mt\n{revision}\nЛицензия: Apache-2.0\n\n"
              "Текст остаётся на этом компьютере. Результат — исправляемый машинный черновик: "
              "ОГРАНИЧЕННЫЕ СВИДЕТЕЛЬСТВА / БЕЗ ДВУЯЗЫЧНОЙ ЧЕЛОВЕЧЕСКОЙ ПРОВЕРКИ.",
    },
    "dialog.deleteMtTitle": {"en": "Delete MADLAD model", "ru": "Удалить модель MADLAD"},
    "dialog.deleteMtBody": {
        "en": "Delete the managed MADLAD model and resumable download cache?",
        "ru": "Удалить управляемую модель MADLAD и кэш возобновляемой загрузки?",
    },
    "dialog.diagnosticsTitle": {
        "en": "Export redacted diagnostics",
        "ru": "Выгрузить обезличенную диагностику",
    },
    "dialog.zipFilter": {"en": "ZIP archive", "ru": "Архив ZIP"},
}


def translate(language: str, key: str, **fields: object) -> str:
    entry = STRINGS.get(key)
    if not entry:
        return key
    text = entry.get(language) or entry.get("en") or key
    if not fields:
        return text
    try:
        return text.format(**fields)
    except (KeyError, IndexError):
        return text
