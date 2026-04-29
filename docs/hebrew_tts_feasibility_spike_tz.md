# ТЗ для Codex: PATCH-NEXT — Hebrew TTS Feasibility Spike: Phonikud/Piper sidecar PoC, license check and provider strategy

Версия: 1.0  
Проект: `tts-prototype-android`  
Фокус: **Hebrew-first TTS**  
Цель итерации: быстро и честно проверить, существует ли практически пригодный Hebrew Piper/Phonikud TTS path для проекта, не ломая текущий Google/online TTS, не обещая production-ready Hebrew Piper и не тратя время на прямой `web_wasm` staging, пока не доказана совместимость.

---

## 0. Критически важный вывод перед началом

Не продолжать “в лоб” план:

```text
stage Hebrew Piper into current sherpa-onnx web_wasm exactly like English
```

Пока это не доказано.

Текущая фактическая картина:

| Вопрос | Ответ |
|---|---|
| Есть ли Hebrew Piper вообще? | Да, есть экспериментальный Hebrew G2P/TTS stack |
| Есть ли готовый официальный Hebrew `sherpa-onnx web_wasm` bundle? | Не подтверждено |
| Есть ли Hebrew model в официальном списке sherpa-onnx TTS models? | В опубликованном списке поддерживаемых TTS models Hebrew не указан; Russian указан, Hebrew нет |
| Есть ли практический Hebrew TTS stack у thewh1teagle? | Да: Phonikud/G2P/phonemize/Piper ONNX |
| Можно ли сразу в production? | Нет, нужна проверка лицензии и качества |
| Что оставить default? | Google/online TTS для Hebrew |
| Что проверять первым? | Python/sidecar PoC, не web_wasm |

---

## 1. Главная цель итерации

Проверить feasibility Hebrew local TTS по схеме:

```text
Hebrew text
  -> Phonikud / Hebrew G2P / phonemizer
  -> Piper ONNX / piper-onnx
  -> WAV audio
  -> sidecar API PoC
  -> web UI TTS playback
```

И принять решение:

```text
A. Можно интегрировать как local Hebrew sidecar provider.
B. Можно попробовать конвертацию/staging в web_wasm позже.
C. Нельзя использовать из-за лицензии.
D. Нельзя использовать из-за качества.
E. Оставляем Google/online TTS как единственный Hebrew default.
```

---

## 2. Product rule

Главное правило:

```text
Hebrew TTS должен оставаться рабочим для пользователя.
```

Поэтому:

```text
Google/online TTS остаётся default provider для Hebrew.
Local Piper/Phonikud является experimental provider, пока не доказаны:
- лицензия;
- качество;
- скорость;
- стабильность;
- возможность packaged/runtime интеграции.
```

Нельзя заменять рабочий Google/online TTS на experimental Hebrew Piper.

---

## 3. Проверяемые источники и факты

Перед реализацией Codex обязан изучить и зафиксировать в audit summary:

| Источник | Что проверить |
|---|---|
| `thewh1teagle/heb-piper-tts-gemma-g2p-onnx` | Python PoC: Hebrew G2P + Piper/Gemma3 |
| `thewh1teagle/phonikud` | Hebrew G2P, phonemize, ONNX Phonikud |
| `thewh1teagle/phonikud-tts` | TTS usage, license, app structure |
| `thewh1teagle/phonikud-tts-checkpoints` | Model assets, license, model files |
| `thewh1teagle/piper-onnx` | Piper ONNX runtime package |
| `sherpa-onnx TTS models list` | Есть ли supported Hebrew browser/runtime model |
| Текущий repo `tts-prototype-android` | Как сейчас работает Google/online TTS, local Piper, fallback и UI provider selection |

Проверить как минимум:

```text
1. Есть ли официальный Piper Hebrew voice.
2. Есть ли официально поддерживаемая sherpa-onnx Hebrew TTS model.
3. Что именно делает thewh1teagle Hebrew stack.
4. Какой runtime нужен: Python, ONNX Runtime, piper-onnx, Gemma/G2P.
5. Принимает ли модель raw Hebrew text или phonemes.
6. Есть ли browser/WASM path.
7. Какова лицензия.
8. Можно ли использовать в commercial/premium product.
```

---

## 4. Scope

### 4.1. Входит в scope

