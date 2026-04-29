# ТЗ: Кнопка смены ориентации экрана — Classic Mode Mobile (Премиум)

**Версия:** 1.0  
**Дата:** 2026-04-29  
**Статус:** Требования согласованы, ожидает реализации

---

## 1. Назначение

Дать пользователю возможность одним нажатием переключить ориентацию экрана прямо внутри приложения — без необходимости вручную поворачивать телефон или снимать блокировку автоповорота в системных настройках.

Ориентировано на ситуации чтения: в вертикальной ориентации текст занимает весь экран; в горизонтальной — видно больше колонок таблицы (иврит, транслитерация, русский одновременно).

---

## 2. Scope

- **Платформа:** Web-приложение, только мобильный браузер (touch-устройства)
- **Режим:** Classic Mode — основное представление с таблицей
- **Доступность:** Премиум-функция (флаг `feature_orientation_toggle`)
- **Не затрагивает:** Desktop, планшеты ≥ 1024px, другие режимы (Library, Settings)

---

## 3. Функциональные требования

### 3.1 Расположение и внешний вид

| Свойство | Значение |
|---|---|
| Позиция | `position: fixed; bottom: 24px; left: 18px` |
| Safe area | `bottom: calc(24px + env(safe-area-inset-bottom))` / `left: calc(18px + env(safe-area-inset-left))` |
| Форма | Круглая, 50×50px (симметрична edit FAB справа) |
| Z-index | 195 (на одном уровне с edit FAB) |
| Иконка | SVG: телефон с круговой стрелкой; меняется в зависимости от текущего состояния |
| Фон (доступно API) | `linear-gradient(180deg, #37474f, #263238)` (нейтральный серый) |
| Фон (API недоступно / iOS) | `linear-gradient(180deg, #546e7a, #455a64)` (приглушённый, намекает на ограничение) |
| Тень | `0 16px 28px rgba(38, 50, 56, 0.28)` |
| Видимость | Только когда `classicIsMobileViewport() === true` и таблица с данными отображается |

**Иконки (SVG, inline):**
- `⟳ телефон вертикально → горизонтально` — текущая ориентация portrait, нажатие переведёт в landscape
- `⟲ телефон горизонтально → вертикально` — текущая ориентация landscape, нажатие переведёт в portrait

### 3.2 Поведение при нажатии

**Сценарий A — Screen Orientation API поддерживается (Android Chrome):**

1. Определить текущую ориентацию через `screen.orientation.type`:
   - `"portrait-primary"` / `"portrait-secondary"` → цель: `"landscape"`
   - `"landscape-primary"` / `"landscape-secondary"` → цель: `"portrait"`
2. Вызвать `screen.orientation.lock(targetType)`:
   - При успехе: обновить иконку, сохранить предпочтение в `sessionStorage`
   - При ошибке `NotSupportedError` или `SecurityError` → показать подсказку (см. 3.3)
3. При закрытии вкладки / уходе со страницы: вызвать `screen.orientation.unlock()` (разблокировать)

**Сценарий B — API недоступен или заблокирован (iOS Safari, некоторые браузеры):**

- Кнопка показывается с приглушённым фоном
- При нажатии — показать `classicOrientationHint(targetOrientation)`: небольшой тост в нижней части экрана:
  > «Поверните телефон горизонтально» / «Поверните телефон вертикально»
  > (с иконкой поворота, исчезает через 3 секунды)

**Сценарий C — Системная блокировка автоповорота включена (Android):**

- `screen.orientation.lock()` выбросит исключение с `NotAllowedError`
- Показать тост:
  > «Отключите блокировку поворота в системных настройках»

### 3.3 Тост-подсказка (`classicOrientationHint`)

- Появляется снизу-по-центру, над FAB-кнопками
- Анимация: fade-in 150ms, fade-out 300ms, auto-hide после 3000ms
- Не блокирует взаимодействие (нет overlay)
- Закрывается по тапу

### 3.4 Сброс ориентации

- При переходе в другой режим (Library, Settings) — вызвать `screen.orientation.unlock()`
- При закрытии/перезагрузке страницы — браузер автоматически снимает блокировку
- Кнопка «назад» / закрытие классик-мода — разблокировать ориентацию

### 3.5 Реакция на системный поворот

- Если пользователь физически повернул телефон пока lock активен — ориентация должна зафиксироваться обратно (поведение `lock`)
- Если lock не активен — следовать системному автоповороту, обновить иконку кнопки

---

## 4. Состояние и переменные

