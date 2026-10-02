# Выбор исходного медиа и MP3 озвучки

2026-10-02. Baseline `db42438c` / production 3.11.718. Опубликована и проверена 3.11.719 / `69bdb575`.

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

**PRODUCTION PASS.** Owner explicitly authorized unused build-cache cleanup in the next reply. Перед push: `docker builder prune -af` удалил 3.702GB unused build cache, free disk 1.4G → 4.4G; работающий image, 12 containers и 4 volumes сохранены. Затем main обновлён на `69bdb575d6de0077715547c50a0016ee549c0d9e`.

Deployment queue 2592 finished 2026-10-02 18:31:01 UTC. Новый runtime image `301f4efe39c538f2b5b899a1694c0816782dfe7a8cd29cec0973898cccc621e4`. После штатного удаления старого app container проверены все container image refs, и в пределах ранее разрешённых unused/backup images удалён `698da868a6de`. После завершения сборки повторно удалён только unused build cache (2.485GB). Итог: free 4.4G / 88%, build cache 0, 11 active images, 12 running containers, те же 4 volumes. Без system/container/volume prune; данные пользователя сохранены.

[Production browser roundtrip](production/browser-evidence.json) подтверждает UI exclude-all, independent TTS choice, сохранение history/voice bindings при нулевом MP3 cache, реальное offline play/seek обычного архива, explicit exclusions вместо missing audio, privacy и idempotence. Page errors/provider calls=0. [Три no-cache version/health/artifact SHA проверки](production/served-assets.json) прошли и до, и после последней очистки; финальный отчёт записан после cleanup. Physical device stress test и перенос actual owner media на USB не выполнялись.
