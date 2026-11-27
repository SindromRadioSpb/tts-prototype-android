# Конвейер видео Медиатеки — М4 «Телефон и мелочи» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ссылку на видео можно отправить с телефона через «Поделиться»; ПК сам обновляет yt-dlp, хранит звук 14 дней и повторяет ASR без нового скачивания; владелец видит, когда ПК был на связи и с какой версией yt-dlp.

**Architecture:** Работник получает `maintain()` (уборка папок старше 14 дней, обновление yt-dlp раз в сутки, версия) и в `runOnce` — повторное использование звука прошлой попытки, heartbeat на скачивании, сброс отметки обновления после HTTP 403. Сервер запоминает последний выход ПК (миграция 102) и отдаёт его со списком заданий. Телефон: `share_target` в обоих манифестах PWA → `/mediatheque.html?share_url=…&share_text=…`; тот же адрес годится для «Команд» iPhone (Safari не поддерживает Web Share Target).

**Tech Stack:** Node, sqlite3, `node:test`, PWA manifest, локали ru/en/he.

**Spec:** `docs/superpowers/specs/2026-11-27-mediatheque-video-pipeline-design.md` (§5.3, §5.6, §7 п.4, урок yt-dlp в шапке).

## Global Constraints

- Звук хранится на ПК 14 дней (решение Claude в спеке, одобрено владельцем).
- yt-dlp обновляется сам: раз в сутки и после отказа YouTube с HTTP 403 (урок 2026-11-27). Замер на ПК: `yt-dlp -U` у установки winget работает (`up to date`, код 0); `winget upgrade` без обновления даёт код -1978335189 — не ошибка. Основной путь `-U`, запасной — winget.
- Ссылки — только одиночные видео YouTube (как М1); Shorts — не-цель.
- Строки через локали; lockstep версий; выпуск — один коммит, один пуш, проверки прода до пуша.

## Review Focus

- Папка видео с текущей попыткой младше 14 дней и старыми попытками — удаляются только старые; чужие папки в `--work` (не id видео) не трогаются.
- Обновление yt-dlp зависло или упало — запуск всё равно берёт задания; отметка пишется, чтобы не обновлять каждые 10 минут.
- Звук прошлой попытки недокачан (`.part`) — не используется.
- «Поделиться» без ссылки YouTube в тексте, с текстом вокруг ссылки, не владельцем — понятный ответ, ничего не ставится молча.
- Владелец без входа открывает ссылку «Поделиться» — просьба войти, параметры не теряются молча.

---

### Task 1: Сервер — последний выход ПК

**Files:** Create `migrations/102_media_worker_seen.sql` (+ down); Modify `mediaqueue/mediaQueueRepo.js`, `mediaqueue/mediaQueueRoutes.js`, `tests/helpers/newsDb.cjs`, `tests/mediaDailyPublisher.test.js`; Test `tests/mediaQueueRepo.test.js`, `tests/mediaQueueRoutes.test.js`.

**Interfaces:** `lease(keyId, { ytdlpVersion })` пишет `media_worker_seen(key_id, seen_at, ytdlp_version)`; `workerStatus() → { seen_at, ytdlp_version } | null` (последний); `GET /api/media-queue/jobs` → `{ jobs, worker }`; `POST /worker/lease` принимает `{ ytdlp_version }` (≤40 символов).

- [ ] Тесты: lease без задания всё равно отмечает выход; версия обрезается; список отдаёт `worker`. RED → код → GREEN.

### Task 2: Работник ПК — обновление, хранение звука, heartbeat

**Files:** Modify `mediaqueue/homeWorkerCore.js`, `scripts/media/home-worker.js`; Test `tests/mediaHomeWorker.test.js`.

**Interfaces:** `maintain({ workDir, exec, ytDlp, now, log }) → { ytdlpVersion, updated }`; `pruneAudio(workDir, now) → removed[]`; `findCachedAudio(workDir, videoId, now) → path|null`; `runOnce({ …, ytdlpVersion })`; константы `AUDIO_KEEP_MS = 14 дней`, `UPDATE_EVERY_MS = 24 ч`, файл отметки `<work>/.yt-dlp-update.json`.

- [ ] Тесты: старые попытки удалены, свежие и чужие папки целы; обновление при старой отметке, пропуск при свежей, winget при отказе `-U`; отметка сброшена после 403; звук прошлой попытки скопирован без скачивания, `.part` не берётся; heartbeat шлёт шаги во время скачивания; версия уходит в lease. RED → код → GREEN.

### Task 3: «Поделиться» и строка ПК в интерфейсе

**Files:** Modify `public/manifest.json`, `public/manifest-room.json`, `public/js/mediatheque-video-queue.js`, `public/js/mediatheque-ui.js`, `public/css/mediatheque.css`, локали, версии; Test `tests/mediathequeVideoQueue.test.js`.

**Interfaces:** `sharedLink(searchParams) → { url } | { raw } | null` (ищет первую ссылку на видео YouTube в `share_url`, `share_text`, `share_title`, `url`, `text`); `open(ctx, { prefill })` — поле заполнено, фокус на «В очередь», подсказка «из „Поделиться“»; `workerLineHtml(worker, jobs, { t, esc, now })` — «ПК на связи в HH:MM · yt-dlp X» или «⏸ ПК не выходил на связь с HH:MM — N видео ждут» (25 минут без выхода при видео в очереди).

- [ ] Тесты разметки и разбора; живая проверка в браузере (телефон 390 px, ссылка «Поделиться»). RED → код → GREEN.

### Task 4: Выпуск

- [ ] Полный `npm test`, самопроверка ветки, один коммит, проверки прода, пуш, проверка на проде (миграция 102, манифест с `share_target`); на ПК — запуск работника вручную: уборка, обновление, версия на сайте.
