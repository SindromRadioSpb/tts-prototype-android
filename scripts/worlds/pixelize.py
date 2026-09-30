"""Pixel-normalize a generated sheet into a real pixel-art .px source (LinguistPro Worlds).

Generated images are "AI pictures pretending to be pixel art": JPEG noise, soft edges, no true grid.
This turns them into an honest logical grid that then goes through build-world-art.js like any
hand-authored sprite:

  1. chroma key: flat magenta background + its darker drop shadows → transparent;
  2. pose detection: foreground column runs separated by >= --gap source px;
  3. ONE scale for the whole sheet (from --height logical px for the tallest non-excluded pose),
     so every pose keeps the character's size;
  4. grid resampling: each logical pixel = majority coverage of its source block, colour = the
     median of covered source pixels (no averaging blur);
  5. palette quantization (median cut, --colors) + an optional 1px dark outline;
  6. poses share one cell size; feet on one baseline; horizontal alignment by torso centroid.

Usage:
  python scripts/worlds/pixelize.py <in.jpg|png> <out.px> --names idle,blink,walk-a,walk-b,hold,jump
      --height 48 [--colors 14] [--gap 10] [--outline] [--free jump] [--source-id timsah-sheet-v1]
"""
import argparse
import hashlib
import pathlib
import statistics

from PIL import Image

NL = chr(10)
CHARS = "kabcdefghijlmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"


