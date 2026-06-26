# Эпик 3 — Премиум-момент поиска слова (карточка до планки Pealim/Reverso/Forvo) · P1 / L · R2

**Дата:** 2026-06-26 · **Статус:** 🟢 фаза 3a SHIPPED+PROD (v3.11.7); 3b/3c — pending.
**Родитель:** `docs/planning/BRR_UX_AUDIT_2026_06_25.md` §ЭПИК 3. Память [[project_brr_ux_audit]]. Роли R2 (вед.) · R4 · R1 · R5. **Все обогащения наследуют honest-gate Эпика 1 + R11 do-no-harm** (не делать богаче неверно-разрешённое; семья скрыта при `ambiguous`).
**Поверхность:** `reader-morph.js` + `library-ui.js` + `library.html`-CSS + локали. `index.html`/parity-билдер нетронуты.

**Recon-сверка с живым кодом (R10, [[feedback_verify_stale_plan_vs_live_code]]):** аудит здесь ТОЧЕН (в отличие от Эпика 2). Озвучки заголовка нет; root-family чипы = голый иврит (индекс уже несёт `{disp,key,pid,pos}`, нет `meaning`+статуса, дедуп по lemma схлопывает гомографы); служебные слова = только глосс (данных об употреблении НЕТ).

**Owner-развилки (одобрены 2026-06-26):** озвучка = **BYOK-GCP→браузер** · служебные «употребление» = **отдельная фаза 3b** (контент+R1-авторинг+sign-off) · root-family статус = **показывать на чипах**.

---

## ✅ Фаза 3a — SHIPPED+PROD (v3.11.7, код-онли, S+M)

### #1 Озвучка заголовка (`card-pronounce-word`, P2/S)
Кнопка 🔊 у заголовка карточки → озвучка огласованной формы. `library-ui.speakWord(text)`: при BYOK GCP TTS ключе → `/api/tts` (WaveNet-качество), иначе keyless браузерный SpeechSynthesis; любой сбой GCP/офлайн → браузер (без тупика). Wire `opts.speakWord`. `reader-morph` `onSpeak` (fallback `window.v3ConjSpeak`) + делегация `data-rm-speak`. i18n `room.morph.pronounce`. (Заметка: «keyless WaveNet» из аудита — это пред-запечённый MP3 *строк*; у одиночного слова MP3 нет → реальный путь = GCP-or-browser.)

### #2 Обогащение root-family (`card-rootfamily-quality`, P2/M)
Чипы больше не мёртвый иврит: огласованная форма + POS + глосс + **цвет-статус** (знаю/учу/новое). `rootIndex` +`meaning`, **дедуп по `pealim_id`** (гомографы — отдельные чипы, не схлопнуты). `resolveWordLight` вешает `state` на каждый чип через `opts.getWordStates` (= single-flight `ensureWordStates`, офлайн-дёшево, best-effort). Цвет-статус = левый бордер-акцент (WCAG: не только цвет). Семья остаётся скрытой при `ambiguous` (F5/Epic-1).

**Гейты:** `smoke:reader-morph` (+🔊+chip-asserts) · `i18n` 226/0 (+pronounce ×3) · `reader-parity` · `reader-notes` · `reader-scaffold` 234/0 · `reader-context` · `reader-dicta` · `reader-tier3-regression` · `autogen-parity`. @380px свет+тёмная (🔊 + цветные чипы POS/глосс). SW `v3.11.7`.

---

## ⏳ Фаза 3b — «Употребление» служебных слов (`card-function-usage`, P2/M, R2) — PENDING
Данных НЕТ — нужен **отдельный recon дизайна данных** + R1-авторинг + owner sign-off ПЕРЕД кодом: объём (top-N частотных של/את/ב/ל/מ/ש/על/עם…), глубина (глосс есть; +управление/падеж/коллокации/позиция), место хранения (курир. JSON `public/data/…` vs inline), R1/R2-ревью (без фабрикации, curated≠derived). Сейчас служебные → `functionGate` честный глосс + `PealimFunctionLinks {id,pos}`.

## ⏳ Фаза 3c/d — позже (как в плане)
`card-ktiv-proclitic-breakdown` (P3 — разбор проклитики הַ+שַׁחַר; вычислен, выброшен) · `translit-stress` (P2/L — транслит без ударения учит неверному milel/milra; **producer-side**, последним).

---

## Следующий шаг
Фаза 3b — отдельный recon (дизайн данных «употребление»). ИЛИ переключиться на другой эпик (4 удержание / 5 graded-импульс / 6 курируемая библиотека) — выбор владельца.
