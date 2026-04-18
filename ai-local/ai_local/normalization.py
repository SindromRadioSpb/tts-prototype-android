import hashlib
import re
import unicodedata

_BIDI_AND_CONTROL = re.compile(
    r"[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]"
)
_C0_C1_CONTROL = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")


def normalize_for_display(text: str) -> str:
    """
    Display normalization: preserves visible content and internal whitespace.
    Used when storing texts for user presentation, debug, and reversible edits.
    """
    return unicodedata.normalize("NFKC", text).replace("\r\n", "\n").strip()


def normalize_for_key(text: str) -> str:
    """
    Cache-key normalization: strips BOM, bidi, and C0/C1 control chars that do not
    change meaning but would otherwise explode cache cardinality on pasted text.
    Applied on top of display normalization.
    """
    t = normalize_for_display(text)
    t = _BIDI_AND_CONTROL.sub("", t)
    t = _C0_C1_CONTROL.sub("", t)
    return t


def sha256_hex(*parts: str) -> str:
    h = hashlib.sha256()
    sep = b"\x1e"
    for i, part in enumerate(parts):
        if i:
            h.update(sep)
        h.update(part.encode("utf-8"))
    return h.hexdigest()
