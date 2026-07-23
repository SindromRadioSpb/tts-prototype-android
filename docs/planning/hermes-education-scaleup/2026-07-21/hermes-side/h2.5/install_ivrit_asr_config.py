#!/usr/bin/env python3
"""Idempotently add only the H2.5 MCP mapping to live Hermes config."""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import yaml

CONFIG = Path(os.environ.get("HERMES_CONFIG", "/home/hermeswebui/.hermes/config.yaml"))
SERVER_NAME = "ivrit_asr"
SERVER = {
    "command": "/bin/sh",
    "args": [
        "-lc",
        'exec "${HERMES_HOME:-$HOME/.hermes}/mcp-runtimes/asr-py312/bin/python" '
        "/workspace/mcp-servers/ivrit-asr/ivrit_asr_mcp.py",
    ],
    "env": {
        "IVRIT_ASR_INBOX": "/workspace/voice-inbox",
        "IVRIT_ASR_MODEL_DIR": "/workspace/models/ivrit-ai-whisper-large-v3-turbo-ct2",
        "IVRIT_ASR_CPU_THREADS": "6",
    },
    "enabled": True,
    "supports_parallel_tool_calls": False,
    "timeout": 300,
    "connect_timeout": 30,
    "tools": {"include": ["transcribe_audio"], "resources": False, "prompts": False},
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--remove", action="store_true")
    args = parser.parse_args()

    document = yaml.safe_load(CONFIG.read_text(encoding="utf-8")) or {}
    servers = document.setdefault("mcp_servers", {})
    before = sha256(CONFIG)

    if args.remove:
        changed = servers.pop(SERVER_NAME, None) is not None
        action = "removed"
    else:
        changed = servers.get(SERVER_NAME) != SERVER
        servers[SERVER_NAME] = SERVER
        action = "installed"

    if not changed:
        print(f"NO_CHANGE action={action} sha256={before}")
        return

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = CONFIG.with_name(f"config.yaml.pre-h2.5-{stamp}.bak")
    shutil.copy2(CONFIG, backup)
    rendered = yaml.safe_dump(document, allow_unicode=True, sort_keys=False)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=CONFIG.parent, delete=False) as tmp:
        tmp.write(rendered)
        temp_path = Path(tmp.name)
    os.replace(temp_path, CONFIG)
    print(f"OK action={action} before_sha256={before} after_sha256={sha256(CONFIG)} backup={backup.name}")


if __name__ == "__main__":
    main()
