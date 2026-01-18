import json
import os
import re
import sys

DENY_REGEX = re.compile(
    r"(^|/|\\)"
    r"(\.env(\..*)?|.*secret.*|.*secrets.*|.*token.*|.*apikey.*|.*api_key.*|.*credentials.*|id_rsa.*|.*\.pem)$",
    re.IGNORECASE,
)

def _get_path(payload: dict) -> str:
    tool_input = payload.get("tool_input") or {}
    # Claude Code hook payloads usually have path/file_path
    return (tool_input.get("path") or tool_input.get("file_path") or "").strip()

def main() -> int:
    raw = sys.stdin.read().strip()
    if not raw:
        return 0

    try:
        payload = json.loads(raw)
    except Exception:
        # If format is unexpected, do not hard-fail
        return 0

    path = _get_path(payload)
    if not path:
        return 0

    norm = path.replace("\\", "/")
    base = os.path.basename(norm)

    # deny by basename or full path
    if DENY_REGEX.search(norm) or DENY_REGEX.search(base):
        sys.stderr.write(
            "Blocked access to potentially sensitive file by policy.\n"
            f"Path: {path}\n"
        )
        return 2  # exit code 2 blocks tool call

    return 0

if __name__ == "__main__":
    sys.exit(main())