```text
1. Audit Hebrew TTS sources.
2. Проверка лицензии.
3. Локальный Python PoC вне основной UI-логики.
4. Генерация WAV для Hebrew smoke phrases.
5. Оценка качества вручную.
6. Замер скорости.
7. Проверка возможности sidecar API.
8. Сравнение с текущим Google/online TTS.
9. Документирование решения: continue / stop / sidecar / web_wasm later.
10. UI provider policy update: Google/online default, Hebrew local experimental.
```

### 4.2. Не входит в scope

```text
1. Production-интеграция Hebrew Piper в основной UI без PoC.
2. Замена Google/online TTS.
3. WebAssembly-конвертация Hebrew модели.
4. iOS/Android native integration.
5. Commercial release с CC-NC / non-commercial моделью.
6. Voice cloning.
7. Обучение новой Hebrew TTS модели.
8. Удаление English web_wasm milestone.
9. Удаление system_fallback.
```

---

## 5. Обязательный pre-flight

Перед началом:

```powershell
cd E:\projects\tts-prototype-android
git status
git log --oneline -5
npm run db:migrate
node --test tests\portableTtsCore.test.js tests\portableTtsRuntime.test.js tests\portableTtsManifest.test.js tests\portableTtsCache.test.js
npm run test:tts-browser-smoke
```

Если `git status` грязный, Codex должен:

```text
1. Зафиксировать, какие изменения есть.
2. Не смешивать текущий PoC с незакоммиченными изменениями.
3. Сначала создать commit или отдельную рабочую ветку.
```

Рекомендуемая ветка:

```powershell
git checkout -b spike/hebrew-phonikud-piper-tts
```

---

## 6. PATCH-00 — Hebrew TTS source audit and decision matrix

### Цель

Понять, что именно существует и что реально можно использовать.

### Проверить

```text
1. Is there an official Piper Hebrew voice?
2. Is there a sherpa-onnx supported Hebrew TTS model?
3. What exactly is thewh1teagle heb-piper repo?
4. What exactly is phonikud-tts?
5. What model files exist?
6. What runtime is required?
7. Does it require Python?
8. Does it require onnxruntime?
9. Does it require Gemma/G2P?
10. Does it accept raw Hebrew text or phonemes?
11. Is it compatible with browser WASM?
12. What is the license?
13. Can it be used commercially?
```

### Deliverable

Создать:

```text
docs/TTS_HEBREW_FEASIBILITY_AUDIT.md
```

### Таблица в документе

```text
Candidate | Source | Runtime | Input | Output | License | Browser-ready | Sidecar-ready | Quality unknown? | Decision
```

Минимальные кандидаты:

```text
1. Google/online TTS current path.
2. system_fallback speechSynthesis.
3. English Piper web_wasm current path.
4. thewh1teagle/heb-piper-tts-gemma-g2p-onnx.
5. thewh1teagle/phonikud-tts.
6. phonikud + piper-onnx sidecar.
7. Any official sherpa-onnx Hebrew model if found.
```

---

## 7. PATCH-01 — License gate

### Цель

Не тратить время на интеграцию модели, которую нельзя использовать в premium/commercial продукте.

### Проверить

```text
1. License of phonikud.
2. License of phonikud-tts.
3. License of phonikud-tts-checkpoints.
4. License of piper-onnx.
5. License of model.onnx / shaul.onnx / model.config.json.
6. License of training data if stated.
7. Any additional restriction.
```

### Важно

Если license = CC BY-NC / non-commercial / academic-only, тогда:

```text
1. Разрешить только local research PoC.
2. Запретить production integration.
3. Запретить commercial release.
4. Добавить warning в docs.
```

### Deliverable

Создать:

```text
docs/TTS_HEBREW_LICENSE_REVIEW.md
```

### Decision states

```text
LICENSE_OK_FOR_PRODUCTION
LICENSE_OK_FOR_RESEARCH_ONLY
LICENSE_BLOCKED_FOR_COMMERCIAL
LICENSE_UNKNOWN_CONTACT_AUTHOR
```

Ожидаемый preliminary result:

```text
LICENSE_OK_FOR_RESEARCH_ONLY
```

или:

```text
LICENSE_BLOCKED_FOR_COMMERCIAL
```

пока нет разрешения от автора.

---

## 8. PATCH-02 — Isolated Python PoC outside product runtime

### Цель

Получить WAV из Hebrew text локально, без интеграции в основной UI.

### Вариант A — использовать repo `heb-piper-tts-gemma-g2p-onnx`

