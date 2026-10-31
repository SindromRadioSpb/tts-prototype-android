"""Acceptance sheets: the book scan | the reader page on a desktop | the same page on a phone.

Input: the shots of visual-acceptance.cjs (<out>/shots/pc-NNN.png, ph-NNN.png), the asset cache it filled and the
reader section JSONs (to find each page's scan). Output: <out>/sheets/NNN.png, one per book page.
Usage: python scripts/atlas/visual-sheets.py <out dir> <dir with sec-*.json or sections/*.json> [first last]
"""
import glob
import json
import os
import sys

from PIL import Image, ImageDraw

out, data = sys.argv[1], sys.argv[2]
lo, hi = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (1, 9999)
files = glob.glob(os.path.join(data, 'sec-*.json')) or glob.glob(os.path.join(data, 'sections', '*.json'))
scan_of = {}
for f in files:
    sec = json.load(open(f, encoding='utf-8'))
    for p in sec['pages']:
        if p.get('image'):
            scan_of[p['page']] = (sec['id'], p['image'].split('/')[-1])

os.makedirs(os.path.join(out, 'sheets'), exist_ok=True)
SCAN_W, PC_W, PH_W, MAX_H = 620, 800, 390, 2400


def fit(im, width):
    return im.resize((width, max(1, round(im.height * width / im.width))), Image.LANCZOS) if im.width != width else im


def columns(im, width, max_h):
    """A tall shot is cut into side-by-side columns no taller than max_h."""
    im = fit(im, width)
    if im.height <= max_h:
        return [im]
    return [im.crop((0, y, width, min(im.height, y + max_h))) for y in range(0, im.height, max_h)]


made = 0
for n in sorted(scan_of):
    if not (lo <= n <= hi):
        continue
    pc = os.path.join(out, 'shots', 'pc-%03d.png' % n)
    ph = os.path.join(out, 'shots', 'ph-%03d.png' % n)
    scan = os.path.join(out, 'assets', scan_of[n][1])
    if not (os.path.exists(pc) and os.path.exists(ph) and os.path.exists(scan)):
        continue
    parts = [fit(Image.open(scan).convert('RGB'), SCAN_W)]
    pcs = columns(Image.open(pc).convert('RGB'), PC_W, MAX_H)
    phs = columns(Image.open(ph).convert('RGB'), PH_W, MAX_H)
    cols = parts + pcs + phs
    w = sum(c.width for c in cols) + 12 * (len(cols) - 1)
    h = max(c.height for c in cols) + 30
    sheet = Image.new('RGB', (w, h), (120, 120, 120))
    d = ImageDraw.Draw(sheet)
    d.text((6, 6), 'p%d  %s   [scan | desktop x%d | phone x%d]' % (n, scan_of[n][0], len(pcs), len(phs)), fill=(255, 255, 0))
    x = 0
    for c in cols:
        sheet.paste(c, (x, 30))
        x += c.width + 12
    sheet.save(os.path.join(out, 'sheets', '%03d.png' % n), optimize=True)
    made += 1
print('sheets', made)
