"""TEST_FIXTURE_ONLY state producer; real packaged UI and real loopback transport.

Does not run a-Shell, download provider media, inspect owner storage or call ASR.
The command launcher is replaced only to expose its localhost URL to Playwright.
"""
import json
from pathlib import Path
import sys
import tempfile
import time
import uuid
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'scripts/premium/iphone-downloader'))
import runner


def main():
    import zipfile
    # Consume the release package, not a second copy of the UI under test.
    package = Path(sys.argv[1])
    with tempfile.TemporaryDirectory(prefix='lp-ui-fixture-') as directory:
        code = Path(directory)
        with zipfile.ZipFile(package) as archive:
            for name in ('ui.js', 'ui.css', 'copy.json'):
                (code / name).write_bytes(archive.read(name))
        inputs = runner.Inputs(None, uuid.uuid4().hex)
        ui = None
        def open_browser(command):
            if not command.startswith('internalbrowser http://127.0.0.1:'):
                raise ValueError('UNEXPECTED_NATIVE_COMMAND')
            print(json.dumps({'url': command.split(' ', 1)[1], 'evidence': 'TEST_FIXTURE_ONLY'}), flush=True)
            return 0
        try:
            with patch.object(runner.os, 'system', side_effect=open_browser):
                ui = runner.NativeUI(code, {'language': 'ru'}, inputs)
            def options():
                ui.render({'phase': 'options', 'title': 'בדידות בערב החג', 'duration': 959,
                           'options': [{'key': 'video-720', 'kind': 'video', 'quality': 720, 'bytes': 50000000},
                                       {'key': 'video-360', 'kind': 'video', 'quality': 360, 'bytes': 31975909},
                                       {'key': 'audio', 'kind': 'audio', 'quality': None, 'bytes': 15509473}]})
            options()
            attempts = 0
            previews = 0
            ready = {'phase': 'ready', 'kind': 'video', 'name': "TEST_FIXTURE_ONLY Eichmann's execution.mp4", 'bytes': 31975909, 'sha256': 'b' * 64}
            while True:
                message = inputs.next(timeout=60)
                action = message['action']
                if action == 'ui-ready':
                    continue  # Reload handshakes do not discard selected progress.
                print(json.dumps({'action': action, 'option': message.get('option')}), flush=True)
                if action == 'download':
                    attempts += 1
                    ui.render({'phase': 'downloading', 'title': 'TEST_FIXTURE_ONLY', 'bytes': 16000000, 'total': 32000000})
                    if attempts > 1:
                        time.sleep(.8)
                        ui.render(ready)
                elif action == 'preview':
                    previews += 1
                    ui.render({**ready, **({'action_error': 'NATIVE_ACTION_FAILED', 'hint': 'errorPreview'} if previews == 1 else {})})
                elif action == 'cancel':
                    ui.render({'phase': 'canceled', 'hint': 'cancelDone', 'retry': True})
                elif action == 'retry':
                    inputs.cancel.clear(); options()
                elif action == 'return':
                    time.sleep(.3)
                    return
        finally:
            if ui:
                ui.close()
            inputs.stop()


if __name__ == '__main__':
    main()
