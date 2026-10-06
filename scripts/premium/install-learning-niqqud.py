#!/usr/bin/env python3
"""Install already finalized immutable study assets into an existing corpus volume.
Verify every staged asset and unchanged published source before any installation.
No source, existing asset, database or learner file is overwritten.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil


def digest(path):
    value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def install(release, corpus):
    release, corpus = Path(release).resolve(strict=True), Path(corpus).resolve(strict=True)
    plan = json.loads((release / "files.json").read_text(encoding="utf-8"))
    items, summary = plan["files"], plan["summary"]
    if len(items) != summary["expected"] or summary["finalized"] != len(items):
        raise ValueError("Incomplete finalized release")
    seen, targets = set(), []
    for item in items:
        identifier, sha = item["id"], item["sha256"]
        name = item["file"]
        if not re.fullmatch(r"[0-9]{1,8}", identifier) or identifier in seen:
            raise ValueError("Invalid or duplicate work ID")
        seen.add(identifier)
        if not re.fullmatch(r"[a-f0-9]{64}", sha) or name != identifier + "-" + sha[:32] + ".json":
            raise ValueError("Invalid immutable asset name")
        relative_source = item["source_file"]
        if not re.fullmatch(r"works/" + identifier + r"(?:-[a-f0-9]{32})?\.json", relative_source):
            raise ValueError("Invalid source path")
        source = (corpus / relative_source).resolve(strict=True)
        layer = (release / "learning-niqqud" / name).resolve(strict=True)
        target = (corpus / "learning-niqqud" / name).resolve()
        if not source.is_relative_to(corpus) or not layer.is_relative_to(release) or not target.is_relative_to(corpus):
            raise ValueError("Path escapes the intended directories")
        if digest(source) != item["source_sha256"]:
            raise ValueError("Published source changed: " + identifier)
        if layer.stat().st_size != item["bytes"] or digest(layer) != sha:
            raise ValueError("Invalid staged layer: " + identifier)
        if target.exists() and digest(target) != sha:
            raise ValueError("Existing immutable asset differs: " + identifier)
        targets.append((layer, target, sha))
    # All validation completes before the first volume write.
    added = 0
    for layer, target, sha in targets:
        if target.exists():
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + ".install.tmp")
        if temporary.exists():
            raise ValueError("Installation temporary file already exists")
        shutil.copyfile(layer, temporary)
        os.chmod(temporary, 0o644)
        try:
            # Exclusive creation refuses a concurrent replacement, including on Linux.
            os.link(temporary, target)
        finally:
            temporary.unlink()
        if digest(target) != sha:
            raise ValueError("Installed asset hash differs")
        added += 1
    return {"sources_verified": len(items), "layers_verified": len(items), "added": added,
            "already_present": len(items) - added, "layer_bytes": summary["layer_bytes"]}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--release", required=True)
    parser.add_argument("--corpus", required=True)
    args = parser.parse_args()
    print(json.dumps(install(args.release, args.corpus)))
