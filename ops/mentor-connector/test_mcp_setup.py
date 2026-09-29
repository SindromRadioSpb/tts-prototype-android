"""No-owner-data fixture for the one-click tutor MCP profile preparation."""
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from ruamel.yaml import YAML
from mcp_setup import ALIAS, SCOPES, TOOLS, URL, configure


class TutorMcpSetupTest(unittest.TestCase):
    def test_additive_profile_preserves_existing_mcp_configuration(self):
        with TemporaryDirectory() as folder:
            config = Path(folder) / "config.yaml"
            config.write_text("# owner comment\nmcp_servers:\n  linguistpro:\n    url: " + URL
                + "\n    auth: oauth\n    oauth:\n      client_id: owner-fixture\n      redirect_port: 8765\n      scope: old.one old.two\n    tools:\n      include: [old_tool]\n  another:\n    enabled: false\n", encoding="utf-8")
            before = config.read_text(encoding="utf-8")
            self.assertFalse(configure(config, False)["prepared"])
            self.assertEqual(before, config.read_text(encoding="utf-8"))
            self.assertTrue(configure(config, True)["changed"])
            self.assertFalse(configure(config, True)["changed"])
            yaml = YAML()
            parsed = yaml.load(config.read_text(encoding="utf-8"))
            self.assertEqual(parsed["mcp_servers"]["linguistpro"]["oauth"]["scope"], "old.one old.two")
            self.assertEqual(parsed["mcp_servers"]["linguistpro"]["tools"]["include"], ["old_tool"])
            self.assertEqual(parsed["mcp_servers"][ALIAS]["oauth"]["scope"], " ".join(SCOPES))
            self.assertEqual(parsed["mcp_servers"][ALIAS]["tools"]["include"], TOOLS)
            self.assertIn("# owner comment", config.read_text(encoding="utf-8"))
            self.assertEqual(len(list((config.parent / "linguistpro-tutor").glob("config-before-tutor-mcp-*.yaml"))), 1)


if __name__ == "__main__":
    unittest.main()
