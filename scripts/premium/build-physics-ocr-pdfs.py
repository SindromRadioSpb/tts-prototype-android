#!/usr/bin/env python3
"""Build the three approved page-faithful Physics OCR PDF batches."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import time
from datetime import date
from pathlib import Path

from PIL import Image


PAGE_RE = re.compile(r"Страница_(\d+)_")
BATCHES = (
    {"id": 1, "chapters": [1, 2, 3], "first_page": 5, "last_page": 18},
    {"id": 2, "chapters": [4, 5, 6], "first_page": 19, "last_page": 29},
    {"id": 3, "chapters": [7, 8, 9], "first_page": 30, "last_page": 43},
)
MAX_PDF_BYTES = 6 * 1024 * 1024
FIXED_PDF_TIME = time.gmtime(0)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def source_commit(repo: Path) -> str:
    return subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=repo, text=True, encoding="utf-8"
    ).strip()


def load_sources(source_dir: Path) -> dict[int, Path]:
    pages: dict[int, Path] = {}
    for path in source_dir.glob("*.png"):
        match = PAGE_RE.search(path.name)
        if not match:
            continue
        page = int(match.group(1))
        if page in pages:
            raise RuntimeError(f"duplicate textbook page {page}: {path.name}")
        pages[page] = path
    expected = set(range(5, 44))
    if set(pages) != expected:
        raise RuntimeError(
            f"expected textbook pages 05..43, missing={sorted(expected-set(pages))}, extra={sorted(set(pages)-expected)}"
        )
    return pages


def save_pdf(paths: list[Path], destination: Path, quality: int) -> None:
    frames: list[Image.Image] = []
    try:
        for path in paths:
            with Image.open(path) as source:
                frame = source.convert("RGB")
                frame.info["dpi"] = (200, 200)
                frames.append(frame)
        destination.parent.mkdir(parents=True, exist_ok=True)
        frames[0].save(
            destination,
            "PDF",
            save_all=True,
            append_images=frames[1:],
            resolution=200.0,
            quality=quality,
            optimize=True,
            creationDate=FIXED_PDF_TIME,
            modDate=FIXED_PDF_TIME,
        )
    finally:
        for frame in frames:
            frame.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--stable", required=True, type=Path)
    parser.add_argument("--quality", type=int, default=86)
    args = parser.parse_args()

    repo = Path(__file__).resolve().parents[2]
    pages = load_sources(args.source)
    args.output.mkdir(parents=True, exist_ok=True)
    args.stable.mkdir(parents=True, exist_ok=True)

    manifest = {
        "schema": "linguistpro-physics-ocr-batches-v1",
        "generated_on": date.today().isoformat(),
        "source_commit": source_commit(repo),
        "source_directory": str(args.source),
        "pdf_quality": args.quality,
        "max_pdf_bytes": MAX_PDF_BYTES,
        "batches": [],
    }

    for batch in BATCHES:
        page_numbers = list(range(batch["first_page"], batch["last_page"] + 1))
        source_paths = [pages[number] for number in page_numbers]
        name = f"physics-year1-ocr-batch-{batch['id']:02d}.pdf"
        output_pdf = args.output / name
        save_pdf(source_paths, output_pdf, args.quality)
        size = output_pdf.stat().st_size
        if size >= MAX_PDF_BYTES:
            raise RuntimeError(f"{name} is {size} bytes; must be below {MAX_PDF_BYTES}")
        stable_pdf = args.stable / name
        shutil.copyfile(output_pdf, stable_pdf)
        if sha256(output_pdf) != sha256(stable_pdf):
            raise RuntimeError(f"stable copy hash mismatch: {name}")

        source_items = []
        for pdf_page_index, (textbook_page, source_path) in enumerate(
            zip(page_numbers, source_paths), start=1
        ):
            with Image.open(source_path) as image:
                width, height = image.size
            source_items.append(
                {
                    "pdf_page_index": pdf_page_index,
                    "textbook_page": textbook_page,
                    "source_filename": source_path.name,
                    "source_sha256": sha256(source_path),
                    "source_bytes": source_path.stat().st_size,
                    "width": width,
                    "height": height,
                }
            )
        manifest["batches"].append(
            {
                "batch_id": batch["id"],
                "chapters": batch["chapters"],
                "textbook_pages": [batch["first_page"], batch["last_page"]],
                "pdf_filename": name,
                "pdf_sha256": sha256(stable_pdf),
                "pdf_bytes": stable_pdf.stat().st_size,
                "page_count": len(source_items),
                "pages": source_items,
            }
        )
        page_manifest = [
            {
                "pageIndex": item["pdf_page_index"],
                "sourceFilename": item["source_filename"],
                "sourceSha256": item["source_sha256"],
                "sourcePage": item["textbook_page"],
            }
            for item in source_items
        ]
        (args.stable / f"page-manifest-batch-{batch['id']:02d}.json").write_text(
            json.dumps(page_manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    manifest_path = args.stable / "source-manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    summary = {
        "manifest": str(manifest_path),
        "batches": [
            {"file": batch["pdf_filename"], "bytes": batch["pdf_bytes"], "sha256": batch["pdf_sha256"]}
            for batch in manifest["batches"]
        ],
    }
    print(json.dumps(summary, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
