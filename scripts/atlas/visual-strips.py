"""Review strips: every page of the reader (desktop shot) cut into columns and packed four columns per image,
so a whole section can be looked through page by page. Each column is labelled with its page.
Usage: python scripts/atlas/visual-strips.py <out dir with shots/> <first> <last> [kind=pc|ph]
Writes <out>/strips/<kind>-<first>-<last>-NN.png
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

out, lo, hi = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
kind = sys.argv[4] if len(sys.argv) > 4 else 'pc'
W, H, PER = 440, 1500, 6
cols = []
for n in range(lo, hi + 1):
    f = os.path.join(out, 'shots', '%s-%03d.png' % (kind, n))
    if not os.path.exists(f):
        continue
    im = Image.open(f).convert('RGB')
    im = im.resize((W, max(1, round(im.height * W / im.width))), Image.LANCZOS)
    parts = range(0, im.height, H)
    for k, y in enumerate(parts):
        cols.append(('p%d%s' % (n, ' (%d/%d)' % (k + 1, len(parts)) if len(parts) > 1 else ''), im.crop((0, y, W, min(im.height, y + H)))))
os.makedirs(os.path.join(out, 'strips'), exist_ok=True)
for s in range(0, len(cols), PER):
    group = cols[s:s + PER]
    sheet = Image.new('RGB', (PER * (W + 10), H + 22), (70, 70, 70))
    d = ImageDraw.Draw(sheet)
    for i, (label, c) in enumerate(group):
        x = i * (W + 10)
        d.text((x + 4, 0), label, fill=(255, 255, 0), font=ImageFont.load_default(size=20))
        sheet.paste(c, (x, 22))
    sheet.save(os.path.join(out, 'strips', '%s-%03d-%03d-%02d.png' % (kind, lo, hi, s // PER)), optimize=True)
print('strips', (len(cols) + PER - 1) // PER)