Создать sandbox каталог:

```text
experiments/hebrew_tts_phonikud_piper/
```

Добавить README:

```text
experiments/hebrew_tts_phonikud_piper/README.md
```

Команды должны быть PowerShell.

Пример:

```powershell
cd E:\projects\tts-prototype-android
mkdir experiments\hebrew_tts_phonikud_piper
cd experiments\hebrew_tts_phonikud_piper
git clone https://github.com/thewh1teagle/heb-piper-tts-gemma-g2p-onnx.git
cd heb-piper-tts-gemma-g2p-onnx
uv run src\main.py
```

Если repo скачивает модели автоматически, зафиксировать:

```text
1. Что скачивает.
2. Откуда скачивает.
3. Размеры.
4. Куда сохраняет.
5. Какие лицензии.
```

### Вариант B — использовать `phonikud + phonikud_onnx + piper_onnx`

Если Вариант A нестабилен, проверить более прозрачную цепочку:

```text
Phonikud ONNX -> phonemize -> piper-onnx -> WAV
```

Минимальный PoC script:

```text
experiments/hebrew_tts_phonikud_piper/run_poc.py
```

Требования:

```text
1. Принимает Hebrew phrase.
2. Добавляет/нормализует niqqud.
3. Конвертирует в phonemes.
4. Генерирует WAV.
5. Сохраняет audio в experiments/hebrew_tts_phonikud_piper/out/.
6. Печатает timing.
7. Печатает model paths.
8. Не интегрируется в main UI.
```

### Deliverables

```text
experiments/hebrew_tts_phonikud_piper/README.md
experiments/hebrew_tts_phonikud_piper/run_poc.py
experiments/hebrew_tts_phonikud_piper/out/*.wav
docs/TTS_HEBREW_POC_RESULTS.md
```

---

## 9. PATCH-03 — Hebrew smoke phrase generation

### Цель

Получить WAV для набора реальных Hebrew фраз.

### Smoke phrases

```text
שלום עולם
ברוך אתה
בָּרוּךְ אַתָּה
העברית היא שפה עתיקה ומתחדשת.
אני רוצה לשמוע את הטקסט הזה בעברית טבעית.
הילדים אהבו במיוחד את הסיפורים הללו שהמורה הקריאה.
זהו מבחן קצר של מערכת דיבור בעברית.
אני לומד עברית ורוצה לשמוע כל מילה בצורה ברורה.
```

### Для каждой фразы сохранить

```text
1. raw text
2. vocalized text, если есть
3. phonemes
4. wav path
5. total generation ms
6. g2p ms
7. tts ms
8. notes
```

### Deliverable

```text
docs/TTS_HEBREW_POC_RESULTS.md
```

Таблица:

```text
Phrase | Vocalized | Phonemes | WAV | G2P ms | TTS ms | Total ms | Quality note
```

---

## 10. PATCH-04 — Quality review against current Google/online TTS

### Цель

Понять, имеет ли Hebrew Piper смысл для пользователя.

### Сравнить

```text
1. Current Google/online TTS.
2. Phonikud/Piper PoC audio.
3. system_fallback, если доступен.
```

### Критерии качества

Оценивать по шкале 0–5:

| Балл | Значение |
|---:|---|
| 0 | Нет звука / ошибка |
| 1 | Почти непонятно |
| 2 | Сильно роботизировано, много ошибок |
| 3 | Понятно, но хуже Google/online |
| 4 | Приемлемо, можно как локальный experimental |
| 5 | Близко к premium / лучше online |

### Проверить

```text
1. Понятность.
2. Естественность.
3. Ударения.
4. Ошибки niqqud.
5. Ошибки имён/заимствований.
6. Скорость генерации.
7. Стабильность.
8. Длинные фразы.
9. Смешанный Hebrew/English.
```

### Deliverable

```text
docs/TTS_HEBREW_QUALITY_REVIEW.md
```

Decision:

```text
QUALITY_ACCEPTABLE_FOR_EXPERIMENTAL
QUALITY_NOT_ACCEPTABLE
QUALITY_BETTER_THAN_SYSTEM_FALLBACK
QUALITY_WORSE_THAN_ONLINE_TTS
```

---

## 11. PATCH-05 — Minimal sidecar API PoC

### Цель

Если WAV generation работает, проверить sidecar API как realistic product integration path.

### Не интегрировать в основной UI полностью

Только PoC endpoint.

