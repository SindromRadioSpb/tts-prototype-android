"""Offline product protocol/storage tests. No simulated iPhone acceptance."""
import base64
import importlib.util
import io
import json
import hashlib
from pathlib import Path
import sys
import tempfile
import threading
import types
import unittest
import zipfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'scripts/premium/iphone-downloader'


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    item = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(item)
    return item


runner = module('phone_runner', SOURCE / 'runner.py')
builder = module('phone_builder', ROOT / 'scripts/premium/build-iphone-downloader.py')
request = {'v': 1, 'job': 'a' * 32, 'source': 'njtNjn4ya2U', 'rights': 'permission', 'language': 'ru', 'action': 'start'}


class ProtocolTests(unittest.TestCase):
    def test_strict_payload(self):
        self.assertEqual(runner.validate_request(request), request)
        for change in [{'job': '../owner'}, {'source': 'x;ls'}, {'rights': ''}, {'language': 'sh'},
                       {'action': 'exec'}, {'path': '/owner'}, {'v': 2}, {'v': True}]:
            with self.assertRaises(ValueError):
                runner.validate_request({**request, **change})
        with self.assertRaises(ValueError):
            runner.decode_request('x' * 2049)

    def test_fixed_fragment_return(self):
        url = runner.callback_url(request, {'state': 'failed', 'error': 'SOURCE_UNAVAILABLE'})
        self.assertTrue(url.startswith('googlechromes://linguistpro.kolosei.com/download-media.html#result='))
        payload = url.split('#result=')[1]
        result = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
        self.assertEqual(result['job'], request['job'])
        self.assertNotIn('rights', result)

    def test_unicode_names_are_safe_and_bounded(self):
        value = runner.safe_name('../שם/וידאו : " ' + '漢' * 300, request, {'kind': 'video', 'quality': 360})
        self.assertLess(len(value.encode('utf-8')), 255)
        self.assertNotIn('/', value)
        self.assertNotIn(':', value)
        self.assertTrue(value.endswith('.mp4'))
        self.assertFalse(value.startswith('.'))

    def test_repeated_native_commands_are_idempotent(self):
        messages = [{'session': 's', 'seq': 1, 'action': 'ui-ready', 'version': 1},
                    {'session': 's', 'seq': 1, 'action': 'ui-ready', 'version': 1},
                    {'session': 'wrong', 'seq': 2, 'action': 'cancel'},
                    {'session': 's', 'seq': 3, 'action': 'download', 'option': 'video-360;ls'},
                    {'session': 's', 'seq': 4, 'action': 'cancel'}]
        inputs = runner.Inputs(io.StringIO(''.join(json.dumps(x) + '\n' for x in messages)), 's')
        inputs.thread.join(timeout=1)
        self.assertEqual(inputs.messages.qsize(), 2)
        self.assertEqual(inputs.ack, 4)
        self.assertTrue(inputs.cancel.is_set())


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.store = runner.JobStore(self.root, request)
        self.cancel = threading.Event()

    def retain(self):
        original = self.root / 'fixture.mp4'
        original.write_bytes(b'TEST_FIXTURE_ONLY-not-a-real-video')
        return self.store.retain(original, 'Fixture', {'kind': 'video', 'quality': 360},
                                 {'method': 'TEST_FIXTURE_ONLY'}, {'status': 'TEST_FIXTURE_ONLY'}, self.cancel)

    def test_save_reopen_and_tamper(self):
        result = self.retain()
        reopened = runner.JobStore(self.root, {**request, 'action': 'open'})
        verified, file = reopened.verify_result()
        self.assertEqual(verified['sha256'], result['sha256'])
        self.assertEqual(result['browser_file_import'], 'NOT_REQUESTED')
        file.write_bytes(b'changed')
        with self.assertRaisesRegex(RuntimeError, 'LOCAL_FILE_CHANGED'):
            reopened.verify_result()

    def test_missing_file_is_not_success(self):
        result = self.retain()
        (self.store.downloads / result['name']).unlink()
        with self.assertRaisesRegex(RuntimeError, 'LOCAL_FILE_MISSING'):
            self.store.verify_result()

    def test_request_identity_cannot_change_in_existing_job(self):
        with self.assertRaisesRegex(ValueError, 'REQUEST_IDENTITY_MISMATCH'):
            runner.JobStore(self.root, {**request, 'source': 'dH_OkB7Uym4'})

    def test_never_overwrites_existing_owner_file(self):
        original = self.root / 'fixture.mp4'
        original.write_bytes(b'new')
        name = runner.safe_name('Fixture', request, {'kind': 'video', 'quality': 360})
        owner_file = self.store.downloads / name
        owner_file.write_bytes(b'owner bytes')
        with self.assertRaises(FileExistsError):
            self.store.retain(original, 'Fixture', {'kind': 'video', 'quality': 360}, {}, {}, self.cancel)
        self.assertEqual(owner_file.read_bytes(), b'owner bytes')

    def test_cancel_cannot_publish_ready(self):
        self.cancel.set()
        with self.assertRaisesRegex(RuntimeError, 'OWNER_CANCELED'):
            self.retain()
        self.assertIsNone(self.store.read_result())
        self.assertEqual(list(self.store.downloads.iterdir()), [])

    def test_cleanup_is_exact_and_preserves_finished_and_owner_files(self):
        result = self.retain()
        attempt, work = self.store.attempt()
        (work / 'x.part').write_bytes(b'partial')
        owner = self.root / 'owner.txt'
        owner.write_text('keep')
        self.store.cleanup_attempt(attempt)
        self.assertFalse(attempt.exists())
        self.assertTrue((self.store.downloads / result['name']).is_file())
        self.assertEqual(owner.read_text(), 'keep')
        for path in [self.root, self.store.downloads, owner]:
            with self.assertRaises(ValueError):
                self.store.cleanup_attempt(path)

    def test_interrupted_metadata_commit_recovers_verified_link_without_redownload(self):
        real_write = runner.atomic_json
        def interrupted(path, value):
            if Path(path).name == 'result.json':
                raise OSError('TEST_FIXTURE_ONLY interruption after atomic output link')
            real_write(path, value)
        with patch.object(runner, 'atomic_json', side_effect=interrupted):
            with self.assertRaises(OSError):
                self.retain()
        self.assertEqual(len(list(self.store.downloads.iterdir())), 1)
        reopened = runner.JobStore(self.root, {**request, 'action': 'open'})
        result, file = reopened.verify_result()
        self.assertEqual(result['state'], 'ready')
        self.assertEqual(file.read_bytes(), b'TEST_FIXTURE_ONLY-not-a-real-video')

    def test_corrupt_or_traversing_receipt_never_opens_owner_file(self):
        self.retain()
        path = self.store.folder / 'result.json'
        for value in ['{bad', json.dumps({'schema': 'lp-device-download-v1', 'name': '../owner'})]:
            path.write_text(value)
            with self.assertRaises(ValueError):
                self.store.verify_result()


