"""Lossless display rotations; immutable extraction assets remain untouched."""
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[4]
DATA = ROOT / 'data/atlas/a97001'
objects = [json.loads(s) for s in (DATA/'supplier/source-pack/pages.jsonl').read_text(encoding='utf-8').splitlines()]
for obj in objects:
    if obj['type'] != 'figure' or obj['page'] not in (157, 159, 160, 170):
        continue
    source = DATA/'supplier/source-pack'/obj['crop']
    target = DATA/'assets'/f"p{obj['page']}-table-upright.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as im:
        im.transpose(Image.Transpose.ROTATE_90).save(target)
    print(target.name)
