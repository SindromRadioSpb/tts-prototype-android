"""Clean generator noise in an existing .px (keeps palette, hand edits and frame geometry).

A pixel that matches none of its 8 neighbours and sits inside an opaque area takes the most common
neighbouring colour; repeated `--passes` times. Outlines and 2px features survive.
Usage: python scripts/worlds/px-clean.py <file.px> [--frames a,b] [--passes 2]
"""
import re
import sys
from collections import Counter


def main():
    path = sys.argv[1]
    frames = None
    passes = 2
    args = sys.argv[2:]
    for i, a in enumerate(args):
        if a == "--frames":
            frames = set(args[i + 1].split(","))
        if a == "--passes":
            passes = int(args[i + 1])
    lines = open(path, encoding="utf8").read().split("\n")
    i = 0
    changed = 0
    while i < len(lines):
        m = re.match(r"@frame (\S+) (\d+)x(\d+)", lines[i])
        if not m:
            i += 1
            continue
        fid, w, h = m.group(1), int(m.group(2)), int(m.group(3))
        rows = [list(r) for r in lines[i + 1:i + 1 + h]]
        if frames is None or fid in frames:
            for _ in range(passes):
                nxt = [r[:] for r in rows]
                for y in range(1, h - 1):
                    for x in range(1, w - 1):
                        c = rows[y][x]
                        if c == ".":
                            continue
                        nb = [rows[y + dy][x + dx] for dy in (-1, 0, 1) for dx in (-1, 0, 1) if dy or dx]
                        if c not in nb:
                            opaque = [n for n in nb if n != "."]
                            if len(opaque) >= 7:
                                nxt[y][x] = Counter(opaque).most_common(1)[0][0]
                                changed += 1
                rows = nxt
            for k in range(h):
                lines[i + 1 + k] = "".join(rows[k])
        i += 1 + h
    text = "\n".join(lines)
    if changed and "# CLEANED" not in text:
        text = f"# CLEANED by scripts/worlds/px-clean.py ({changed} isolated pixels)\n" + text
    open(path, "w", encoding="utf8", newline="").write(text)
    print(path, "cleaned", changed)


if __name__ == "__main__":
    main()
