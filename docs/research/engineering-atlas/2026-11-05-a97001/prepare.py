"""Prepare a97001 supplier source package, without provider calls or publication.

Run from repository root: python docs/research/engineering-atlas/2026-11-05-a97001/prepare.py PDF
Generated tools are explicitly specialized from the existing a97002 contract.
"""
import collections
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[4]
OUT = ROOT / 'data/atlas/a97001/supplier'
ARCHIVE = ROOT / 'Архив/atlas/a97001'
SOURCE = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)
ARCHIVE.mkdir(parents=True, exist_ok=True)
shutil.copy2(SOURCE, ARCHIVE / SOURCE.name)
for folder, pattern in [('tools', '*.py'), ('schemas', '*.json')]:
    origin = ROOT / 'scripts/atlas' / ('schemas' if folder == 'schemas' else '')
    dest = OUT / folder
    dest.mkdir(exist_ok=True)
    for path in origin.glob(pattern):
        (dest / path.name).write_text(path.read_text(encoding='utf-8').replace('a97002', 'a97001'), encoding='utf-8')
spec = importlib.util.spec_from_file_location('extractor', OUT / 'tools/atlas_extract.py')
extractor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(extractor)
import fitz
doc = fitz.open(SOURCE)
manifest = extractor.extract(str(SOURCE), list(range(1, len(doc) + 1)), str(OUT / 'source-pack'))
objects = [json.loads(line) for line in (OUT / 'source-pack/pages.jsonl').read_text(encoding='utf-8').splitlines()]
ids = [o['id'] for o in objects if 'id' in o]
duplicates = [k for k, n in collections.Counter(ids).items() if n > 1]
assert not duplicates, duplicates
assert len([o for o in objects if o['type'] == 'page']) == len(doc)
assert all(i.startswith('a97001:') for i in ids)
sha = hashlib.sha256((OUT / 'source-pack/pages.jsonl').read_bytes()).hexdigest()
readme = (ROOT / 'scripts/atlas/README.dots.ru.md').read_text(encoding='utf-8').replace('a97002', 'a97001').replace('97002', '97001')
(OUT / 'FORMAT.ru.md').write_text(readme, encoding='utf-8')
task = f'''# Атлас 97001 — задание поставщику

Основы механики, издание 2024, 203 страницы PDF. Обработать ВСЕ страницы 1–203.
atlas_id: a97001. source_pack_sha256: {sha}

Сдать content-pack JSONL по приложенной схеме: исправленный по скану иврит,
огласовка, латинская и русская транслитерация, русский перевод, формулы,
таблицы, легенды рисунков, термины, примеры и предложения исправления опечаток.
Не присваивать owner_reviewed или иные статусы подтверждения владельцем.
Скан — первичный источник. Разметка экстрактора предварительная: пропущенные
объекты добавить через new:<parent>:<label>; ошибки координат сообщить отдельно.
Не переносить сведения и примеры из 97002 в новый атлас без сверки.

FORMAT.ru.md описывает формат прежнего пилота; его номера страниц и примеры
иллюстрируют только синтаксис. Эталон и готовое ядро терминов для 97001 пока
не утверждены. Эта поставка включает весь source-pack, tools и schemas.
Не считать автоматическое извлечение редакционной или визуальной приёмкой.
Проверка: python tools/atlas_validate.py --help (далее указать source-pack и content).
'''
(OUT / 'TASK.ru.md').write_text(task, encoding='utf-8')
report = {'atlas_id': 'a97001', 'source': manifest['source'], 'source_pack_sha256': sha,
          'counts': dict(collections.Counter(o['type'] for o in objects)),
          'duplicate_ids': duplicates, 'warnings': manifest['warnings'],
          'status': 'source extraction only; translation and visual acceptance pending'}
(OUT / 'inventory.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
target = ARCHIVE / 'a97001-supplier-source-v1.zip'
with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in sorted(OUT.rglob('*')):
        if p.is_file() and '__pycache__' not in p.parts:
            z.write(p, p.relative_to(OUT).as_posix())
    z.write(SOURCE, 'original/' + SOURCE.name)
checksums = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in [target, ARCHIVE / SOURCE.name]}
(ARCHIVE / 'checksums.json').write_text(json.dumps(checksums, ensure_ascii=False, indent=2), encoding='utf-8')
shutil.copy2(OUT / 'inventory.json', Path(__file__).parent / 'inventory.json')
print(json.dumps({'archive': str(target), 'counts': report['counts'], 'warnings': len(report['warnings'])}, ensure_ascii=False))
