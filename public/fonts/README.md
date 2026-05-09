# Hebrew typography fonts (self-hosted)

Этот каталог хранит self-hosted Hebrew-шрифты для премиальной типографики.

## Почему self-hosted

Сервер выставляет `Cross-Origin-Embedder-Policy: require-corp` (нужен для
SharedArrayBuffer + wa-sqlite). Из-за этого внешние CDN (Google Fonts,
fonts.gstatic.com) **блокируются** браузером, потому что они не отдают
заголовок `Cross-Origin-Resource-Policy`. Поэтому шрифты лежат локально.

## Что нужно положить сюда

Для полноценного премиального рендеринга иврита (с правильными
огласовками — никудом) рекомендуются:

### Frank Ruhl Libre (классический серийный шрифт)
- Скачать: https://fonts.google.com/specimen/Frank+Ruhl+Libre
- Файлы: `frank-ruhl-libre-400.woff2`, `frank-ruhl-libre-500.woff2`, `frank-ruhl-libre-700.woff2`
- Лицензия: SIL Open Font License 1.1 (свободно для коммерческого
  использования и редистрибуции)

### Noto Sans Hebrew (универсальный sans-serif с поддержкой никуда)
- Скачать: https://fonts.google.com/noto/specimen/Noto+Sans+Hebrew
- Файлы: `noto-sans-hebrew-400.woff2`, `noto-sans-hebrew-500.woff2`, `noto-sans-hebrew-700.woff2`
- Лицензия: SIL Open Font License 1.1

### Assistant (премиум modern sans для UI)
- Скачать: https://fonts.google.com/specimen/Assistant
- Файлы: `assistant-400.woff2`, `assistant-500.woff2`, `assistant-700.woff2`
- Лицензия: SIL Open Font License 1.1

## Как скачать в правильном формате

Используйте **google-webfonts-helper**: https://gwfh.mranftl.com/fonts

1. Открыть страницу шрифта.
2. Выбрать веса: 400, 500, 700.
3. Снять галочку «Charsets» — оставить только `latin` + `hebrew`.
4. Best support → выбрать `Modern Browsers` (woff2 + woff).
5. Скачать ZIP, положить woff2-файлы сюда с переименованием по schema выше.

Размер каждого `woff2` ~30-60 KB, итого ~300-500 KB на все шрифты —
приемлемо для self-hosted решения.

## Как они подключаются

`public/css/typography-hebrew.css` (или inline в `public/index.html`)
содержит `@font-face` declarations, которые ссылаются на эти файлы.
При отсутствии файлов — fallback на system fonts (которые тоже
неплохие на современных OS, но без авторской типографической
аккуратности).

## Fallback chain

Если файлов в этом каталоге нет, шрифты не загрузятся — браузер
использует:
- macOS / iOS: `"SF Hebrew"`, `"Arial Hebrew"`, system font
- Windows: `"Segoe UI"` (с Hebrew glyphs из Win 8+)
- Android: `"Roboto"` с Hebrew glyphs или `"Noto Sans Hebrew"` (часто
  предустановлен)
- Linux: зависит от установленного — обычно `"Liberation Sans"` /
  `"DejaVu Sans"` с Hebrew

В fallback-режиме приложение остаётся читаемым, но не производит
впечатления типографически выверенного (огласовки могут «прыгать»
на некоторых OS).
