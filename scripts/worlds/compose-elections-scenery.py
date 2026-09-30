"""Compose hand-drawn sky stamps for Israel Elections 2026 → art/worlds/israel-elections-2026/scenery-sky-*.px

Clouds, sun, moon and birds are small hand stamps; terrain and buildings are generated art
(art/worlds/israel-elections-2026/gen, pixel-normalized by pixelize.py). The unused building and
terrain helpers stay here as documented primitives for quick stand-ins. Re-run: python scripts/worlds/compose-elections-scenery.py

Every sheet is authored ONCE with semantic palette letters and emitted in three lightings
(day / dusk / night) by palette substitution, so geometry is identical across lightings.
No lettering, no party colours, no religious sites, no real logos.
"""
import math
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "art" / "worlds" / "israel-elections-2026"

# Semantic palette letters → colour per lighting.
PAL = {
    "k": ("#1b1f2e", "#1b1523", "#070a16"),   # outline
    "f": ("#a7bccd", "#6e5b8a", "#1b2548"),   # far hills
    "F": ("#bccdda", "#826c9b", "#233058"),   # far hills highlight
    "n": ("#86a86f", "#57566d", "#131c36"),   # near hills
    "N": ("#9dbd83", "#6b697f", "#1a2544"),   # near hills highlight
    "o": ("#76a05f", "#4b4a60", "#0f172d"),   # olive trees
    "g": ("#d6c49c", "#9a7b72", "#232a45"),   # ground stone
    "G": ("#c2ab80", "#86695f", "#1b2138"),   # ground joint
    "h": ("#e8dbbb", "#b39185", "#2d3556"),   # ground highlight
    "c": ("#ffffff", "#f7c7a6", "#2b3666"),   # cloud
    "C": ("#dde8f4", "#dc9d8d", "#212a54"),   # cloud shade
    "s": ("#e3d5b3", "#b58f84", "#3b4262"),   # stone wall
    "S": ("#c4ae84", "#946f68", "#2c3150"),   # stone shade
    "w": ("#6f6488", "#5d4b6d", "#f2c86a"),   # window (lit at night)
    "W": ("#8e82a6", "#7a6488", "#ffe29a"),   # window glint
    "r": ("#b8563f", "#8e4238", "#5a2a2a"),   # brick / roof tile
    "R": ("#d0735a", "#a8544a", "#6e3533"),   # brick highlight
    "b": ("#1b4fb8", "#2a3f8c", "#3a63c9"),   # tchelet
    "B": ("#7aa0ec", "#6a78b8", "#5d86e0"),   # light tchelet
    "p": ("#f7f4ea", "#e8cdbd", "#4a5378"),   # blank poster / paper
    "q": ("#c9c3b1", "#b79f97", "#3a4266"),   # poster shade
    "m": ("#5b6270", "#4b4458", "#2a3050"),   # metal / machine
    "M": ("#8a93a3", "#6f6680", "#454e78"),   # metal highlight
    "t": ("#4f7a52", "#3d4f4a", "#182e2a"),   # cypress
    "T": ("#365a3c", "#2d3b39", "#10211e"),   # cypress shade
    "y": ("#f4c542", "#f4a642", "#f4c542"),   # sun / spark
    "Y": ("#fff3b0", "#ffd9a0", "#fff3b0"),   # bright spark
    "u": ("#e9e3cf", "#e9e3cf", "#e9e3cf"),   # moon
    "U": ("#c9c2a8", "#c9c2a8", "#c9c2a8"),   # moon shade
    "e": ("#e4574a", "#e4574a", "#ff6b5b"),   # firework red
    "E": ("#6bd0ff", "#6bd0ff", "#7fe0ff"),   # firework cyan
    "z": ("#2b3040", "#241f30", "#0b0f1d"),   # dark screen
    "Z": ("#4a8fd8", "#4a7fc8", "#6ab0ff"),   # screen glow
    "l": ("#3a3f52", "#2f2a3d", "#0d1122"),   # bird
}
LIGHTS = ("day", "dusk", "night")


def grid(w, h, ch="."):
    return [[ch] * w for _ in range(h)]


def rows(g):
    return ["".join(r) for r in g]


def rect(g, x, y, w, h, ch):
    for yy in range(max(0, y), min(len(g), y + h)):
        for xx in range(max(0, x), min(len(g[0]), x + w)):
            g[yy][xx] = ch


def outline(g, x, y, w, h, ch="k"):
    rect(g, x, y, w, 1, ch); rect(g, x, y + h - 1, w, 1, ch)
    rect(g, x, y, 1, h, ch); rect(g, x + w - 1, y, 1, h, ch)


def stamp(g, art, x, y):
    for dy, row in enumerate(art):
        for dx, c in enumerate(row):
            if c != "." and 0 <= y + dy < len(g) and 0 <= x + dx < len(g[0]):
                g[y + dy][x + dx] = c