def is_bg(p):
    r, g, b = p[:3]
    # magenta and its darker shadows / JPEG fringes: red and blue both well above green
    return (r - g > 70 and b - g > 70 and abs(r - b) < 90) or (r > 200 and b > 200 and g < 120)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("out")
    ap.add_argument("--names", required=True)
    ap.add_argument("--height", type=int, default=48)
    ap.add_argument("--colors", type=int, default=14)
    ap.add_argument("--gap", type=int, default=10)
    ap.add_argument("--outline", action="store_true")
    ap.add_argument("--free", default="", help="poses excluded from baseline/scale (e.g. jump)")
    ap.add_argument("--source-id", default="")
    ap.add_argument("--min-area", type=int, default=400)
    ap.add_argument("--layer", action="store_true", help="parallax strip: whole image, native grid, seamless tile")
    ap.add_argument("--k", type=float, default=0, help="source px per logical px (layer mode)")
    ap.add_argument("--opaque-bottom", action="store_true", help="layer fills to the bottom edge (no trailing magenta)")
    ap.add_argument("--lights", action="store_true", help="reserve palette entries for warm light sources (buildings)")
    ap.add_argument("--clean", action="store_true", help="layer mode: remove isolated noise pixels")
    a = ap.parse_args()
    if a.layer:
        return layer_mode(a)

    src = Image.open(a.src).convert("RGB")
    W, H = src.size
    px = src.load()
    fg = [[not is_bg(px[x, y]) for x in range(W)] for y in range(H)]
    # remove isolated specks (JPEG noise): keep pixels with >= 3 fg neighbours
    clean = [[False] * W for _ in range(H)]
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            if fg[y][x]:
                n = sum(fg[y + dy][x + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1)) - 1
                clean[y][x] = n >= 3
    fg = clean

    # 2D connected components (8-neighbour); poses may overlap column-wise (tails, props).
    label = [[0] * W for _ in range(H)]
    comps = []
    for y0 in range(H):
        for x0 in range(W):
            if fg[y0][x0] and not label[y0][x0]:
                cid = len(comps) + 1
                stack = [(x0, y0)]
                label[y0][x0] = cid
                bx0, by0, bx1, by1, area = x0, y0, x0, y0, 0
                while stack:
                    x, y = stack.pop()
                    area += 1
                    bx0, by0, bx1, by1 = min(bx0, x), min(by0, y), max(bx1, x), max(by1, y)
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            nx, ny = x + dx, y + dy
                            if 0 <= nx < W and 0 <= ny < H and fg[ny][nx] and not label[ny][nx]:
                                label[ny][nx] = cid
                                stack.append((nx, ny))
                comps.append([bx0, by0, bx1 + 1, by1 + 1, area, cid])
    big = [c for c in comps if c[4] >= a.min_area * 10]
    small = [c for c in comps if c[4] < a.min_area * 10]
    owner = {c[5]: c[5] for c in big}
    for c in small:  # attach props/specks to the nearest pose by bbox distance
        if c[4] < 12:
            continue
        cx, cy = (c[0] + c[2]) / 2, (c[1] + c[3]) / 2
        near = min(big, key=lambda B: max(B[0] - cx, 0, cx - B[2]) + max(B[1] - cy, 0, cy - B[3]))
        owner[c[5]] = near[5]
        near[0], near[1], near[2], near[3] = min(near[0], c[0]), min(near[1], c[1]), max(near[2], c[2]), max(near[3], c[3])
    for y in range(H):
        for x in range(W):
            l = label[y][x]
            if l and l not in owner:
                fg[y][x] = False
            elif l:
                label[y][x] = owner[l]
    big.sort(key=lambda c: c[0])
    boxes = [tuple(c[:4]) for c in big]
    pose_of = {c[5]: i for i, c in enumerate(big)}
    names = a.names.split(",")
    if len(boxes) != len(names):
        raise SystemExit(f"found {len(boxes)} poses, expected {len(names)}: {boxes}")
    free = set(filter(None, a.free.split(",")))
    boxes = [tuple(c[:4]) + (c[5],) for c in big]
    fixed = [b for n, b in zip(names, boxes) if n not in free]
    tallest = max(b[3] - b[1] for b in fixed)
    k = tallest / a.height                       # source px per logical px (one scale for all)
    baseline = max(b[3] for b in fixed)          # shared feet line in source coordinates

    def centroid_x(b):
        x0, y0, x1, y1 = b[:4]
        band = range(y0 + int((y1 - y0) * 0.35), y0 + int((y1 - y0) * 0.75))
        xs = [xx for y in band for xx in range(x0, x1) if fg[y][xx] and label[y][xx] == b[4]]
        return statistics.mean(xs) if xs else (x0 + x1) / 2

    half_w = max(max(centroid_x(b) - b[0], b[2] - centroid_x(b)) for b in boxes)
    cell_w = int(2 * half_w / k) + 4
    # headroom: a free pose (jump) may rise above the tallest grounded pose
    rise = max([(baseline - b[1]) / k for b in boxes] + [a.height])
    cell_h = int(rise) + 4
    frames = []
    for n, b in zip(names, boxes):
        cx = centroid_x(b)
        bottom = b[3] if n in free else baseline
        if n in free:  # a jump keeps its lift: place its bottom relative to the shared baseline
            bottom = baseline - (baseline - b[3])
        grid = []
        for gy in range(cell_h):
            row = []
            for gx in range(cell_w):
                sx0 = cx + (gx - cell_w / 2) * k
                sy0 = bottom - (cell_h - 2 - gy) * k - k
                cov, colsample = 0, []
                for yy in range(int(sy0), int(sy0 + k)):
                    for xx in range(int(sx0), int(sx0 + k)):
                        if 0 <= xx < W and 0 <= yy < H and fg[yy][xx] and label[yy][xx] == b[4]:
                            cov += 1
                            colsample.append(px[xx, yy])
                total = max(1, int(k) * int(k))
                if cov / total >= 0.5:
                    row.append(tuple(int(statistics.median(c[i] for c in colsample)) for i in range(3)))
                else:
                    row.append(None)
            grid.append(row)
        frames.append((n, grid))

    # palette: quantize per hue class so small but meaningful accents (the blue envelope and
    # lanyard, the white badge) keep their own colours instead of collapsing into the dominant hue.
    opaque = [c for _, g in frames for r in g for c in r if c]

    def hue_class(c):
        r, g, b = c
        if a.lights:
            import colorsys
            h, sat, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if 0.105 <= h <= 0.18 and sat >= 0.40 and v >= 0.72:
                return "light"
        if b > r + 35 and b > g + 15:
            return "blue"
        if min(c) > 215:
            return "white"
        return "other"

    budget = {"blue": 3, "white": 1, "light": 3 if a.lights else 0}
    budget["other"] = max(2, a.colors - budget["blue"] - budget["white"] - budget["light"])
    mapping, palette = {}, []
    for cls in ("other", "blue", "white", "light"):
        group = [c for c in opaque if hue_class(c) == cls]
        if not group:
            continue
        n = min(budget[cls], len(set(group)))
        strip = Image.new("RGB", (len(group), 1))
        strip.putdata(group)
        q = strip.quantize(colors=n, method=Image.Quantize.MEDIANCUT)
        pal = q.getpalette()[: n * 3]
        cpal = [tuple(pal[i:i + 3]) for i in range(0, len(pal), 3)]
        indices = list(q.get_flattened_data()) if hasattr(q, "get_flattened_data") else list(q.getdata())
        for c, i in zip(group, indices):
            mapping[c] = cpal[i]
        palette.extend(p for p in cpal if p not in palette)
    lum = lambda c: 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
    palette.sort(key=lum)
    darkest = palette[0]

    def nearest(c):
        return min(palette, key=lambda p: sum((p[i] - c[i]) ** 2 for i in range(3)))

    out_frames = []
    for n, g in frames:
        G = [[(mapping.get(c) or nearest(c)) if c else None for c in r] for r in g]
        if a.outline:
            O = [r[:] for r in G]
            for y in range(cell_h):
                for x in range(cell_w):
                    if G[y][x] is None and any(0 <= y + dy < cell_h and 0 <= x + dx < cell_w and G[y + dy][x + dx] is not None
                                               for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0))):
                        O[y][x] = darkest
            G = O
        out_frames.append((n, G))

    chars = {c: CHARS[i] for i, c in enumerate(palette)}
    sha = hashlib.sha256(pathlib.Path(a.src).read_bytes()).hexdigest()
    lines = [
        f"# PIXELIZED by scripts/worlds/pixelize.py from {a.source_id or a.src} (sha256 {sha[:16]}…)",
        f"# height={a.height} colors={a.colors} outline={a.outline} scale={k:.2f} source px per logical px",
        "# Hand edits welcome: this .px is now the source of truth for the sprite.",
        ". transparent",
    ] + [f"{chars[c]} #{c[0]:02x}{c[1]:02x}{c[2]:02x}" for c in palette]
    for n, G in out_frames:
        lines.append("")
        lines.append(f"@frame {n} {cell_w}x{cell_h} anchor={cell_w // 2},{cell_h - 2}")
        for r in G:
            lines.append("".join(chars[c] if c else "." for c in r))
    pathlib.Path(a.out).write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{a.out}: {len(out_frames)} frames {cell_w}x{cell_h}, {len(palette)} colours, k={k:.2f}")


