"""LinguistPro iPhone downloader: local UI, pinned engine, persistent verified files.

No HTTP listener, media server, ASR, cookie access, remote code update, or global
Python configuration. The bundled probe and engine are immutable predecessor bytes.
"""
from __future__ import annotations

import base64
import contextlib
import errno
import hashlib
import json
import os
from pathlib import Path
import queue
import re
import select
import shlex
import shutil
import sys
import threading
import time
import unicodedata
import uuid
import urllib.error

MAX_BYTES = 300 * 1024 * 1024
MAX_SECONDS = 1800
REQUEST_FIELDS = {'v', 'job', 'source', 'rights', 'language', 'action'}
LOCAL_ERRORS = {'REQUEST_INVALID', 'REQUEST_IDENTITY_MISMATCH', 'LOCAL_PATH_INVALID',
                'LOCAL_FILE_MISSING', 'LOCAL_FILE_CHANGED', 'LOCAL_STORAGE_FULL',
                'HELPER_BUSY', 'NATIVE_UI_UNAVAILABLE', 'NATIVE_ACTION_FAILED',
                'OWNER_CANCELED', 'DOWNLOAD_TIME_LIMIT', 'RESULT_INVALID', 'OUTPUT_FILE_EXISTS'}


def validate_request(value):
    if (not isinstance(value, dict) or set(value) != REQUEST_FIELDS or type(value['v']) is not int or value['v'] != 1
            or not isinstance(value['job'], str) or not re.fullmatch('[a-f0-9]{32}', value['job'])
            or not isinstance(value['source'], str) or not re.fullmatch('[A-Za-z0-9_-]{11}', value['source'])
            or value['rights'] not in {'owned', 'permission', 'public-domain'}
            or value['language'] not in {'ru', 'en', 'he'} or value['action'] not in {'start', 'open'}):
        raise ValueError('REQUEST_INVALID')
    return dict(value)


