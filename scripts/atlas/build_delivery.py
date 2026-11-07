"""Build a portable, offline Atlas delivery ZIP from a verified snapshot package."""
import argparse
import hashlib
import json
from pathlib import Path
import tempfile
import zipfile
import sys

sys.dont_write_bytecode = True
import material_snapshot as snapshot

README = '''# Инженерный атлас 97001 — полный переносимый экспорт

Снимок опубликованной редакции от 2026-11-07, приложение 3.11.871.
Это полный архив материала, а не экспорт ИИ-подсказок. 203 страницы,
21 раздел, 873 исходных файла. Пользовательские данные сюда не входят.

## Состав

- material/payload/edition — опубликованные страницы, текстовые поля, таблицы,
  ячейки, формулы, термины, изображения, идентификаторы, метаданные и индексы.
- material/payload/context — отдельный закреплённый ИИ-слой.
- material/payload/*.pdf — оригинальный PDF; рядом исходные checksums.
- supplier-source ZIP и editorial TAR.GZ — исторические исходники поставки.
  Они не подменяют снимок текущей опубликованной редакции.
- material/inventory.json — SHA-256 и размер каждого файла материала.
- CHECKSUMS.json — SHA-256 и размер всех файлов поставки, кроме самого списка.
- tools — автономные Python-инструменты, без зависимостей от LinguistPro/npm/pip.
- reports — отчёт о формате, границах проверки, пилоте и предыдущих проверках.

## Начало работы

Нужен Python 3.12 или новее. Распакуйте ZIP в НОВЫЙ каталог.
Команды выполняются в его корне. Интернет, сервер и учётная запись не нужны.

```powershell
python -B tools/verify_delivery.py
python -B tools/verify_delivery.py --roundtrip ../atlas97001-restore-check
```

Вторая команда требует несуществующий каталог: восстанавливает материал,
повторно экспортирует его и сравнивает ВСЕ байты по SHA-256 и размеру.
Внешний файл .sha256 рядом с ZIP проверяет сам ZIP до распаковки:
`Get-FileHash -Algorithm SHA256 <имя.zip>`.

## Импорт отдельной редакции

```powershell
python -B tools/material_snapshot.py import material ../atlas97001-edit
python -B tools/material_snapshot.py import material ../atlas97001-edit --write
```

Первая команда — dry-run без записи. Вторая пишет только в новый каталог.
Это локальный импорт; он не регистрирует редакцию в приложении и не затрагивает
действующий атлас, прогресс, исправления или настройки пользователя.

После правок:

```powershell
python -B tools/material_snapshot.py diff material/payload ../atlas97001-edit
python -B tools/material_snapshot.py prepare ../atlas97001-edit ../atlas97001-draft --baseline material/payload
python -B tools/material_snapshot.py prepare ../atlas97001-edit ../atlas97001-draft --baseline material/payload --write
```

Старые ИИ-подсказки изменённых разделов переходят в evidence для повторной
проверки; действующий context manifest снимается. Черновик имеет отдельный ID,
подпись содержимого и publication_allowed=false. Производные индексы и новый
ИИ-контекст нужно пересобрать перед приёмкой. Архив сам ничего не публикует.

Откат: снова импортировать material в другой новый каталог. Не копировать
черновик поверх production. Пилот: p50, p51–52, p56 и p159; подробности в reports.

Полнота означает сохранение существующих данных, не научную вычитку и не
восстановление отсутствующей разметки из сканов. Подробности в reports/README.md.
'''

def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--package', required=True, type=Path)
    p.add_argument('--out', required=True, type=Path)
    a = p.parse_args()
    if a.out.exists(): raise ValueError('Archive already exists')
    snapshot.verify(a.package)
    snapshot.validate_import(a.package / 'payload')
    scriptdir = Path(__file__).resolve().parent
    repo = scriptdir.parent.parent
    a.out.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='atlas-delivery-') as temporary:
        root = Path(temporary)
        snapshot.transfer(a.package,root / 'material')
        (root / 'tools').mkdir()
        for name in ('material_snapshot.py','material_validate.py','verify_delivery.py'):
            (root / 'tools' / name).write_bytes((scriptdir / name).read_bytes())
        (root / 'reports').mkdir()
        for name in ('README.md','verification.json','goal-verification.json'):
            (root / 'reports' / name).write_bytes((repo / 'docs/research/atlas-transfer/2026-11-07' / name).read_bytes())
        (root / 'README.ru.md').write_text(README,encoding='utf8')
        (root / 'CHECKSUMS.json').write_text(json.dumps(snapshot.inventory(root),ensure_ascii=False,indent=2),encoding='utf8')
        with zipfile.ZipFile(a.out,'x',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
            for file in sorted(root.rglob('*')):
                if file.is_file(): z.write(file,file.relative_to(root).as_posix())
    sha = hashlib.sha256(a.out.read_bytes()).hexdigest()
    a.out.with_suffix('.zip.sha256').write_text(sha + '  ' + a.out.name + '\n',encoding='ascii')
    print(json.dumps({'archive':str(a.out),'bytes':a.out.stat().st_size,'sha256':sha}))

if __name__ == '__main__': main()