class PackagingTests(unittest.TestCase):
    def test_unpack_verifies_existing_code_and_rejects_traversal(self):
        entry = module('phone_unpack', SOURCE / '__main__.py')
        with tempfile.TemporaryDirectory() as directory:
            archive = Path(directory) / 'test.pyz'
            def write(name):
                content = b'TEST_FIXTURE_ONLY'
                with zipfile.ZipFile(archive, 'w') as output:
                    output.writestr(name, content)
                    output.writestr('manifest.json', json.dumps({'files': {name: hashlib.sha256(content).hexdigest()}}))
            write('runner.py')
            code = entry.unpack(archive)
            self.assertEqual(entry.unpack(archive), code)
            (code / 'runner.py').write_text('changed')
            with self.assertRaisesRegex(ValueError, 'INSTALLED_CODE_CHANGED'):
                entry.unpack(archive)
            write('../owner.py')
            with self.assertRaisesRegex(ValueError, 'PACKAGE_PATH_INVALID'):
                entry.unpack(archive)
            self.assertFalse((Path(directory) / 'owner.py').exists())

    def test_bootstrap_checks_runtime_boundary_before_creating_directories(self):
        source = (SOURCE / 'bootstrap.py').read_text()
        self.assertLess(source.index('if not r.resolve().is_relative_to'), source.index('r.mkdir('))
        self.assertLess(source.index('if f.is_symlink()'), source.index('urllib.request.urlopen('))

    def test_engine_reused_and_native_locales_complete(self):
        files = builder.package_files()
        self.assertIn('probe.py', files)
        self.assertIn('acquisition_service/media_verify.py', files)
        copy = json.loads(files['copy.json'])
        self.assertEqual(set(copy['ru']), set(copy['he']))
        self.assertEqual(set(copy['ru']), set(copy['en']))
        self.assertNotIn(b'--remote-components', files['runner.py'])

    def test_handshake_fails_closed_without_ready_message(self):
        class Inputs:
            session = 'b' * 32
            def next(self, timeout):
                raise RuntimeError('NATIVE_UI_UNAVAILABLE')
        with tempfile.TemporaryDirectory() as directory:
            code = Path(directory) / 'code'
            code.mkdir()
            for name, data in builder.package_files().items():
                path = code / name
                path.parent.mkdir(exist_ok=True, parents=True)
                path.write_bytes(data)
            with patch.object(runner.NativeUI, '_execute'):
                with self.assertRaisesRegex(RuntimeError, 'NATIVE_UI_UNAVAILABLE'):
                    runner.NativeUI(code, request, Inputs())

    def test_jsc_script_precedes_flags(self):
        with tempfile.TemporaryDirectory() as directory:
            ui = object.__new__(runner.NativeUI)
            ui.folder = Path(directory)
            with patch.object(runner.os, 'system', return_value=0) as command:
                ui._execute('window.TEST_FIXTURE_ONLY = true;')
            called = command.call_args.args[0]
            self.assertTrue(called.startswith('jsc '))
            self.assertTrue(called.endswith(' --in-window --silent'))
            self.assertLess(called.index('update.js'), called.index('--in-window'))

    def test_bootstrap_rejects_tamper_before_any_run(self):
        template = (SOURCE / 'bootstrap.py').read_text()
        source = template.replace('__SHORT_HASH__', 'a' * 16).replace('__PACKAGE_HASH__', 'b' * 64)
        with tempfile.TemporaryDirectory() as directory:
            documents = Path(directory) / 'Documents'
            documents.mkdir()
            with patch('pathlib.Path.home', return_value=Path(directory)), \
                 patch('urllib.request.urlopen', return_value=io.BytesIO(b'TAMPERED')), \
                 patch.object(sys, 'argv', ['bootstrap', base64.urlsafe_b64encode(json.dumps(request).encode()).decode().rstrip('=')]), \
                 patch('os.system', return_value=0) as returned, \
                 patch('runpy.run_path') as execute:
                exec(compile(source, 'bootstrap-fixture', 'exec'), {})
                execute.assert_not_called()
                url = returned.call_args.args[0]
                payload = url.split('#result=')[1]
                result = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
                self.assertEqual(result['error'], 'PACKAGE_HASH_MISMATCH')


