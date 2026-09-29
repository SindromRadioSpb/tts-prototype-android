"""Verify route migration without owner credentials or network access."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import yaml


class CodexRouteTest(unittest.TestCase):
    def test_subscription_route_preserves_mcp_and_separate_voice(self):
        with tempfile.TemporaryDirectory() as home:
            root = Path(home)
            original = {
                'model': {'provider': 'old', 'default': 'old', 'base_url': 'https://example.invalid'},
                'fallback_models': [{'provider': 'openai'}],
                'fallback_model': {'provider': 'openrouter'},
                'auxiliary': {'title_generation': {'provider': 'auto', 'model': '', 'timeout': 10}},
                'mcp_servers': {'fixture': {'url': 'https://example.invalid/mcp'}},
                'voice': {'provider': 'existing-separate-voice'},
            }
            (root / 'config.yaml').write_text(yaml.safe_dump(original))
            (root / 'auth.json').write_text('fixture-do-not-rewrite')
            script = Path(__file__).with_name('configure_codex_route.py')
            result = subprocess.run([sys.executable, str(script), 'gpt-test-fixture'],
                env={**os.environ, 'HERMES_HOME': home}, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            updated = yaml.safe_load((root / 'config.yaml').read_text())
            self.assertEqual(updated['model'], {'provider': 'openai-codex', 'default': 'gpt-test-fixture'})
            self.assertNotIn('fallback_models', updated)
            self.assertNotIn('fallback_model', updated)
            self.assertEqual(updated['auxiliary']['title_generation']['provider'], 'openai-codex')
            self.assertEqual(updated['auxiliary']['title_generation']['timeout'], 10)
            self.assertEqual(updated['mcp_servers'], original['mcp_servers'])
            self.assertEqual(updated['voice'], original['voice'])
            self.assertEqual((root / 'auth.json').read_text(), 'fixture-do-not-rewrite')
            self.assertEqual((root / 'config.yaml').stat().st_mode & 0o777, 0o600)


if __name__ == '__main__':
    unittest.main()