def periodic_noise(x, period, seed, octaves=((1, 1.0), (2, 0.5), (5, 0.22), (11, 0.1))):
    return sum(a * math.sin(2 * math.pi * (k * x / period) + seed * (i + 1) * 1.7) for i, (k, a) in enumerate(octaves))


def hills(w, h, base, amp, seed, fill, hi, trees=None):
    g = grid(w, h)
    for x in range(w):
        top = int(round(h - base - amp * periodic_noise(x, w, seed)))
        top = max(0, min(h - 1, top))
        for y in range(top, h):
            g[y][x] = fill
        g[top][x] = hi
        if trees and (x * 7 + seed) % trees == 0 and top > 2:
            g[top - 1][x] = "o"; g[top - 2][x] = "o"; g[top - 1][x - 1 if x else 0] = "o"
    return g


def ground(w=32, h=8):
    g = grid(w, h, "g")
    rect(g, 0, 0, w, 1, "h")
    for y in (3, 6):
        rect(g, 0, y, w, 1, "G")
    for y0, off in ((1, 0), (4, 8), (7, 0)):
        for x in range(off, w, 16):
            for y in range(y0, min(h, y0 + 2)):
                g[y][x] = "G"
    return g


CLOUD_A = [
    "......cccc..........",
    "....ccccccc...cc....",
    "..cccccccccccccccc..",
    ".cccccccccccccccccc.",
    "CCCccccccccccccccCCC",
    ".CCCCCCCCCCCCCCCCCC.",
]
CLOUD_B = [
    "....ccc.......",
    "..cccccccc....",
    ".ccccccccccc..",
    "CCccccccccccCC",
    ".CCCCCCCCCCCC.",
]
SUN = [
    "...y...",
    ".yYYYy.",
    ".YYYYY.",
    "yYYYYYy",
    ".YYYYY.",
    ".yYYYy.",
    "...y...",
]
MOON = [
    "..uuu..",
    ".uuuUu.",
    "uuuu...",
    "uuuu...",
    "uuuU...",
    ".uuuUu.",
    "..uuu..",
]
BIRD_1 = ["l...l", ".l.l.", "..l.."]
BIRD_2 = [".....", "lllll", "..l.."]


def building_hq():
    """Campaign HQ: two storeys, blank banner, poster wall, megaphone on the roof."""
    w, h = 56, 40
    g = grid(w, h)
    rect(g, 4, 12, 40, 28, "s"); outline(g, 4, 12, 40, 28)
    rect(g, 40, 13, 3, 26, "S")
    rect(g, 3, 11, 42, 2, "k")
    # megaphone on the roof (a cone + stand)
    stamp(g, ["..kk....", ".kmMk...", "kmMMMkk.", ".kmMk.kk", "..kk...."], 30, 4)
    rect(g, 32, 9, 1, 2, "k")
    # blank banner on the facade (tchelet band with light border)
    rect(g, 8, 15, 32, 6, "B"); rect(g, 9, 16, 30, 4, "b"); outline(g, 8, 15, 32, 6)
    # windows row
    for x in (8, 16, 24, 32):
        rect(g, x, 24, 4, 4, "w"); rect(g, x, 24, 1, 1, "W"); outline(g, x - 1, 23, 6, 6)
    # door
    rect(g, 20, 31, 8, 9, "m"); rect(g, 21, 32, 6, 8, "M"); outline(g, 20, 31, 8, 9)
    # poster wall on the side: blank posters, some half-pasted
    for i, x in enumerate((46, 51)):
        rect(g, x, 22 + (i % 2) * 3, 4, 6, "p"); rect(g, x, 26 + (i % 2) * 3, 4, 1, "q"); outline(g, x - 1, 21 + (i % 2) * 3, 6, 8)
    rect(g, 44, 34, 12, 6, "s"); outline(g, 44, 34, 12, 6)
    return g


def building_press(frame):
    """Ballot printing house: brick, big window with a press, chimney smoke (3 frames)."""
    w, h = 60, 48
    g = grid(w, h)
    rect(g, 6, 18, 46, 30, "r"); outline(g, 6, 18, 46, 30)
    for y in range(20, 47, 3):
        for x in range(7 + (y % 2) * 3, 51, 6):
            g[y][x] = "R"
    # saw-tooth roof
    for i in range(4):
        x0 = 6 + i * 11
        for d in range(6):
            rect(g, x0 + d, 17 - d, 11 - d, 1, "k" if d == 5 else "S")
    # chimney + smoke
    rect(g, 44, 6, 5, 12, "r"); outline(g, 44, 6, 5, 12)
    puffs = [[(45, 3), (47, 1)], [(46, 2), (44, 0)], [(47, 3), (45, 1)]][frame]
    for (x, y) in puffs:
        stamp(g, [".cc.", "cccc", ".CC."], x, y)
    # big window with the press: rollers turn (frame) and a paper sheet slides out
    rect(g, 12, 24, 30, 16, "z"); outline(g, 11, 23, 32, 18)
    rect(g, 16, 30, 16, 6, "m"); outline(g, 15, 29, 18, 8)
    for i, x in enumerate(range(17, 31, 4)):
        g[31 + (i + frame) % 2][x] = "M"
    rect(g, 33 + frame * 2, 33, 5, 3, "p"); rect(g, 33 + frame * 2, 35, 5, 1, "q")
    # stacked blank ballot papers outside
    for i in range(4):
        rect(g, 52, 44 - i * 2, 7, 2, "p" if i % 2 == 0 else "q")
    outline(g, 51, 37, 9, 11)
    return g


