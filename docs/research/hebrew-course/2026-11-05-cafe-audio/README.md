# Озвучка урока «Кафе»: Google Cloud TTS, кандидаты

Статус: **владелец прослушал 2026-11-05 по листу `listen.html`: «отличное качество»** (рекомендованный набор WaveNet C/D с огласовками). Проверка носителем ударений не проводилась. Блокировка в исходном уроке пока сохранена — снять при переносе урока в LinguistPro.

- `bake-cafe-audio.js` — синтез по `listening-script-manifest.json`. Учётные данные берутся только из пути `GOOGLE_APPLICATION_CREDENTIALS` в `.env` основной копии; ключ не печатается. Запуск: `node bake-cafe-audio.js "<голос_сотрудника>:<голос_посетителя>,…" "plain,niqqud"`.
- `asr-check.py` — локальная сверка моделью `ivrit-ai/whisper-large-v3-turbo-ct2` (папка Компаньона), CPU, без отправки аудио наружу. Нужен Python с `faster-whisper`; в этой сессии использовалось временное окружение.
- `bake-log.json` — что, каким голосом и с каким текстом синтезировано, SHA-256 каждого клипа.
- `asr-check.json` — распознанный текст, длительность, тишина в начале и в конце.

Сами MP3 (64 клипа + склеенный `a1.mp3`) лежат в репозитории в неотслеживаемой папке `data/`:
`data/course/ulpan/audio-google-tts-2026-11-05/`.
Там же лист прослушивания `listen.html`. Рекомендованный набор: `Wavenet-C__Wavenet-D/niqqud/`.

## Предлагаемые метаданные (применить в `audio-lessons.json` только после прослушивания)

```json
{
  "status": "blocked",
  "release_status": "awaiting_human_listening_review",
  "notice": "Учебная синтетическая речь Google Cloud Text-to-Speech (WaveNet he-IL-Wavenet-C — сотрудник, he-IL-Wavenet-D — посетитель), ввод с огласовками. Не запись носителя.",
  "source": {"engine": "Google Cloud Text-to-Speech v1", "voices": ["he-IL-Wavenet-C", "he-IL-Wavenet-D"], "input": "niqqud", "encoding": "MP3 24 kHz", "generated": "2026-11-05"},
  "verification": {"local_asr": "ivrit-ai whisper-large-v3-turbo: 16/16 exact", "human_listening": "owner, 2026-11-05: excellent"}
}
```

`status` переводить в `ready` только после того, как прослушивание принято.
