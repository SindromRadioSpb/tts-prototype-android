"""The ASR source-size limit must be one number, and raising it must not change the status.

Owner-live 2026-09-18: a 563 MiB mobile-ready copy was refused with HTTP 413 and the exact
detail "source exceeds 300 MiB". Two traps were sitting in that path:

1. The limit lived in ASR_MAX_SOURCE_BYTES, but the message carried its own hardcoded "300
   MiB", so the two could drift and tell the user a number that was no longer enforced.
2. main.py chose 413-vs-400 by testing for the substring "300 MiB". Raising the constant
   without touching that string would have silently downgraded the refusal to 400 — the
   client maps status codes, so the honest "too large" answer would have become a generic
   bad-request.

Both are guarded here so the limit can be changed by editing one constant.
"""

import re
from pathlib import Path

from ai_local.asr_constants import ASR_MAX_SOURCE_BYTES
from ai_local.asr_jobs import SourceTooLarge

SRC = Path(__file__).resolve().parents[1] / "ai_local"


def test_limit_is_the_configured_seven_hundred_mib():
    assert ASR_MAX_SOURCE_BYTES == 700 * 1024 * 1024


def test_refusal_names_the_limit_that_is_actually_enforced():
    message = str(SourceTooLarge())
    found = re.search(r"(\d+)\s*MiB", message)
    assert found, f"the refusal must name a MiB limit, got: {message!r}"
    assert int(found.group(1)) * 1024 * 1024 == ASR_MAX_SOURCE_BYTES


def test_no_hardcoded_limit_is_left_to_drift():
    for name in ("asr_jobs.py", "main.py"):
        text = (SRC / name).read_text(encoding="utf-8")
        assert "300 MiB" not in text, f"{name} still carries a hardcoded 300 MiB"


def test_too_large_maps_to_413_by_type_not_by_message():
    text = (SRC / "main.py").read_text(encoding="utf-8")
    assert "SourceTooLarge" in text, "main.py must recognise the dedicated exception"
    assert not re.search(r'status_code=413 if ".*MiB" in str\(exc\)', text), (
        "the status must not depend on the wording of the message"
    )


def test_source_too_large_is_still_a_value_error():
    # The manager's callers catch ValueError for every other bad input; narrowing the type
    # must not make an oversize source escape that handling.
    assert issubclass(SourceTooLarge, ValueError)