class SessionTests(unittest.TestCase):
    """Real filesystem + unchanged planner, with explicitly synthetic source bytes."""
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.code = self.root / 'code'
        for name, data in builder.package_files().items():
            path = self.code / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        sys.path.insert(0, str(self.code))
        self.addCleanup(lambda: sys.path.remove(str(self.code)))
        # Isolate imports from any developer checkout or another test's temporary tree.
        self.saved_modules = {key: value for key, value in sys.modules.items() if key == 'acquisition_service' or key.startswith('acquisition_service.')}
        for key in self.saved_modules:
            del sys.modules[key]
        def restore():
            for key in list(sys.modules):
                if key == 'acquisition_service' or key.startswith('acquisition_service.'):
                    del sys.modules[key]
            sys.modules.update(self.saved_modules)
        self.addCleanup(restore)
        self.store = runner.JobStore(self.root, request)
        self.views = []
        self.ui = types.SimpleNamespace(render=lambda value: self.views.append(dict(value)))
        self.probe = module('phone_probe_fixture', self.code / 'probe.py')
        self.probe.install_runtime = lambda root: (Path(root) / 'runtime-v1').mkdir(exist_ok=True)
        self.probe.activate_runtime = lambda root: None
        self.probe.native_preflight = lambda: {'status': 'TEST_FIXTURE_ONLY'}

    def run_fixture(self, messages, behavior='ready'):
        from acquisition_service import jobs
        cancel = threading.Event()
        actions = iter(messages)
        inputs = types.SimpleNamespace(cancel=cancel, ack=1, next=lambda: {'action': next(actions), 'option': 'video-360'})
        class Backend:
            calls = 0
            @staticmethod
            def _base_options():
                return {}
            def resolve(self, url):
                if behavior == 'network':
                    raise jobs.JobError('SOURCE_NETWORK_ERROR')
                return {'id': request['source'], 'title': 'TEST_FIXTURE_ONLY', 'duration': 2,
                        'formats': [{'format_id': '18', 'height': 360, 'ext': 'mp4',
                                     'vcodec': 'avc1.42001e', 'acodec': 'mp4a.40.2', 'filesize': 1024}]}
            def prepare(self, **args):
                Backend.calls += 1
                file = args['job_dir'] / 'fixture.mp4'
                file.write_bytes(b'TEST_FIXTURE_ONLY')
                args['progress']('DOWNLOADING', 16, 16)
                if behavior == 'cancel':
                    cancel.set()
                return file, 'video/mp4', 'fixture.mp4', {'method': 'TEST_FIXTURE_ONLY'}
        with patch.object(jobs, 'YtDlpBackend', Backend), patch.object(runner.os, 'system', return_value=0) as calls:
            result = runner.run_session(self.store, self.ui, inputs, self.probe)
        return result, Backend.calls, calls

    def test_options_download_and_fixed_chrome_return(self):
        result, downloads, commands = self.run_fixture(['download', 'return'])
        self.assertEqual(result['state'], 'ready')
        self.assertEqual(downloads, 1)
        self.assertEqual(result['verification']['method'], 'TEST_FIXTURE_ONLY')
        options = next(x for x in self.views if x['phase'] == 'options')['options']
        self.assertEqual([x['key'] for x in options], ['video-360'])
        self.assertTrue(commands.call_args.args[0].startswith('open googlechromes://linguistpro.kolosei.com/download-media.html#result='))

    def test_return_from_options_does_not_download(self):
        result, downloads, _ = self.run_fixture(['return'])
        self.assertEqual(result['state'], 'canceled')
        self.assertEqual(downloads, 0)
        self.assertIsNone(self.store.read_result())

    def test_cancel_cleans_attempt_without_ready(self):
        result, downloads, _ = self.run_fixture(['download', 'return'], 'cancel')
        self.assertEqual(result['state'], 'canceled')
        self.assertEqual(downloads, 1)
        self.assertFalse(any(x['phase'] == 'ready' for x in self.views))
        self.assertEqual(list(self.store.downloads.iterdir()), [])
        self.assertEqual(list(self.store.folder.glob('attempt-*')), [])

    def test_network_failure_has_actionable_code(self):
        result, downloads, _ = self.run_fixture(['return'], 'network')
        self.assertEqual(result['error'], 'SOURCE_NETWORK_ERROR')
        self.assertEqual(downloads, 0)
        self.assertEqual(self.views[-1]['hint'], 'errorNetwork')


if __name__ == '__main__':
    unittest.main()