Кандидат:

```text
ai-local/hebrew_tts_sidecar.py
```

или существующий `ai-local` FastAPI, если он уже есть.

Endpoint:

```text
POST /tts/hebrew/phonikud-piper
```

Request:

```json
{
  "text": "שלום עולם",
  "voice": "shaul",
  "format": "wav"
}
```

Response options:

```text
A. audio/wav binary
B. JSON with wavPath for local dev only
```

Предпочтительно:

```text
audio/wav
```

Diagnostics:

```json
{
  "provider": "hebrew_phonikud_piper",
  "runtime": "python_sidecar",
  "g2pMs": 123,
  "ttsMs": 456,
  "totalMs": 579,
  "licenseStatus": "research_only",
  "qualityTier": "experimental"
}
```

### Deliverables

```text
ai-local/hebrew_tts_sidecar.py
tests/test_hebrew_tts_sidecar.py
docs/TTS_HEBREW_SIDECAR_POC.md
```

---

## 12. PATCH-06 — UI provider strategy update, no full integration yet

### Цель

Обновить UI/provider strategy, не заставляя пользователя ждать experimental sidecar.

### Provider selector должен показывать

```text
1. Online TTS — default
2. Local Piper English — available for English only
3. Hebrew Phonikud/Piper — experimental / research-only / disabled by default
4. Browser fallback
```

Если license не production-safe:

```text
Hebrew Phonikud/Piper (research only)
```

и disabled в production mode.

### Behavior

```text
Hebrew default -> Online TTS
Hebrew local experimental -> only if enabled in dev config
English local -> web_wasm Piper
System fallback -> explicit fallback
```

### Feature flag

```text
HEBREW_TTS_EXPERIMENTAL_ENABLED=false
```

или:

```text
TTS_HEBREW_LOCAL_EXPERIMENTAL=false
```

### Deliverables

```text
docs/TTS_PROVIDER_POLICY.md
```

И минимальные config changes, если безопасно.

---

## 13. PATCH-07 — Decision document

### Цель

После PoC принять решение, а не продолжать бесконечный эксперимент.

Создать:

```text
docs/TTS_HEBREW_DECISION.md
```

Decision options:

```text
DECISION_A_KEEP_ONLINE_DEFAULT_ONLY
DECISION_B_ADD_RESEARCH_ONLY_SIDECAR
DECISION_C_CONTACT_AUTHOR_FOR_LICENSE
DECISION_D_START_OWN_HEBREW_TTS_MODEL_TRACK
DECISION_E_TRY_WEB_WASM_CONVERSION
```

Документ должен ответить:

```text
1. Есть ли рабочий Hebrew local TTS audio?
2. Приемлемое ли качество?
3. Можно ли использовать лицензионно?
4. Можно ли интегрировать в premium app?
5. Можно ли перенести в browser web_wasm?
6. Стоит ли продолжать?
7. Какой следующий патч?
```

---

## 14. Tests

### Минимальные tests

Если добавлен sidecar PoC:

```text
tests/test_hebrew_tts_poc.py
tests/test_hebrew_tts_sidecar.py
```

Проверить:

```text
1. Empty text rejected.
2. Very long text clamped.
3. Hebrew phrase produces WAV or clear unavailable.
4. License status is exposed.
5. Diagnostics include g2pMs/ttsMs.
6. Error does not crash sidecar.
```

Если UI provider policy changed:

```text
tests/portableTtsProviderSelection.test.js
tests/portableTtsProviderFallback.test.js
```

Проверить:

```text
1. Hebrew default remains online TTS.
2. Experimental Hebrew local provider disabled unless flag enabled.
3. English local Piper remains available.
4. Local Hebrew failure falls back to online TTS.
```

---

## 15. PowerShell commands

### Pre-flight

```powershell
cd E:\projects\tts-prototype-android
git status
git log --oneline -5
npm run db:migrate
node --test tests\portableTtsCore.test.js tests\portableTtsRuntime.test.js tests\portableTtsManifest.test.js tests\portableTtsCache.test.js
npm run test:tts-browser-smoke
```

### Create branch

```powershell
git checkout -b spike/hebrew-phonikud-piper-tts
```

### Run PoC

```powershell
cd E:\projects\tts-prototype-android\experiments\hebrew_tts_phonikud_piper
uv run run_poc.py
```

или, если используется cloned repo:

