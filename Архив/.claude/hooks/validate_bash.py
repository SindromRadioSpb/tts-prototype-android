import json
import re
import sys

DENY_PATTERNS = [
    r"\brm\b\s+-rf\b",
    r"\bgit\b\s+clean\b\s+-f[dD]\b",
    r"\bgit\b\s+reset\b\s+--hard\b",
    r"\bgit\b\s+push\b",
    r"\bmkfs\.",
    r"\bdd\b\s+if=",
    r"\bshutdown\b|\breboot\b",
    r"\bcurl\b.+\|\s*(bash|sh)\b",
    r"\bwget\b.+\|\s*(bash|sh)\b",
    r"\bdel\b\s+/s\b",
    r"\brmdir\b\s+/s\b"
]

def main() -> int:
    raw = sys.stdin.read().strip()
    if not raw:
        return 0

    try:
        payload = json.loads(raw)
    except Exception:
        return 0

    tool_input = payload.get("tool_input") or {}
    cmd = (tool_input.get("command") or "").strip()

    if not cmd:
        return 0

    for pat in DENY_PATTERNS:
        if re.search(pat, cmd, flags=re.IGNORECASE):
            sys.stderr.write(
                "Blocked potentially destructive command by policy.\n"
                f"Command: {cmd}\n"
            )
            return 2

    return 0

if __name__ == "__main__":
    sys.exit(main())
