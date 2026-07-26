# fixtures/ingest/audio — W2-S4 live-smoke фикстура

- `he-sample.mp3` — ~18 сек ивритской речи, 146304 байт (143 КБ).
  **Как построена (2026-07-26, temporary build — нет GCP TTS ключа в локальном окружении):**
  склеена (`Buffer.concat`) из 3 существующих Hebrew TTS-клипов локального тестового бандла
  `E:\projects\tts-prototype-android\.external\bundle2\audio\` (сам каталог НЕ в git, локальный
  только):
  - `fb47cabd1953597cc2f431aaf85dc49d488006c4238f83f757f779f3ea468f16.mp3` (49920 байт)
  - `c24d863020ce91a6409f98910eef94c0dce604330ca0a1089fd91116eeb8e8c2.mp3` (48768 байт)
  - `10aa18f2cdecd5905aedb40b0a20622c598dfb36ab31a3e132012ae570071fef.mp3` (47616 байт)

  Все три — MP3-чанки одного и того же GCP TTS-энкодера (одинаковый MPEG-заголовок
  `FF F3 84 C4`, констант-битрейт), поэтому простая конкатенация даёт валидный
  воспроизводимый MP3 (тот же приём, что `scripts/premium/lib/ttsBake.js` использует для
  склейки чанков одной синтезируемой фразы). Итоговый файл провалидирован `ffprobe`
  (duration=18.288s, валиден).

  Артефакт КОММИТИТСЯ (мал, детерминированная роль — вход для live-smoke, не для морфологии/R1).

- **Канонический регенератор — `make-he-sample.js`** (написан ПОЛНОСТЬЮ по спецификации, ещё
  НЕ запускался — нет GCP TTS ключа в окружении на момент создания фикстуры). Когда ключ будет
  доступен, перегенерировать канонически:
  ```
  node scripts/premium/fixtures/ingest/audio/make-he-sample.js --key <GCP_TTS_KEY>
  ```
  (или env `GCP_TTS_SMOKE_KEY`, НЕ коммитить). Синтезирует одну фразу из 3 предложений
  (~8 сек, he-IL-Wavenet-B) через `synthesizeMp3`/`defaultProfile` из
  `scripts/premium/lib/ttsBake.js` и перезаписывает `he-sample.mp3` каноническим файлом —
  после этого обновить byte-size/duration в этом README.

- Потребители: `scripts/premium/ingest-audio-live-smoke.js`, `ingest-audio-cors-check.js`.
