# Materials Science PB2 — local PREPARE artifacts

Статус: `LOCAL_MAPPING_AND_DIAGRAM_CLASSIFICATION_COMPLETE`

Это owner-local, source-faithful подготовка. Она не является OCR-результатом,
каноническим корпусом, решебником, import package или publication snapshot.

## Воспроизведение

```powershell
python scripts\premium\prepare-materials-science-pb2.py `
  --source-dir "<owner source directory>" `
  --stable "docs\research\materials-science-problem-corpus\2026-08-30\prepare" `
  --scratch ".tmp\materials-pb2-prepare-2026-08-30\run"

python scripts\premium\map-materials-science-pb2-local.py `
  --source-dir "<owner source directory>" `
  --stable "docs\research\materials-science-problem-corpus\2026-08-30\prepare"
```

Source commit: `6804b515ad94dd4f2b9ed2c572ac3b6f3dff69be`

Скрипт принимает owner path только во время запуска и не записывает его в
артефакты. Он проверяет заранее закреплённые размеры/SHA-256 трёх входов,
не читает файл секрета и не имеет сетевого/provider/import/publication пути.

## Что смотреть

- [PREPARE_REPORT.md](PREPARE_REPORT.md) — человекочитаемый результат и решения.
- [LOCAL_MAPPING_AND_DIAGRAM_REPORT.md](LOCAL_MAPPING_AND_DIAGRAM_REPORT.md) —
  завершённый local mapping и semantic visual review.
- [task-manifest.json](task-manifest.json) — owner-approved canonical task set.
- [mapping-ledger.json](mapping-ledger.json) — сохранённая исходная heuristic
  очередь; reviewed verdict находится в `reviewed-legacy-row-mapping.json`.
- [reviewed-legacy-row-mapping.json](reviewed-legacy-row-mapping.json) — все
  58 карточек / 2 469 строк с hash-bound target ID.
- [diagram-manifest.json](diagram-manifest.json) — классификация всех 60 задач.
- [prepared-input-manifest.json](prepared-input-manifest.json) — PDF/page/hash
  read-back.
- `visual-review/*-contact.jpg` — все страницы четырёх PDF после обратного
  рендера; это визуальное доказательство PREPARE, не источник текста.
- `prepared-inputs/*.pdf` — три condition-only task batch и один reference batch.

Не редактировать generated JSON/PDF вручную. Raw manifests и prepared PDFs
пересобираются только генераторами. Провайдер, импорт, решения, TTS и публикация
этими командами недоступны.

## Scratch

Индивидуальные PNG-рендеры находятся только в `.tmp` и могут быть удалены.
Постоянные contact sheets, manifests и PDF находятся в этом каталоге.
