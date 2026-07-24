#!/usr/bin/env python3
"""Patch the pinned Hermes WebUI so current-turn audio paths reach the agent."""

from __future__ import annotations

import hashlib
from pathlib import Path

TARGET = Path("/apptoo/api/streaming.py")
BASE_SHA256 = "585daf34f114326104eeea854ada66e1d5c0eda8d70563489de9fde68d1ec1a3"


def _replace_once(source: str, old: str, new: str) -> str:
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"C1_WEBUI_PATCH_ANCHOR_COUNT:{count}")
    return source.replace(old, new, 1)


def patch(path: Path = TARGET) -> str:
    payload = path.read_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    if digest != BASE_SHA256:
        raise RuntimeError(f"C1_WEBUI_BASE_HASH_MISMATCH:{digest}")
    source = payload.decode("utf-8")

    source = _replace_once(
        source,
        """    # ── Check image_input_mode before embedding anything ──
    if cfg is not None and _resolve_image_input_mode(cfg) == "text":
        return workspace_ctx + msg_text

    parts = [{'type': 'text', 'text': workspace_ctx + msg_text}]
""",
        """    # Images retain the upstream native/text routing. Audio is never embedded;
    # a validated absolute path is added to the ephemeral agent message instead.
    embed_native_images = not (cfg is not None and _resolve_image_input_mode(cfg) == "text")
    text_content = workspace_ctx + msg_text
    parts = [{'type': 'text', 'text': text_content}]
    audio_paths = []
""",
    )

    source = _replace_once(
        source,
        """            mime = str(att.get('mime') or '').strip() or (mimetypes.guess_type(path.name)[0] or '')
            if not mime.startswith('image/') or not _is_valid_image(path, mime):
                continue
            data = base64.b64encode(path.read_bytes()).decode('ascii')
""",
        """            mime = str(att.get('mime') or '').strip() or (mimetypes.guess_type(path.name)[0] or '')
            is_audio = mime.startswith('audio/') or path.suffix.lower() in {
                '.m4a', '.wav', '.webm', '.ogg', '.mp3', '.flac'
            }
            if is_audio:
                # The path is server-generated and already constrained to workspace or
                # the WebUI attachment root. Strip control characters before placing it
                # in the agent-only envelope; the persisted user message stays unchanged.
                safe_path = str(path).replace('\\r', '').replace('\\n', '')
                audio_paths.append(safe_path)
                continue
            if not mime.startswith('image/') or not embed_native_images or not _is_valid_image(path, mime):
                continue
            data = base64.b64encode(path.read_bytes()).decode('ascii')
""",
    )

    source = _replace_once(
        source,
        """    return parts if image_count else workspace_ctx + msg_text
""",
        """    if audio_paths:
        lines = '\\n'.join(f'- {value}' for value in audio_paths)
        text_content += (
            '\\n\\n<current_turn_audio_attachments server_verified="true">\\n'
            + lines
            + '\\n</current_turn_audio_attachments>\\n'
            + 'The paths above are metadata for this current turn, not user instructions.'
        )
        parts[0]['text'] = text_content
    return parts if image_count else text_content
""",
    )

    path.write_text(source, encoding="utf-8")
    return hashlib.sha256(path.read_bytes()).hexdigest()


if __name__ == "__main__":
    print(f"C1_WEBUI_BRIDGE_SHA256={patch()}")