def building_polling():
    """Polling station in a school: low block, flag pole with a small flag, blank sign."""
    w, h = 64, 40
    g = grid(w, h)
    rect(g, 2, 16, 52, 24, "s"); outline(g, 2, 16, 52, 24)
    rect(g, 50, 17, 3, 22, "S")
    rect(g, 1, 14, 54, 3, "r"); outline(g, 1, 14, 54, 3)
    for x in range(6, 48, 9):
        rect(g, x, 21, 5, 6, "w"); rect(g, x, 21, 5, 1, "W"); outline(g, x - 1, 20, 7, 8)
    # entrance with a blank sign board above it
    rect(g, 22, 30, 12, 10, "m"); outline(g, 22, 30, 12, 10)
    rect(g, 20, 27, 16, 3, "p"); outline(g, 20, 27, 16, 3)
    # flag pole + flag (tchelet stripes on white, no emblem at this size)
    rect(g, 58, 2, 1, 38, "k")
    stamp(g, ["pppppp", "bbbbbb", "pppppp", "pppppp", "bbbbbb", "pppppp"], 59, 3)
    outline(g, 58, 2, 8, 8)
    return g


def building_count(frame):
    """Counting night: studio block with a wall of screens + fireworks above (4 frames)."""
    w, h = 64, 60
    g = grid(w, h)
    rect(g, 4, 28, 50, 32, "s"); outline(g, 4, 28, 50, 32)
    rect(g, 3, 26, 52, 3, "k")
    # a 3x2 wall of screens showing abstract colour-bar patterns (no numbers, no ranking)
    for i in range(3):
        for j in range(2):
            x, y = 9 + i * 15, 32 + j * 11
            rect(g, x, y, 12, 8, "z"); outline(g, x - 1, y - 1, 14, 10)
            for b in range(4):
                hgt = 2 + ((b + i + j + frame) % 4)
                rect(g, x + 1 + b * 3, y + 8 - hgt, 2, hgt, "Z" if (b + frame) % 2 else "B")
    # antenna mast
    rect(g, 44, 14, 1, 12, "k"); rect(g, 41, 16, 7, 1, "k"); rect(g, 42, 20, 5, 1, "k")
    g[13][44] = "e" if frame % 2 else "k"
    # fireworks: bursts at different stages per frame
    bursts = [(14, 8, "e"), (32, 5, "E"), (52, 10, "y")]
    for n, (cx, cy, ch) in enumerate(bursts):
        r = (frame + n) % 4
        if r == 0:
            g[cy + 3][cx] = "Y"
        else:
            for a in range(8):
                ang = a * math.pi / 4
                px, py = int(round(cx + math.cos(ang) * r * 1.6)), int(round(cy + math.sin(ang) * r * 1.2))
                if 0 <= px < w and 0 <= py < h:
                    g[py][px] = ch if r < 3 else "Y"
    return g


def emit(name, frames, header):
    lines = [header, "@split" if name.startswith("scenery-tile") else "", ". transparent"]
    for L_i, light in enumerate(LIGHTS):
        pass
    # One .px per lighting variant keeps each atlas a single palette.
    for li, light in enumerate(LIGHTS):
        pal = [". transparent"] + [f"{k} {v[li]}" for k, v in PAL.items()]
        body = []
        for fid, g in frames:
            h, w = len(g), len(g[0])
            anchor = f" anchor={w // 2},{h - 1}"
            body.append(f"@frame {fid} {w}x{h}{anchor}\n" + "\n".join(rows(g)))
        split = "@split\n" if name == "scenery-tiles" else ""
        text = f"{split}# {header}\n# GENERATED by scripts/worlds/compose-elections-scenery.py — art v0 ({light}).\n" + \
            "\n".join(pal) + "\n\n" + "\n\n".join(body) + "\n"
        (OUT / f"{name}-{light}.px").write_text(text, encoding="utf-8")


emit("scenery-sky", [
    ("cloud-a", [list(r) for r in CLOUD_A]),
    ("cloud-b", [list(r) for r in CLOUD_B]),
    ("sun", [list(r) for r in SUN]),
    ("moon", [list(r) for r in MOON]),
    ("bird-1", [list(r) for r in BIRD_1]),
    ("bird-2", [list(r) for r in BIRD_2]),
], "Sky stamps: clouds, sun, moon, birds (hand-drawn).")

print("wrote scenery-*.px in", OUT.relative_to(ROOT))
