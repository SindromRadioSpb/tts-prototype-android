"""Derive day / night variants of a palette-indexed .px from its dusk original (LinguistPro Worlds).

Pixel art lives in a small palette, so lighting is a PALETTE transform: geometry never changes and
the three variants stay pixel-identical in shape. Warm light sources (windows, lamp heads) are
detected by hue/saturation/value and treated specially: dark glass by day, glowing at night.

Usage: python scripts/worlds/grade-lighting.py <dusk.px> <out-stem> [--no-lights]   → <out-stem>-day.px, <out-stem>-night.px
Frame ids are kept; a `@split` header is kept.
"""
import colorsys
import pathlib
import re
import sys


LIGHTS = True


def is_light_source(rgb):
    if not LIGHTS:
        return False
    h, s, v = colorsys.rgb_to_hsv(*(c / 255 for c in rgb))
    # warm yellow lamp/window light only; sunlit orange rock (h < 0.1) is not a light source
    return 0.105 <= h <= 0.18 and s >= 0.35 and v >= 0.70


def clamp(x):
    return max(0, min(255, int(round(x))))


def day(rgb):
    if is_light_source(rgb):
        return (104, 110, 138)  # unlit window glass
    r, g, b = rgb
    # lift, cool down the dusk cast (purple/orange → neutral daylight), gentle saturation keep
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    if 0.70 <= h <= 0.92:            # dusk purples (far hills) → hazy blue-grey
        h = 0.58 + (h - 0.70) * 0.2
        s *= 0.55
    elif h <= 0.10 or h >= 0.95:     # orange/red warm cast → sandy stone
        h = 0.10
        s *= 0.75
    l = min(0.88, l * 1.12 + 0.06)
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return clamp(r * 255), clamp(g * 255), clamp(b * 255)


def night(rgb):
    if is_light_source(rgb):
        r, g, b = rgb
        return clamp(r * 1.05 + 10), clamp(g * 1.02 + 6), clamp(b * 0.85)
    r, g, b = rgb
    return clamp(r * 0.30 + 6), clamp(g * 0.34 + 10), clamp(b * 0.52 + 30)


def main():
    global LIGHTS
    src, stem = pathlib.Path(sys.argv[1]), sys.argv[2]
    LIGHTS = "--no-lights" not in sys.argv
    text = src.read_text(encoding="utf-8")
    for name, fn in (("day", day), ("night", night)):
        def repl(m):
            rgb = tuple(int(m.group(2)[i:i + 2], 16) for i in (0, 2, 4))
            out = fn(rgb)
            return f"{m.group(1)} #{out[0]:02x}{out[1]:02x}{out[2]:02x}"
        body = re.sub(r"^(\S) #([0-9a-fA-F]{6})", repl, text, flags=re.M)
        body = body.replace("# PIXELIZED", f"# GRADED to {name} by scripts/worlds/grade-lighting.py from {src.name}\n# PIXELIZED", 1)
        pathlib.Path(f"{stem}-{name}.px").write_text(body, encoding="utf-8")
        print("wrote", f"{stem}-{name}.px")


if __name__ == "__main__":
    main()