```powershell
cd E:\projects\tts-prototype-android\experiments\hebrew_tts_phonikud_piper\heb-piper-tts-gemma-g2p-onnx
uv run src\main.py
```

### Targeted tests

```powershell
cd E:\projects\tts-prototype-android
node --test tests\portableTtsCore.test.js tests\portableTtsRuntime.test.js tests\portableTtsManifest.test.js tests\portableTtsCache.test.js
npm run db:migrate
```

Если sidecar tests добавлены:

```powershell
pytest tests\test_hebrew_tts_poc.py tests\test_hebrew_tts_sidecar.py -v
```

---

## 16. Documentation to create/update

```text
docs/TTS_HEBREW_FEASIBILITY_AUDIT.md
docs/TTS_HEBREW_LICENSE_REVIEW.md
docs/TTS_HEBREW_POC_RESULTS.md
docs/TTS_HEBREW_QUALITY_REVIEW.md
docs/TTS_HEBREW_SIDECAR_POC.md
docs/TTS_PROVIDER_POLICY.md
docs/TTS_HEBREW_DECISION.md
docs/LOCAL_NEURAL_TTS_PIPER.md
docs/TTS_MODEL_STAGING.md
```

---

## 17. Definition of Done

Итерация считается завершённой, если выполнено:

```text
1. Проведён audit Hebrew TTS источников.
2. Зафиксировано, что готового supported Hebrew sherpa-onnx web_wasm bundle не найдено или найдено.
3. Проверен thewh1teagle Hebrew stack.
4. Проверена лицензия.
5. Если license non-commercial/research-only, это явно зафиксировано.
6. Выполнен isolated Python PoC или зафиксировано, почему он невозможен.
7. Получен WAV минимум для 5 Hebrew smoke phrases или зафиксирована причина failure.
8. Проведено сравнение с current Google/online TTS.
9. Проведена quality review.
10. Принято решение: continue / stop / sidecar / contact author / web_wasm later.
11. Google/online TTS остаётся default for Hebrew.
12. Experimental Hebrew local TTS не включён production default.
13. Если добавлен sidecar PoC, он изолирован и feature-flagged.
14. Documentation updated.
15. Targeted TTS tests проходят.
16. `npm run test:tts-browser-smoke` всё ещё проходит для English.
17. `npm run db:migrate` проходит.
18. Commit создан.
19. Push выполнен.
20. `git status` чистый или documented pre-existing untracked мусор.
```

---

## 18. Recommended commit messages

Если это только audit/research:

```text
docs(tts): audit hebrew phonikud piper feasibility and licensing
```

Если добавлен PoC:

```text
feat(tts): add isolated hebrew phonikud piper sidecar poc
```

Если добавлены provider policy changes:

```text
fix(tts): keep online tts as default for hebrew provider selection
```

Если всё вместе, но лучше так не делать:

```text
spike(tts): evaluate hebrew phonikud piper tts feasibility
```

---

## 19. Stop criteria

Немедленно остановить интеграцию и перейти к decision doc, если:

```text
1. License blocks commercial/premium use.
2. PoC не генерирует WAV.
3. Качество ниже Google/online TTS настолько, что пользовательский смысл теряется.
4. Runtime требует слишком тяжёлую модель/Gemma path.
5. Browser/mobile перенос невозможен без большого research track.
6. Sidecar слишком медленный для UX.
```

---

## 20. Финальная формулировка для Codex

Эта задача не про то, чтобы “любой ценой встроить Hebrew Piper”.

Эта задача про честный ответ:

```text
Есть ли практически пригодный Hebrew local TTS path для нашего приложения?
```

Текущий expected outcome:

```text
Google/online TTS remains default for Hebrew.
Phonikud/Piper is evaluated as experimental local sidecar.
Web_wasm Hebrew Piper is postponed until sidecar PoC, license and quality are proven.
```

Правильный результат итерации — не обязательно новая кнопка в UI. Правильный результат — **решение**, основанное на фактах:

```text
use / do not use / research-only / contact author / build own Hebrew TTS track
```

---

## 21. Короткий executive summary

```text
Hebrew Piper exists, but not as a ready production web_wasm bundle.
The realistic next step is a local Python sidecar PoC with Phonikud/G2P/Piper.
Commercial/premium use is blocked or at least risky until license is clarified.
Online/Google TTS must remain the Hebrew default.
Do not spend more time on direct web_wasm Hebrew staging before proving sidecar quality and license.
```
