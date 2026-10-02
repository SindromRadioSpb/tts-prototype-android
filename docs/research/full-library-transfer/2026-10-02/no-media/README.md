# Выбор исходного медиа и MP3 озвучки

2026-10-02. Baseline `db42438c` / production 3.11.718. Подготовлена 3.11.719.

По owner screenshot отсутствовала общая команда для архива без исходных медиа. Добавлена «Исключить всё медиа», симметричная «Включить всё медиа»; отдельные флажки и проверенный YouTube bulk сохраняются.

По следующему owner уточнению добавлен независимый флажок «Включить MP3 озвучки TTS» (включён по умолчанию). Информационная кнопка с `aria-expanded` объясняет сохранённый синтез речи, отсутствие повторной генерации при наличии MP3, независимый выбор исходных файлов и поведение при исключении. Разметка, canonical history, audio asset identities и voice bindings сохраняются при любом выборе.

Manifest additive fields: `audio_included` и `excluded_audio` с asset keys и `reason:excluded_by_user`. Явное исключение не превращается в missing audio и не устанавливает `partial_backup`. Restore report показывает выбранные исключения; экспорт без TTS пропускает получение/cache lookup MP3 и не запускает провайдеры. Existing v1 archives без новых полей читаются прежним способом. Saved-export receipt учитывает реальный audio choice.

## Проверки

- core и shell integrity: 14/14 PASS;
- i18n: 233/233 PASS;
- [Browser roundtrip](local/browser-evidence.json): UI exclude-all → 0 media payloads, но 2 voice keys / 1 MP3 payload; include-all reverses choice; второй UI export без TTS → 0 audio/media payloads и 2 explicit audio exclusions, missing=0/partial=false;
- восстановление второго архива в чистом профиле: 2 текста, 2 workspaces, 2 voice links, 0 cached MP3; результат `restored_with_exclusions`;
- обычный перенос с MP3/media сохраняет offline real playback/seek после reload, foreign notebook consent, privacy и idempotence;
- RU/EN/HE screenshots 380px и desktop рядом с local report, page errors/provider calls=0.

## Публикация

LOCAL VERIFIED / NOT DEPLOYED. Ожидается отдельное разрешение на неиспользуемый Docker build cache: 1.4G free, unused images 0, reclaimable build cache 2.422GB. Main не обновляется до получения этого разрешения. Ранее разрешённые unused/backup images не дают разрешения на cache cleanup. Данные пользователя не изменены.