def decode_request(encoded):
    if not isinstance(encoded, str) or len(encoded) > 2048 or not re.fullmatch('[A-Za-z0-9_-]+', encoded):
        raise ValueError('REQUEST_INVALID')
    try:
        return validate_request(json.loads(base64.urlsafe_b64decode(encoded + '=' * (-len(encoded) % 4))))
    except (TypeError, KeyError, UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError('REQUEST_INVALID') from exc


def callback_url(request, result):
    validate_request(request)
    value = {'v': 1, 'job': request['job'], 'source': request['source'], 'state': result['state']}
    if result['state'] == 'ready':
        value.update({key: result[key] for key in ('kind', 'quality', 'name', 'bytes', 'sha256')})
    elif result.get('error'):
        value['error'] = result['error']
    payload = base64.urlsafe_b64encode(json.dumps(value, ensure_ascii=True, separators=(',', ':')).encode()).decode().rstrip('=')
    return 'googlechromes://linguistpro.kolosei.com/download-media.html#result=' + payload


def safe_name(title, request, option):
    title = unicodedata.normalize('NFC', str(title or 'YouTube'))
    title = re.sub(r'[\x00-\x1f\x7f/\\:*?"<>|\u202a-\u202e\u2066-\u2069]', ' ', title)
    title = ' '.join(title.split()).strip('. ')
    title = title.encode('utf-8')[:125].decode('utf-8', errors='ignore').rstrip('. ') or 'YouTube'
    quality = str(option['quality']) + 'p' if option['kind'] == 'video' else 'audio'
    return f"{title} - {request['source']}-{quality}-{request['job'][:8]}." + ('mp4' if option['kind'] == 'video' else 'm4a')


def file_digest(path, cancel=None):
    digest = hashlib.sha256()
    size = 0
    with Path(path).open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            if cancel and cancel.is_set():
                raise RuntimeError('OWNER_CANCELED')
            size += len(chunk)
            if size > MAX_BYTES:
                raise RuntimeError('OUTPUT_SIZE_LIMIT')
            digest.update(chunk)
    return digest.hexdigest(), size


def atomic_json(path, value):
    path = Path(path)
    scratch = path.with_name('.write-' + uuid.uuid4().hex)
    try:
        with scratch.open('x', encoding='utf-8') as stream:
            json.dump(value, stream, ensure_ascii=True, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        scratch.replace(path)
    finally:
        scratch.unlink(missing_ok=True)


def child(root, *parts):
    root = Path(root).resolve()
    path = root.joinpath(*parts)
    if not path.resolve().is_relative_to(root) or path.is_symlink():
        raise ValueError('LOCAL_PATH_INVALID')
    return path


class JobStore:
    def __init__(self, root, request):
        self.root = Path(root).resolve()
        self.request = validate_request(request)
        self.jobs = child(self.root, '.jobs')
        self.jobs.mkdir(exist_ok=True)
        self.folder = child(self.jobs, request['job'])
        self.folder.mkdir(exist_ok=True)
        self.downloads = child(self.root, 'Downloads')
        self.downloads.mkdir(exist_ok=True)
        self.request_path = child(self.folder, 'request.json')
        if self.request_path.exists():
            existing = validate_request(json.loads(self.request_path.read_text(encoding='utf-8')))
            if any(existing[key] != request[key] for key in ('job', 'source', 'rights')):
                raise ValueError('REQUEST_IDENTITY_MISMATCH')
        else:
            atomic_json(self.request_path, request)

    def save_state(self, state):
        atomic_json(child(self.folder, 'status.json'), {**state, 'updated_at': time.time()})

    def read_result(self):
        path = child(self.folder, 'result.json')
        if not path.is_file():
            pending = child(self.folder, 'pending-result.json')
            if not pending.is_file():
                return None
            result = self._read_result_file(pending)
            target = child(self.downloads, result['name'])
            if not target.is_file():
                return None
            if file_digest(target) != (result['sha256'], result['bytes']):
                raise RuntimeError('LOCAL_FILE_CHANGED')
            # Native output link was committed before an interruption; finish
            # only its metadata write. This does not redownload or alter media.
            atomic_json(path, result)
        return self._read_result_file(path)

    def has_result(self):
        return child(self.folder, 'result.json').is_file() or child(self.folder, 'pending-result.json').is_file()

    def _read_result_file(self, path):
        if path.stat().st_size > 16384:
            raise ValueError('RESULT_INVALID')
        try:
            result = json.loads(path.read_text(encoding='utf-8'))
            if (not isinstance(result, dict) or result.get('schema') != 'lp-device-download-v1'
                    or result.get('state') != 'ready' or result.get('job') != self.request['job']
                    or result.get('source') != self.request['source'] or result.get('rights') != self.request['rights']
                    or result.get('kind') not in {'video', 'audio'} or not isinstance(result.get('title'), str)
                    or type(result.get('bytes')) is not int or not 0 < result['bytes'] <= MAX_BYTES
                    or not isinstance(result.get('sha256'), str) or not re.fullmatch('[a-f0-9]{64}', result['sha256'])
                    or (result['kind'] == 'video' and result.get('quality') not in {360, 480, 720, 1080})
                    or (result['kind'] == 'audio' and result.get('quality') is not None)):
                raise ValueError('RESULT_INVALID')
            name = result.get('name')
            if (not isinstance(name, str) or not name or len(name.encode('utf-8')) > 255 or name.startswith('.')
                    or re.search(r'[\x00-\x1f\x7f/\\:]', name)
                    or not name.endswith('.mp4' if result['kind'] == 'video' else '.m4a')):
                raise ValueError('RESULT_INVALID')
            return result
        except (TypeError, KeyError, UnicodeError, json.JSONDecodeError) as error:
            raise ValueError('RESULT_INVALID') from error

    def verify_result(self, cancel=None):
        result = self.read_result()
        if not result or result.get('schema') != 'lp-device-download-v1' or result.get('state') != 'ready':
            raise RuntimeError('LOCAL_FILE_MISSING')
        name = result.get('name')
        if not isinstance(name, str) or not name or name.startswith('.') or re.search(r'[\x00-\x1f/\\:]', name):
            raise ValueError('RESULT_INVALID')
        if result.get('job') != self.request['job'] or result.get('source') != self.request['source']:
            raise ValueError('REQUEST_IDENTITY_MISMATCH')
        path = child(self.downloads, name)
        if not path.is_file():
            raise RuntimeError('LOCAL_FILE_MISSING')
        sha, size = file_digest(path, cancel)
        if sha != result.get('sha256') or size != result.get('bytes'):
            raise RuntimeError('LOCAL_FILE_CHANGED')
        return result, path

    def attempt(self):
        # Reattempt is an explicit restart, not a claim of byte-range resume.
        # Only exact helper-owned attempt folders for this job may be removed.
        for previous in self.folder.glob('attempt-*'):
            self.cleanup_attempt(previous)
        folder = child(self.folder, 'attempt-' + uuid.uuid4().hex)
        folder.mkdir()
        atomic_json(folder / '.lp-attempt.json', {'job': self.request['job']})
        # Engine input directory must contain only its media candidates.
        work = folder / 'media'
        work.mkdir()
        return folder, work

    def cleanup_attempt(self, folder):
        folder = Path(folder)
        if (folder.parent.resolve() != self.folder.resolve() or folder.is_symlink()
                or not re.fullmatch('attempt-[a-f0-9]{32}', folder.name)):
            raise ValueError('LOCAL_PATH_INVALID')
        marker = folder / '.lp-attempt.json'
        if not marker.is_file() or json.loads(marker.read_text()) != {'job': self.request['job']}:
            raise ValueError('LOCAL_PATH_INVALID')
        if not folder.resolve().is_relative_to(self.folder.resolve()):
            raise ValueError('LOCAL_PATH_INVALID')
        shutil.rmtree(folder)

    def retain(self, output, title, option, verification, native, cancel):
        sha, size = file_digest(output, cancel)
        name = safe_name(title, self.request, option)
        target = child(self.downloads, name)
        # APFS/NTFS hard-link insertion is atomic and refuses an existing name.
        # A partial copy is never exposed under the final .mp4 name. Both paths
        # are within this helper's local Documents filesystem, not a provider.
        if target.exists():
            raise FileExistsError('OUTPUT_FILE_EXISTS')
        result = {'schema': 'lp-device-download-v1', 'state': 'ready', 'job': self.request['job'],
                  'source': self.request['source'], 'rights': self.request['rights'],
                  'kind': option['kind'], 'quality': option.get('quality'), 'title': title,
                  'name': name, 'bytes': size, 'sha256': sha, 'verification': verification,
                  'native': native, 'saved_at': time.time(), 'server_media_transfer': 'NOT_USED',
                  'browser_file_import': 'NOT_REQUESTED'}
        if cancel.is_set():
            raise RuntimeError('OWNER_CANCELED')
        atomic_json(child(self.folder, 'pending-result.json'), result)
        if cancel.is_set():
            raise RuntimeError('OWNER_CANCELED')
        os.link(output, target)
        # From this atomic link onward the finished bytes are retained. If the
        # metadata write is interrupted, read_result recovers by exact SHA256.
        atomic_json(child(self.folder, 'result.json'), result)
        return result


class Inputs:
    def __init__(self, stream, session):
        self.stream, self.session = stream, session
        self.messages = queue.Queue(maxsize=16)
        self.cancel = threading.Event()
        self.closed = threading.Event()
        self.ack = 0
        self.thread = threading.Thread(target=self._read, daemon=True)
        self.thread.start()

    def _read(self):
        # No daemon thread may hold TextIOWrapper's buffered stdin lock at
        # interpreter shutdown. a-Shell provides a real pipe; select + os.read
        # keep its reader bounded and allow a clean join on every app return.
        try:
            descriptor = self.stream.fileno()
        except (AttributeError, OSError):
            descriptor = None  # Finite in-memory streams in offline unit tests.
        pending = b''
        while not self.closed.is_set():
            if descriptor is None:
                line = self.stream.readline(4097)
                lines = [line] if line else []
            else:
                if not select.select([descriptor], [], [], .25)[0]:
                    continue
                chunk = os.read(descriptor, 4096)
                if not chunk:
                    lines = []
                else:
                    pending += chunk
                    split = pending.split(b'\n')
                    pending = split.pop()
                    if len(pending) > 4096:
                        pending = b''
                    for entry in split:
                        if len(entry) <= 4096:
                            self._message(entry)
                    continue
            if not lines:
                self.closed.set(); self.cancel.set(); return
            for line in lines:
                if len(line) <= 4096:
                    self._message(line)

    def _message(self, line):
        try:
            value = json.loads(line)
            action = value.get('action')
            seq = value.get('seq')
            allowed = {'action', 'session', 'seq'} | ({'option'} if action == 'download' else {'version'} if action == 'ui-ready' else set())
            if (not isinstance(value, dict) or set(value) != allowed or value['session'] != self.session
                    or type(seq) is not int or not self.ack < seq < 1000000
                    or action not in {'ui-ready', 'download', 'cancel', 'retry', 'preview', 'return'}):
                return
            if action == 'ui-ready' and value.get('version') != 1:
                return
            if action == 'download' and value.get('option') not in {'video-360', 'video-480', 'video-720', 'video-1080', 'audio'}:
                return
            self.ack = seq
            if action == 'cancel':
                self.cancel.set()
            self.messages.put_nowait(value)
        except (ValueError, TypeError, AttributeError, KeyError, queue.Full):
            return

    def stop(self):
        self.closed.set()
        self.thread.join(timeout=1)

    def next(self, timeout=1800):
        until = time.monotonic() + timeout
        while time.monotonic() < until:
            if self.closed.is_set():
                raise RuntimeError('OWNER_CANCELED')
            try:
                return self.messages.get(timeout=min(.25, max(.01, until - time.monotonic())))
            except queue.Empty:
                pass
        raise RuntimeError('NATIVE_UI_UNAVAILABLE')


class NativeUI:
    def __init__(self, code, request, inputs):
        self.code, self.inputs = Path(code), inputs
        self.folder = self.code.parent / ('.ui-' + inputs.session)
        self.folder.mkdir(exist_ok=False)
        translations = json.loads((self.code / 'copy.json').read_text(encoding='utf-8'))
        config = {'session': inputs.session, 'language': request['language'],
                  'copy': translations[request['language']], 'css': (self.code / 'ui.css').read_text(encoding='utf-8')}
        script = (self.code / 'ui.js').read_text(encoding='utf-8') + '\nwindow.LPPhoneNative.install(' + json.dumps(config, ensure_ascii=True) + ');'
        self._execute(script)
        message = inputs.next(timeout=15)
        if message['action'] != 'ui-ready':
            raise RuntimeError('NATIVE_UI_UNAVAILABLE')
        self.render({'phase': 'connecting'})

    def _execute(self, script):
        target = self.folder / 'update.js'
        target.write_text(script, encoding='utf-8')
        # a-Shell takes the SCRIPT as argv[1]; flags follow it.
        if os.system('jsc ' + shlex.quote(str(target)) + ' --in-window --silent') != 0:
            raise RuntimeError('NATIVE_UI_UNAVAILABLE')

    def render(self, state):
        value = {**state, 'ack': self.inputs.ack}
        self._execute('window.LPPhoneNative.render(' + json.dumps(value, ensure_ascii=True) + ');')


def safe_error(error, probe):
    if isinstance(error, OSError) and error.errno == errno.ENOSPC:
        return 'LOCAL_STORAGE_FULL'
    if isinstance(error, (TimeoutError, ConnectionError, urllib.error.URLError)):
        return 'SOURCE_NETWORK_ERROR'
    code = getattr(error, 'code', None) or str(error)
    return code if code in LOCAL_ERRORS or code in probe.SAFE_ERROR_CODES else 'PROBE_FAILED'


def error_hint(code):
    if code in {'SOURCE_NETWORK_ERROR', 'DEPENDENCY_REDIRECT_REJECTED'}:
        return 'errorNetwork'
    if code in {'LOCAL_FILE_MISSING'}:
        return 'errorMissing'
    if code in {'LOCAL_FILE_CHANGED', 'RESULT_INVALID'}:
        return 'errorChanged'
    if code == 'NATIVE_UI_UNAVAILABLE':
        return 'errorBridge'
    if code == 'LOCAL_STORAGE_FULL':
        return 'errorDisk'
    if code in {'DURATION_LIMIT', 'OUTPUT_SIZE_LIMIT', 'DOWNLOAD_TIME_LIMIT'}:
        return 'errorLimit'
    if code in {'NO_REQUESTED_OPTION', 'NO_COMPATIBLE_FORMAT', 'FORMAT_UNAVAILABLE', 'LIVE_UNSUPPORTED'}:
        return 'errorFormat'
    if code.startswith('SOURCE_') or code == 'LOGIN_REQUIRED':
        return 'errorSource'
    return 'errorGeneric'


@contextlib.contextmanager
def exclusive_helper(root):
    import fcntl  # Native iOS/POSIX only. Tests do not fake iOS to exercise this.
    lock = child(root, '.download.lock').open('a+')
    try:
        try:
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise RuntimeError('HELPER_BUSY') from exc
        yield
    finally:
        lock.close()


def run_session(store, ui, inputs, probe):
    from acquisition_service.jobs import YtDlpBackend
    from acquisition_service.planner import build_resolved_source

    class DeviceBackend(YtDlpBackend):
        @staticmethod
        def _base_options():
            options = YtDlpBackend._base_options()
            options.update({'js_runtimes': {}, 'remote_components': []})
            return options

    request, cancel = store.request, inputs.cancel
    current = {'state': 'interrupted'}
    last_view = {}

    def show(phase, **values):
        nonlocal last_view
        last_view = {'phase': phase, **values}
        store.save_state(last_view)
        ui.render(last_view)

    def check_cancel():
        if cancel.is_set():
            raise RuntimeError('OWNER_CANCELED')

    first = True
    while True:
        attempt = None
        failure_cause = None
        try:
            if store.read_result():
                show('verifying')
                current, _ = store.verify_result(cancel)
            elif request['action'] == 'open':
                raise RuntimeError('LOCAL_FILE_MISSING')
            else:
                dependency_key = hashlib.sha256(json.dumps(probe.WHEELS).encode()).hexdigest()[:12]
                dependencies = child(store.root, '.runtime', 'dependencies-' + dependency_key)
                dependencies.mkdir(parents=True, exist_ok=True)
                if not (dependencies / 'runtime-v1').exists():
                    show('installing')
                    probe.install_runtime(dependencies)
                check_cancel()
                show('checking')
                probe.activate_runtime(dependencies)
                native = probe.native_preflight()
                check_cancel()
                show('resolving')
                backend = DeviceBackend()
                source_url = probe.source_url(request['source'])
                info = backend.resolve(source_url)
                check_cancel()
                resolved = build_resolved_source(info, canonical_url=source_url,
                                                 subject='device-local', secret=uuid.uuid4().hex * 2)
                source = resolved['source']
                title = re.sub(r'[\x00-\x1f\x7f]', '', str(source['title']))[:200]
                options = {('audio' if item['kind'] == 'audio' else 'video-' + str(item.get('quality'))): item
                           for item in resolved['options'] if item['kind'] in {'video', 'audio'}}
                # Video first; prefer practical 720p, but only show actual compatible options.
                ordered = sorted(options, key=lambda key: (key == 'audio', {'video-720': 0, 'video-480': 1, 'video-360': 2, 'video-1080': 3}.get(key, 4)))
                if not any(key.startswith('video-') for key in ordered):
                    raise RuntimeError('NO_COMPATIBLE_FORMAT')
                show('options', title=title, duration=source['duration_seconds'], options=[
                    {'key': key, 'kind': options[key]['kind'], 'quality': options[key].get('quality'),
                     'bytes': options[key].get('size_bytes')} for key in ordered])
                while True:
                    message = inputs.next()
                    check_cancel()
                    if message['action'] == 'return':
                        current = {'state': 'canceled'}
                        ui.render(last_view)
                        if os.system('open ' + callback_url(request, current)) != 0:
                            raise RuntimeError('NATIVE_ACTION_FAILED')
                        return current
                    if message['action'] == 'download' and message.get('option') in options:
                        option = options[message['option']]
                        break
                estimated = option.get('size_bytes') or MAX_BYTES
                if shutil.disk_usage(store.root).free < 4 * estimated + 32 * 1024 * 1024:
                    raise RuntimeError('LOCAL_STORAGE_FULL')
                attempt, work = store.attempt()
                started, last_update = time.monotonic(), [0]

                def progress(phase, done, total):
                    nonlocal failure_cause
                    check_cancel()
                    now = time.monotonic()
                    if now - started > MAX_SECONDS:
                        failure_cause = 'DOWNLOAD_TIME_LIMIT'
                        raise RuntimeError('DOWNLOAD_TIME_LIMIT')
                    if sum(p.stat().st_size for p in work.rglob('*') if p.is_file()) > 2 * MAX_BYTES:
                        failure_cause = 'OUTPUT_SIZE_LIMIT'
                        raise RuntimeError('OUTPUT_SIZE_LIMIT')
                    if now - last_update[0] > 1.5 or phase == 'VERIFYING':
                        show({'DOWNLOADING': 'downloading', 'MERGING': 'merging', 'VERIFYING': 'verifying'}.get(phase, 'downloading'),
                             title=title, duration=source['duration_seconds'], bytes=done, total=total)
                        last_update[0] = now

                output, _mime, _name, verification = backend.prepare(
                    plan={'canonical_url': source_url, 'video_id': request['source'], 'duration_seconds': info['duration']},
                    option=option, job_dir=work, cancel_event=cancel, progress=progress)
                check_cancel()
                show('verifying', title=title)
                current = store.retain(output, title, option, verification, native, cancel)
                store.cleanup_attempt(attempt)
                attempt = None
            show('ready', **{key: current[key] for key in ('kind', 'quality', 'title', 'name', 'bytes', 'sha256')})
            if first and request['action'] == 'open':
                _, path = store.verify_result()
                if os.system('view ' + shlex.quote(str(path))) != 0:
                    raise RuntimeError('NATIVE_ACTION_FAILED')
        except (Exception, KeyboardInterrupt) as error:
            code = failure_cause or ('OWNER_CANCELED' if isinstance(error, KeyboardInterrupt) or cancel.is_set() else safe_error(error, probe))
            if attempt:
                store.cleanup_attempt(attempt)
            phase = 'canceled' if code in {'OWNER_CANCELED', 'JOB_CANCELED'} else 'failed'
            current = {'state': phase, 'error': code}
            show(phase, error=code, hint='cancelDone' if phase == 'canceled' else error_hint(code),
                 retry=request['action'] == 'start'
                 and code not in {'LOCAL_FILE_CHANGED', 'LOCAL_FILE_MISSING', 'RESULT_INVALID', 'LOCAL_PATH_INVALID', 'OUTPUT_FILE_EXISTS'})
        first = False
        # Only explicit UI actions cross to another app or restart a download.
        while True:
            message = inputs.next()
            action = message['action']
            ui.render(last_view)  # acknowledge command before native preview/app switch
            if action == 'return':
                if os.system('open ' + callback_url(request, current)) != 0:
                    show('failed', error='NATIVE_ACTION_FAILED', hint='errorGeneric', retry=False)
                    continue
                return current
            if action == 'preview' and current['state'] == 'ready':
                try:
                    _, path = store.verify_result()
                    if os.system('view ' + shlex.quote(str(path))) != 0:
                        raise RuntimeError('NATIVE_ACTION_FAILED')
                except Exception as error:
                    code = safe_error(error, probe)
                    current = {'state': 'failed', 'error': code}
                    show('failed', error=code, hint=error_hint(code), retry=False)
            if action == 'retry' and request['action'] == 'start' and last_view.get('retry') is not False:
                cancel.clear()
                break


def main(code, root):
    import probe
    request, inputs = None, None
    try:
        if not probe.is_ios():
            raise RuntimeError('IOS_REQUIRED')
        request = decode_request(sys.argv[1] if len(sys.argv) == 2 else '')
        root = Path(root).resolve()
        with exclusive_helper(root):
            inputs = Inputs(sys.stdin, uuid.uuid4().hex)
            ui = NativeUI(code, request, inputs)
            store = JobStore(root, request)
            run_session(store, ui, inputs, probe)
        return 0
    except (Exception, KeyboardInterrupt) as error:
        code = safe_error(error, probe)
        print('LinguistPro: ' + code, flush=True)
        if request:
            os.system('open ' + callback_url(request, {'state': 'failed', 'error': code}))
        return 1
    finally:
        if inputs:
            inputs.stop()
