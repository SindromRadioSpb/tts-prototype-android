# Как провести benchmark C2

Статус: инструкция для владельца. Для результата нужны шесть восьмиминутных сессий. Проходите их
в порядке из таблицы ниже, желательно в разные часы или дни. Используйте наушники, чтобы голос
Gemini не попадал обратно в микрофон.

## Перед началом

1. Убедитесь в Google AI Studio, что API key относится именно к Free Tier и billing для него не
   переводит запросы на платный тариф. Если уверенности нет — не запускайте realtime.
2. Откройте PowerShell в корне проекта.
3. Посмотрите точное имя микрофона:

```powershell
node docs/research/hermes-education-scaleup/rnd-c2-2026-07-25/prototype/c2-session.mjs --list-devices
```

4. Не произносите и не вставляйте личные тексты. В заданиях используются только нейтральные
   бытовые ситуации.

## Последовательность

| № | Режим | Сценарий |
|---:|---|---|
| 1 | H2.6 async | `cafe` |
| 2 | Gemini realtime | `cafe` |
| 3 | Gemini realtime | `directions` |
| 4 | H2.6 async | `directions` |
| 5 | H2.6 async | `plans` |
| 6 | Gemini realtime | `plans` |

### Async

Проведите ровно 8 минут через уже работающий `linguistpro-voice-session`. Считайте только
подтверждённые вами голосовые реплики на иврите. Затем запишите агрегат:

```powershell
node docs/research/hermes-education-scaleup/rnd-c2-2026-07-25/prototype/record-async.mjs --scenario cafe --turns 6 --duration-sec 480 --anxiety 3 --quality 4 --actual-cost-usd 0
```

Замените сценарий, число реплик и две оценки своими фактическими значениями.

### Realtime

Ключ берётся только из переменной `C2_GEMINI_API_KEY`. Не печатайте его в консоль и не сохраняйте
в репозиторий. Запуск:

```powershell
node docs/research/hermes-education-scaleup/rnd-c2-2026-07-25/prototype/c2-session.mjs --scenario cafe --device "ТОЧНОЕ ИМЯ МИКРОФОНА" --confirm-free-tier YES_I_CONFIRMED_FREE_TIER
```

Сессия завершится автоматически через 8 минут. Можно закончить раньше сочетанием Ctrl+C. После
остановки программа спросит тревожность, качество диалога и проверенную стоимость. Для принятия
сессии стоимость должна быть `0`.

При `429` не повторяйте запрос сразу: программа зафиксирует инцидент без содержания разговора и
сообщит использовать H2.6 async. Такой прогон не считается одной из трёх успешных realtime-сессий.

## Финальный подсчёт

```powershell
node docs/research/hermes-education-scaleup/rnd-c2-2026-07-25/prototype/score-benchmark.mjs
```

Команда откажется выдавать вердикт, пока нет ровно трёх полных async и трёх полных realtime-ячеек
по сценариям `cafe`, `directions`, `plans`. Полученный aggregate JSON не содержит речи или
транскриптов.
