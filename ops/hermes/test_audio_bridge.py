"""Execute the shipped message-builder on isolated files; never calls a model."""
import ast
import base64
import mimetypes
import os
import tempfile
import unittest
from pathlib import Path


def load_builder():
    source = Path(os.environ.get("BRIDGE_SOURCE", "/apptoo/api/streaming.py"))
    tree = ast.parse(source.read_text(encoding="utf-8"))
    node = next(n for n in tree.body if isinstance(n, ast.FunctionDef)
                and n.name == "_build_native_multimodal_message")
    namespace = {"Path": Path, "base64": base64, "mimetypes": mimetypes,
                 "_NATIVE_IMAGE_MAX_BYTES": 20_000_000,
                 "_resolve_image_input_mode": lambda cfg: cfg.get("mode", "native"),
                 "_is_valid_image": lambda path, mime: path.read_bytes().startswith(b"\x89PNG")}
    exec(compile(ast.Module(body=[node], type_ignores=[]), str(source), "exec"), namespace)
    return namespace[node.name]


class AudioBridgeTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.workspace = self.root / "workspace"
        self.workspace.mkdir()
        self.audio = self.workspace / "turn.wav"
        self.audio.write_bytes(b"RIFFfixture-wave")
        self.fn = load_builder()

    def build(self, attachments, mode="native"):
        return self.fn("context:", "caption", attachments, str(self.workspace), cfg={"mode": mode})

    def test_audio_in_both_image_modes(self):
        for mode in ("native", "text"):
            with self.subTest(mode=mode):
                out = self.build([{"path": str(self.audio), "mime": "audio/wav"}], mode)
                self.assertIn('<current_turn_audio_attachments server_verified="true">', out)
                self.assertIn(str(self.audio), out)
                self.assertTrue(out.startswith("context:caption"))

    def test_current_turn_only(self):
        self.build([{"path": str(self.audio)}])
        self.assertEqual(self.build([]), "context:caption")

    def test_rejects_outside_empty_missing_and_symlink(self):
        outside = self.root / "outside.wav"
        outside.write_bytes(b"private")
        empty = self.workspace / "empty.wav"
        empty.touch()
        link = self.workspace / "link.wav"
        link.symlink_to(outside)
        for path in (outside, empty, self.workspace / "missing.wav", link):
            with self.subTest(path=path.name):
                self.assertEqual(self.build([{"path": str(path)}]), "context:caption")

    def test_mixed_image_audio_and_plain_attachment(self):
        picture = self.workspace / "picture.png"
        picture.write_bytes(b"\x89PNGfixture")
        plain = self.workspace / "notes.txt"
        plain.write_text("not instructions")
        attachments = [{"path": str(picture), "mime": "image/png"},
                       {"path": str(self.audio)}, {"path": str(plain)}]
        out = self.build(attachments)
        self.assertEqual(len(out), 2)
        self.assertEqual(out[1]["type"], "image_url")
        self.assertIn(str(self.audio), out[0]["text"])
        text = self.build(attachments, "text")
        self.assertIsInstance(text, str)
        self.assertIn(str(self.audio), text)
        self.assertNotIn("base64", text)


if __name__ == "__main__":
    unittest.main()
