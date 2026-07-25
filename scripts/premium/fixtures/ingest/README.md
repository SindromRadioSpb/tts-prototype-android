# Ingest test fixtures (W1)

- `article-he.html` — рукописная HTML-фикстура «новостная статья на иврите с boilerplate»
  для tests/ingestUrlExtract.test.js. Ручная, редактируется свободно (тест держит инварианты).
- `sample-he.docx` — бинарная DOCX-фикстура для tests/ingestDocxExtract.test.js.
  СГЕНЕРИРОВАНА скриптом `make-sample-docx.js` (npm-пакет `docx`). Не редактировать руками —
  перегенерировать: `node scripts/premium/fixtures/ingest/make-sample-docx.js`.
- Всё в этой папке — тестовые данные, коммитятся в git (артефакт-правило CLAUDE.md).
