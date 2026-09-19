"""The Companion window speaks the language its owner chose, in every string it shows.

Owner request 2026-09-19: the window was English-only while its guides shipped in ru/en/he.
Translating a window is easy to half-do - one forgotten literal, or a placeholder dropped in
translation, and the reader loses exactly the part that carries the number. These checks are
the gate: no visible literal outside the table, no key without both languages, no placeholder
present in one language and missing in the other.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from ai_local import companion_i18n

SOURCE = (Path(__file__).resolve().parents[1] / "ai_local" / "companion.py").read_text(encoding="utf-8")
WINDOW = SOURCE[SOURCE.index("class CompanionWindow:"):SOURCE.index("def main(")]
PLACEHOLDER = re.compile(r"\{(\w+)\}")


def test_every_string_exists_in_every_language():
    for key, entry in companion_i18n.STRINGS.items():
        for language in companion_i18n.LANGUAGES:
            assert entry.get(language), "%s has no %s text" % (key, language)


def test_no_translation_drops_a_placeholder_the_english_carries():
    for key, entry in companion_i18n.STRINGS.items():
        expected = set(PLACEHOLDER.findall(entry["en"]))
        for language in companion_i18n.LANGUAGES:
            assert set(PLACEHOLDER.findall(entry[language])) == expected, key


def test_every_key_the_window_asks_for_is_defined():
    used = set(re.findall(r'self\.t\(\s*"([^"]+)"', WINDOW))
    assert used, "the window must ask the table for its text"
    unknown = sorted(key for key in used if key not in companion_i18n.STRINGS)
    assert unknown == []


def test_no_visible_text_is_hard_coded_in_the_window():
    literals = re.findall(r'text="([^"]*)"', WINDOW)
    assert literals == [], "these strings would stay English whatever the owner chooses"


def test_a_missing_key_is_visible_rather_than_silently_english():
    assert companion_i18n.translate("ru", "no.such.key") == "no.such.key"


def test_formatting_survives_a_translation_without_that_field():
    assert "0.3.0" in companion_i18n.translate("ru", "app.footer", version="0.3.0", revision="abc")


@pytest.mark.parametrize("language", companion_i18n.LANGUAGES)
def test_the_language_menu_can_name_every_supported_language(language):
    assert companion_i18n.LANGUAGE_NAMES[language]


def test_the_window_offers_the_settings_the_owner_asked_for():
    assert '"ui_language"' in WINDOW and '"media_hw_encoder"' in WINDOW
    assert "update_setting" not in WINDOW or "_store_setting" in WINDOW
