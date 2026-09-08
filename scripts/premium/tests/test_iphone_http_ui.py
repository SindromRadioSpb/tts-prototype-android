"""Real loopback HTTP tests; no a-Shell/native acceptance is simulated."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
import urllib.error
import urllib.request

SOURCE = Path(__file__).resolve().parents[1] / 'iphone-downloader'
sys.path.insert(0, str(SOURCE))
from http_ui import LocalUI


class LocalUITests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.code = Path(self.temp.name)
        for name in ('ui.js', 'ui.css'):
            (self.code / name).write_text('/* TEST_FIXTURE_ONLY */')
        self.messages = []
        self.ui = LocalUI(self.code, {'session': 'a' * 32, 'language': 'ru', 'copy': {}},
                          lambda: {'phase': 'connecting', 'ack': 0, 'revision': 1}, self.messages.append)
        self.addCleanup(self.ui.close)

    def test_private_origin_and_exact_routes(self):
        self.assertTrue(self.ui.url.startswith('http://127.0.0.1:'))
        with urllib.request.urlopen(self.ui.url) as response:
            self.assertIn(b'ui.js', response.read())
            self.assertEqual(response.headers['Cache-Control'], 'no-store')
            self.assertEqual(response.headers['X-Frame-Options'], 'DENY')
            self.assertIsNone(response.headers.get('Access-Control-Allow-Origin'))
        for url in [self.ui.origin + '/', self.ui.url + '../owner', self.ui.url + 'verified.mp4']:
            with self.assertRaises(urllib.error.HTTPError) as error:
                urllib.request.urlopen(url)
            self.assertEqual(error.exception.code, 404)

    def test_command_requires_same_origin_json_and_session(self):
        valid = {'Origin': self.ui.origin, 'Content-Type': 'application/json', 'X-LP-Session': 'a' * 32}
        for headers in [{}, {**valid, 'Origin': 'https://untrusted.example'}, {**valid, 'X-LP-Session': 'wrong'},
                        {**valid, 'Host': 'attacker.example'}, {**valid, 'Content-Type': 'text/plain'}]:
            with self.assertRaises(urllib.error.HTTPError):
                urllib.request.urlopen(urllib.request.Request(self.ui.url + 'command', data=b'{}', headers=headers))
        self.assertEqual(self.messages, [])
        payload = {'action': 'ui-ready', 'session': 'a' * 32, 'seq': 1, 'version': 1}
        with urllib.request.urlopen(urllib.request.Request(self.ui.url + 'command', data=json.dumps(payload).encode(), headers=valid)) as response:
            self.assertEqual(response.status, 200)
        self.assertEqual(self.messages, [json.dumps(payload).encode()])

    def test_state_is_live_and_oversized_commands_are_rejected(self):
        self.ui.state = lambda: {'phase': 'downloading', 'bytes': 42, 'ack': 1, 'revision': 2}
        with urllib.request.urlopen(self.ui.url + 'state') as response:
            self.assertEqual(json.load(response)['bytes'], 42)
        headers = {'Origin': self.ui.origin, 'Content-Type': 'application/json', 'X-LP-Session': 'a' * 32}
        with self.assertRaises(urllib.error.HTTPError) as error:
            urllib.request.urlopen(urllib.request.Request(self.ui.url + 'command', data=b'x' * 4097, headers=headers))
        self.assertEqual(error.exception.code, 413)
        self.assertEqual(self.messages, [])


if __name__ == '__main__':
    unittest.main()
