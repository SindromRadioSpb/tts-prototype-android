# C1 Experimental Local Companion

Локальный loopback-сервис для production-интерфейса LinguistPro C1 Experimental. Он использует
замороженный C1 feature extractor, но не меняет research scorer и не пересчитывает benchmark.

## Запуск владельцем

Из корня репозитория:

```powershell
powershell -ExecutionPolicy Bypass -File .\c1_companion\start.ps1
```

При первом запуске из локального `.tmp/h3-c1-results/details.json` создаётся персональный
калибровочный профиль `.tmp/c1-experimental/profile.json`. В консоли появится случайный token —
его нужно вставить на странице `/pronunciation.html`. Все эти файлы gitignored.

Companion слушает только `127.0.0.1:8765`, принимает запросы только от production LinguistPro и
явных localhost-origin, требует token, ограничивает WAV 10 MiB/12 секундами, обрабатывает по одному
запросу и удаляет временный WAV в `finally`.

## Приватность и authority

- Raw audio, профиль и детальные акустические признаки не отправляются на сервер LinguistPro.
- Нет transcript, истории попыток, аналитики, LLM/provider calls или learner-state writes.
- Результат advisory-only и не влияет на FSRS, `review_log`, grade, mastery или progress.
- Профиль конкретного человека нельзя передавать другому пользователю.

## Модели и лицензии

Pinned hashes and reproduction commands are documented in the C1 research README. MMS_FA weights
are CC BY-NC 4.0 and are used under the owner-declared noncommercial status of LinguistPro.
Phonikud code is CC BY 4.0; its referenced ONNX model card states MIT. See
`THIRD_PARTY_NOTICES.md`. Monetization requires disabling C1-X or replacing/relicensing MMS_FA.
