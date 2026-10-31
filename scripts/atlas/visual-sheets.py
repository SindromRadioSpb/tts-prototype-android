"""Acceptance sheets: the book scan | the reader page on a desktop | the same page on a phone.

Input: the shots of visual-acceptance.cjs (<out>/shots/pc-NNN.png, ph-NNN.png), the asset cache it filled and the
reader section JSONs (to find each page's scan). Output: <out>/sheets/NNN.png, one per book page, or with --pack
<out>/packs/NNN-MMM.png holding consecutive short pages side by side (one review image per two short pages).
Usage: python scripts/atlas/visual-sheets.py <out dir> <dir with sec-*.json or sections/*.json> [first last] [--pack]
"""
import glob
import json
import os
import sys

from PIL import Image, ImageDraw

args = [a for a in sys.argv[1:] if not a.startswith('--')]
pack = '--pack' in sys.argv
out, data = args[0], args[1]
lo, hi = (int(args[2]), int(args[3])) if len(args) > 3 else (1, 9999)
files = glob.glob(os.path.join(data, 'sec-*.json')) or glob.glob(os.path.join(data, 'sections', '*.json'))
scan_of = {}
for f in files:
    sec = json.load(open(f, encoding='utf-8'))
    for p in sec['pages']:
        if p.get('image'):
            scan_of[p['page']] = (sec['id'], p['image'].split('/')[-1])

SCAN_W, PC_W, PH_W, MAX_H = 620, 800, 390, 2400


def fit(im, width):
    return im.resize((width, max(1, round(im.height * width / im.width))), Image.LANCZOS) if im.width != width else im


def columns(im, width, max_h):
    """A tall shot is cut into side-by-side columns no taller than max_h."""
    im = fit(im, width)
    if im.height <= max_h:
        return [im]
    return [im.crop((0, y, width, min(im.height, y + max_h))) for y in range(0, im.height, max_h)]


def page_sheet(n):
    pc = os.path.join(out, 'shots', 'pc-%03d.png' % n)
    ph = os.path.join(out, 'shots', 'ph-%03d.png' % n)
    scan = os.path.join(out, 'assets', scan_of[n][1])
    if not (os.path.exists(pc) and os.path.exists(ph) and os.path.exists(scan)):
        return None
    pcs = columns(Image.open(pc).convert('RGB'), PC_W, MAX_H)
    phs = columns(Image.open(ph).convert('RGB'), PH_W, MAX_H)
    cols = [fit(Image.open(scan).convert('RGB'), SCAN_W)] + pcs + phs
    w = sum(c.width for c in cols) + 12 * (len(cols) - 1)
    h = max(c.height for c in cols) + 30
    sheet = Image.new('RGB', (w, h), (120, 120, 120))
    d = ImageDraw.Draw(sheet)
    d.text((6, 6), 'p%d  %s   [scan | desktop x%d | phone x%d]' % (n, scan_of[n][0], len(pcs), len(phs)), fill=(255, 255, 0))
    x = 0
    for c in cols:
        sheet.paste(c, (x, 30))
        x += c.width + 12
    return sheet


pages = [n for n in sorted(scan_of) if lo <= n <= hi]
made = 0
if not pack:
    os.makedirs(os.path.join(out, 'sheets'), exist_ok=True)
    for n in pages:
        s = page_sheet(n)
        if s:
            s.save(os.path.join(out, 'sheets', '%03d.png' % n), optimize=True)
            made += 1
    print('sheets', made)
else:
    os.makedirs(os.path.join(out, 'packs'), exist_ok=True)
    group = []

    def flush():
        global made
        if not group:
            return
        w = sum(g[1].width for g in group) + 40 * (len(group) - 1)
        h = max(g[1].height for g in group)
        im = Image.new('RGB', (w, h), (40, 40, 40))
        x = 0
        for g in group:
            s = g[1]
            im.paste(s, (x, 0))
            x += s.width + 40
        im.save(os.path.join(out, 'packs', '%03d-%03d.png' % (group[0][0], group[-1][0])), optimize=True)
        made += 1
        group.clear()

    for n in pages:
        s = page_sheet(n)
        if not s:
            continue
        short = s.width <= 1900 and s.height <= 1500
        if group and (not short or len(group) >= 2 or not group[-1][2]):
            flush()
        group.append((n, s, short))
        if not short:
            flush()
    flush()
    print('packs', made)
