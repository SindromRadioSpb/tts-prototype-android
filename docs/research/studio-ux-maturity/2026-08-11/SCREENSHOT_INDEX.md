# SCREENSHOT INDEX

Все изображения сняты 2026-08-11 с production `https://linguistpro.kolosei.com/` в
изолированном browser context на обслуживаемой версии `3.11.344`. Изображения не содержат
данных владельца. Тестовый Hebrew text:
`שלום וברוכים הבאים / היום נדבר על לימוד עברית / תודה רבה ולהתראות`.

| Сценарий | Viewport | Locale / theme | Состояние | Файл | Что доказывает | SHA-256 |
|---|---|---|---|---|---|---|
| Start | 1280×900 | RU / light | начало Studio | [desktop-ru-start.png](screenshots/desktop-ru-start.png) | desktop hierarchy, nav dominance, source/result split | `6f3a5cfc9bd850cc924709fdc4c26aa9fc41f8b1af14f5b24c3d044213508e11` |
| Start | 380×844 @3x | RU / light | first viewport | [mobile-ru-start.png](screenshots/mobile-ru-start.png) | primary ingest/table actions are below fold; no horizontal overflow | `e029227daf886ab0c11f31237373e29451aae40c7e36e7b14f1b5fd86edc4e26` |
| B | 380×844 @3x | RU / light | Video + preview + Downr | [mobile-ru-video-downr.png](screenshots/mobile-ru-video-downr.png) | acquisition, preview, captions and external download coexist in one long layer | `806f08b9f6c54773999c636a34d0803eb1ebea4d47bef06c62fb96a7259aa3cb` |
| A | 380×844 @3x | RU / light | parsed YouTube transcript preview | [mobile-ru-transcript-preview.png](screenshots/mobile-ru-transcript-preview.png) | four competing next actions and provider jargon | `99ef975214c986aaf313f2b22dd2e533900840cf56bde3fe35c004dcd764fcad` |
| A/D | 380×844 @3x | RU / light | transcript landed | [mobile-ru-imported-false-source.png](screenshots/mobile-ru-imported-false-source.png) | visible false `Источник: локальный ввод`; DOM passport evidence is recorded in FINDINGS | `1fbc2ea29bbc76aca2bf16170c30db4e3064b62e01e5059ae13e7178952de65c` |
| E | 380×844 @3x | RU / light | Device draft shelf | [mobile-ru-device-draft.png](screenshots/mobile-ru-device-draft.png) | real draft revision, generic title, inaccessible visual media picker | `7a07a2cf7c3d0c30f9c66dcb6b19bef8662b2e538e40d81fd39c4f57f522adf0` |
| E | 380×844 @3x | RU / light | Import Center materials | [mobile-ru-materials-count-conflict.png](screenshots/mobile-ru-materials-count-conflict.png) | destination says `Все · 0` after source CTA said `Материалы 1` | `5ab3548a489cf4798cc3d5f438b3499b20baa5e191e7c80d7ff7fe85587f9cb3` |
| C/E | 380×844 @3x | HE/RTL / light | Device modal | [mobile-he-rtl-device-modal.png](screenshots/mobile-he-rtl-device-modal.png) | RTL geometry/no overflow, long labels and mixed technical language | `b6d5464b538bc7744c1962b1815c6a99b08527da7dbdd4b4ca587607fa695709` |
| Start/A | 380×844 @3x | HE/RTL / dark | main workspace | [mobile-he-rtl-dark-contrast.png](screenshots/mobile-he-rtl-dark-contrast.png) | near-invisible nav labels, mixed `61 символ`, false source; supports measured contrast finding | `2784461661d5bf807e778e2581f38a04e42fa8be3d38d69d01985ecc77d36d9a` |

## Не изображено, но зафиксировано DOM/code evidence

- modal focus sequence и focus return: screenshot не доказывает keyboard order;
- canonical `v3LastImportMeta` против visible source chip: screenshot доказывает label, DOM
  readback и код доказывают passport;
- real VTT/MP3 file selection и error strings: Playwright result + parser/unit gates;
- iPhone keyboard/Files/Share Sheet: намеренно не изображены и остаются owner-live pending.