```javascript
// Текущий lock-статус
var orientationLockActive = false;        // lock через API
var orientationLockTarget = null;         // "landscape" | "portrait" | null

// Определение доступности API
function orientationApiSupported() {
    return !!(screen.orientation && typeof screen.orientation.lock === "function");
}

// Определение текущей ориентации
function currentOrientationType() {
    if (screen.orientation) return screen.orientation.type;  // стандарт
    return (window.innerWidth > window.innerHeight) ? "landscape-primary" : "portrait-primary";
}

// Целевая ориентация при нажатии
function orientationToggleTarget() {
    const cur = currentOrientationType();
    return cur.startsWith("landscape") ? "portrait" : "landscape";
}
```

---

## 5. DOM и CSS

### 5.1 HTML-элемент

```html
<button id="classicOrientationFab"
        type="button"
        title="Переключить ориентацию"
        aria-label="Переключить ориентацию"
        hidden>
  <!-- SVG icon вставляется динамически через orientationFabUpdate() -->
</button>
```

### 5.2 CSS

```css
#classicOrientationFab {
  display: none;
  position: fixed;
  left: calc(18px + env(safe-area-inset-left, 0px));
  bottom: calc(24px + env(safe-area-inset-bottom, 0px));
  z-index: 195;
  width: 50px;
  height: 50px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 999px;
  background: linear-gradient(180deg, #37474f, #263238);
  color: #ffffff;
  font-size: 20px;
  box-shadow: 0 16px 28px rgba(38, 50, 56, 0.28);
  cursor: pointer;
  transition: transform 0.14s ease, box-shadow 0.18s ease, opacity 0.18s ease;
}
#classicOrientationFab:hover  { transform: translateY(-1px); }
#classicOrientationFab:active { transform: scale(0.96); }
#classicOrientationFab.api-unavailable {
  background: linear-gradient(180deg, #546e7a, #455a64);
  opacity: 0.75;
}
#classicOrientationFab.locked {
  background: linear-gradient(180deg, #1976d2, #1565c0); /* синий = зафиксировано */
}

@media (pointer: coarse) and (max-width: 768px) {
  #classicOrientationFab.fab-visible { display: inline-flex; }
}
@media (pointer: coarse) and (orientation: landscape) and (max-height: 560px) {
  #classicOrientationFab.fab-visible { display: inline-flex; }
}
```

### 5.3 Тост

```css
#classicOrientationHint {
  position: fixed;
  bottom: calc(90px + env(safe-area-inset-bottom, 0px));
  left: 50%;
  transform: translateX(-50%);
  background: rgba(33, 33, 33, 0.92);
  color: #fff;
  padding: 10px 18px;
  border-radius: 24px;
  font-size: 14px;
  z-index: 300;
  pointer-events: none;
  transition: opacity 0.15s ease;
}
#classicOrientationHint.hidden { opacity: 0; pointer-events: none; }
```

---

## 6. Ключевые функции JS

```javascript
// Главная функция обновления кнопки (вызывается при init, resize, orientationchange)
function orientationFabUpdate() { … }

// Обработчик нажатия
async function orientationFabClick() { … }

// Показать тост
function classicOrientationHint(targetOrientation) { … }

// Разблокировать и сбросить
function orientationFabUnlock() { … }
```

Функции регистрируются аналогично `tableEditFabUpdate()`: вызовы при `resize`, `orientationchange`, смене режима.

---

## 7. Интеграция с Classic Mode

- `orientationFabUpdate()` вызывается везде, где сейчас вызывается `tableEditFabUpdate()`, чтобы обе кнопки синхронно показывались/скрывались
- При входе в режим редактирования (`tableEditModeEnter`) — не скрывать кнопку ориентации
- Кнопка отображается независимо от состояния edit-режима

---

## 8. Флаг и деградация

```javascript
const FEATURE_ORIENTATION_TOGGLE = true; // включить в dev, позже — за premium check
```

Если флаг `false` — элемент `#classicOrientationFab` не рендерится вовсе.

---

## 9. Поддержка браузеров

| Браузер | lock API | Поведение |
|---|---|---|
| Android Chrome 94+ | ✅ | Полный lock |
| Android Firefox | ✅ | Полный lock |
| iOS Safari | ❌ | Тост с подсказкой |
| iOS Chrome/Firefox | ❌ (WKWebView) | Тост с подсказкой |
| Samsung Internet | ✅ | Полный lock |
| Desktop Chrome | ✅ только в fullscreen | Кнопка скрыта (desktop) |

---

## 10. Критерии приёмки

- [ ] Кнопка отображается в portrait и landscape на мобильном (≤768px или ≤560px высота)
- [ ] Нажатие блокирует ориентацию на Android Chrome без ошибок
- [ ] Нажатие на iOS показывает тост-подсказку
- [ ] Иконка меняется в зависимости от текущей и целевой ориентации
- [ ] Выход из classic mode снимает lock
- [ ] Кнопка не мешает edit FAB (симметрия: FAB справа, эта кнопка слева)
- [ ] Safe-area insets применены корректно на iPhone с чёлкой
