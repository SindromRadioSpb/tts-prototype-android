#!/usr/bin/env python3
"""Render every Physics OCR PDF page and verify page order, hashes and raster fidelity."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
from pathlib import Path

import fitz
from PIL import Image, ImageChops, ImageDraw, ImageFont, ImageStat


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def psnr(reference: Image.Image, rendered: Image.Image) -> float:
    ref = reference.convert("RGB").resize(rendered.size, Image.Resampling.LANCZOS)
    diff = ImageChops.difference(ref, rendered.convert("RGB"))
    stat = ImageStat.Stat(diff)
    mse = sum(value * value for value in stat.rms) / 3.0
    return 99.0 if mse == 0 else 20.0 * math.log10(255.0 / math.sqrt(mse))


def contact_sheet(rendered: list[tuple[int, Path]], destination: Path) -> None:
    thumb_w, thumb_h, label_h, columns = 360, 580, 28, 3
    rows = math.ceil(len(rendered) / columns)
    sheet = Image.new("RGB", (columns * thumb_w, rows * (thumb_h + label_h)), "white")
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default(size=18)
    for index, (textbook_page, image_path) in enumerate(rendered):
        with Image.open(image_path) as source:
            thumb = source.convert("RGB")
            thumb.thumbnail((thumb_w - 12, thumb_h - 12), Image.Resampling.LANCZOS)
            col, row = index % columns, index // columns
            x = col * thumb_w + (thumb_w - thumb.width) // 2
            y = row * (thumb_h + label_h) + label_h
            sheet.paste(thumb, (x, y))
            draw.text((col * thumb_w + 8, row * (thumb_h + label_h) + 4), f"textbook page {textbook_page:02d}", fill="black", font=font)
    destination.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(destination, quality=92)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stable", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--render-dir", required=True, type=Path)
    args = parser.parse_args()

    manifest = json.loads((args.stable / "source-manifest.json").read_text(encoding="utf-8"))
    if args.render_dir.exists():
        shutil.rmtree(args.render_dir)
    args.render_dir.mkdir(parents=True)
    report = {"schema": "linguistpro-physics-ocr-pdf-verify-v1", "batches": []}

    for batch in manifest["batches"]:
        pdf = args.stable / batch["pdf_filename"]
        output_pdf = args.output / batch["pdf_filename"]
        if sha256(pdf) != batch["pdf_sha256"] or sha256(output_pdf) != batch["pdf_sha256"]:
            raise RuntimeError(f"PDF hash mismatch: {pdf.name}")
        document = fitz.open(pdf)
        if document.page_count != batch["page_count"]:
            raise RuntimeError(f"page count mismatch: {pdf.name}")
        batch_render_dir = args.render_dir / f"batch-{batch['batch_id']:02d}"
        batch_render_dir.mkdir(parents=True)
        page_results = []
        rendered_paths = []
        try:
            for page_index, source_item in enumerate(batch["pages"]):
                page = document.load_page(page_index)
                pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                render_path = batch_render_dir / f"page-{page_index + 1:02d}-textbook-{source_item['textbook_page']:02d}.png"
                pixmap.save(render_path)
                with Image.open(render_path) as rendered, Image.open(Path(manifest["source_directory"]) / source_item["source_filename"]) as source:
                    fidelity = psnr(source, rendered)
                    gray = rendered.convert("L")
                    pixels = gray.get_flattened_data() if hasattr(gray, "get_flattened_data") else gray.getdata()
                    ink_ratio = sum(1 for value in pixels if value < 245) / (gray.width * gray.height)
                if fidelity < 30.0:
                    raise RuntimeError(f"low raster fidelity {fidelity:.2f} dB at {pdf.name} page {page_index + 1}")
                if ink_ratio < 0.001:
                    raise RuntimeError(f"blank-looking render at {pdf.name} page {page_index + 1}")
                page_results.append({
                    "pdf_page_index": page_index + 1,
                    "textbook_page": source_item["textbook_page"],
                    "render": str(render_path),
                    "psnr_db": round(fidelity, 2),
                    "ink_ratio": round(ink_ratio, 6),
                })
                rendered_paths.append((source_item["textbook_page"], render_path))
        finally:
            document.close()
        contact_path = args.render_dir / f"batch-{batch['batch_id']:02d}-contact.jpg"
        contact_sheet(rendered_paths, contact_path)
        report["batches"].append({
            "batch_id": batch["batch_id"],
            "pdf": str(pdf),
            "page_count": len(page_results),
            "min_psnr_db": min(item["psnr_db"] for item in page_results),
            "max_psnr_db": max(item["psnr_db"] for item in page_results),
            "contact_sheet": str(contact_path),
            "pages": page_results,
        })

    report_path = args.stable / "pdf-verification.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "report": str(report_path),
        "batches": [{"batch_id": item["batch_id"], "pages": item["page_count"], "min_psnr_db": item["min_psnr_db"]} for item in report["batches"]],
    }, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