def layer_mode(a):
    src = Image.open(a.src).convert("RGB")
    W, H = src.size
    px = src.load()
    k = a.k or 4.2
    gw, gh = int(W / k), int(H / k)
    cells = []
    for gy in range(gh):
        row = []
        for gx in range(gw):
            sample = []
            for yy in range(int(gy * k), int((gy + 1) * k)):
                for xx in range(int(gx * k), int((gx + 1) * k)):
                    if xx < W and yy < H:
                        c = px[xx, yy]
                        if not is_bg(c):
                            sample.append(c)
            n = max(1, int(k) * int(k))
            row.append(tuple(int(statistics.median(c[i] for c in sample)) for i in range(3)) if len(sample) / n >= 0.5 else None)
        cells.append(row)
    # vertical crop to content
    rows_with = [y for y in range(gh) if any(cells[y])]
    y0, y1 = rows_with[0], rows_with[-1] + 1
    cells = cells[y0:y1]
    h = len(cells)
    # seamless tile: pick x0 in the first 12% and x1 in the last 12% whose columns match best
    def col(x):
        return [cells[y][x] for y in range(h)]

    def diff(c1, c2):
        d = 0
        for p1, p2 in zip(c1, c2):
            if (p1 is None) != (p2 is None):
                d += 3000
            elif p1:
                d += sum((p1[i] - p2[i]) ** 2 for i in range(3)) ** 0.5
        return d
    best = None
    span = max(4, gw // 8)
    for x0 in range(0, span):
        c0 = col(x0)
        for x1 in range(gw - span, gw):
            d = diff(c0, col(x1)) + diff(col(x0 + 1), col(min(gw - 1, x1 + 1))) * 0.5
            if best is None or d < best[0]:
                best = (d, x0, x1)
    _, x0, x1 = best
    cells = [r[x0:x1] for r in cells]
    width = x1 - x0
    opaque = [c for r in cells for c in r if c]

    def layer_class(c):
        import colorsys
        h, sat, v = colorsys.rgb_to_hsv(*(x / 255 for x in c))
        if 0.105 <= h <= 0.18 and sat >= 0.40 and v >= 0.72:
            return "light"            # lit windows, lamp heads: must survive quantization
        if c[2] > c[0] + 35 and c[2] > c[1] + 10:
            return "blue"             # bunting
        return "other"

    budget = {"light": 3, "blue": 3}
    budget["other"] = max(4, a.colors - 6)
    mapping = {}
    for cls in ("other", "light", "blue"):
        group = [c for c in opaque if layer_class(c) == cls]
        if not group:
            continue
        n = min(budget[cls], len(set(group)))
        strip = Image.new("RGB", (len(group), 1))
        strip.putdata(group)
        q = strip.quantize(colors=n, method=Image.Quantize.MEDIANCUT)
        pal = q.getpalette()[: n * 3]
        cpal = [tuple(pal[i:i + 3]) for i in range(0, len(pal), 3)]
        indices = list(q.get_flattened_data()) if hasattr(q, "get_flattened_data") else list(q.getdata())
        for c, i in zip(group, indices):
            mapping[c] = cpal[i]
    # Clean pass: a pixel that matches none of its 8 neighbours is generator noise, not detail;
    # it takes the most common neighbouring colour (runs twice). Edges and 2px features survive.
    grid = [[mapping[c] if c else None for c in r] for r in cells]
    if a.clean:
        from collections import Counter as _C
        for _ in range(2):
            nxt = [row[:] for row in grid]
            for y in range(1, len(grid) - 1):
                for x in range(1, width - 1):
                    c = grid[y][x]
                    if c is None:
                        continue
                    nb = [grid[y + dy][x + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if (dy or dx)]
                    if c not in nb:
                        opaque_nb = [n for n in nb if n is not None]
                        if len(opaque_nb) >= 6:
                            nxt[y][x] = _C(opaque_nb).most_common(1)[0][0]
            grid = nxt
    palette = sorted(set(c for r in grid for c in r if c), key=lambda c: 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2])
    chars = {c: CHARS[i] for i, c in enumerate(palette)}
    sha = hashlib.sha256(pathlib.Path(a.src).read_bytes()).hexdigest()
    name = a.names.split(",")[0]
    lines = [
        "@split",
        f"# PIXELIZED LAYER by scripts/worlds/pixelize.py --layer from {a.source_id or a.src} (sha256 {sha[:16]}…)",
        f"# native grid k={k} source px per logical px; seamless tile columns {x0}..{x1} (seam score {best[0]:.0f}); colours={len(palette)}; clean={a.clean}",
        ". transparent",
    ] + [f"{chars[c]} #{c[0]:02x}{c[1]:02x}{c[2]:02x}" for c in palette]
    lines.append("")
    lines.append(f"@frame {name} {width}x{h} anchor=0,{h - 1}")
    for r in grid:
        lines.append("".join(chars[c] if c else "." for c in r))
    pathlib.Path(a.out).write_text(NL.join(lines) + NL, encoding="utf-8")
    print(f"{a.out}: layer {width}x{h}, {len(palette)} colours, seam {x0}..{x1} score {best[0]:.0f}")


if __name__ == "__main__":
    main()
