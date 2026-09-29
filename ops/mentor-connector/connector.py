"""M1 outbound-only connector. No browser cookies or provider credentials at relay.

Pair using a one-time code on stdin, then poll using the locally protected token.
The runner is an explicit argv list: no shell, no remotely supplied executable.
"""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError('RELAY_REDIRECT_REJECTED')


class Relay:
    def __init__(self, origin, token='', allow_local=False):
        parsed = urllib.parse.urlsplit(origin)
        local = parsed.hostname in ('127.0.0.1', 'localhost', '::1', 'host.docker.internal')
        if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/'):
            raise ValueError('INVALID_RELAY_ORIGIN')
        if parsed.scheme != 'https' and not (allow_local and local and parsed.scheme == 'http'):
            raise ValueError('HTTPS_REQUIRED')
        self.origin, self.token = origin.rstrip('/'), token
        self.opener = urllib.request.build_opener(NoRedirect())

    def call(self, path, body):
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = 'Bearer ' + self.token
        req = urllib.request.Request(self.origin + '/api/tutor' + path,
            data=json.dumps(body).encode(), headers=headers, method='POST')
        try:
            with self.opener.open(req, timeout=12) as response:
                raw = response.read(64001)
                if len(raw) > 64000:
                    raise ValueError('RELAY_RESPONSE_TOO_LARGE')
                value = json.loads(raw)
                if not value.get('ok'):
                    raise ValueError('RELAY_REJECTED')
                return value
        except urllib.error.HTTPError as exc:
            # Do not echo response bodies, URLs, request data or credentials to logs.
            if exc.code in (401, 403):
                raise PermissionError('CONNECTION_REVOKED') from None
            raise ConnectionError('RELAY_HTTP_' + str(exc.code)) from None


def run_job(relay, job, runner):
    """A lease is never inferred to be permission after a heartbeat fails."""
    path = '/connector/' + urllib.parse.quote(job['session_id'], safe='')
    with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
        proc = subprocess.Popen(runner, stdin=subprocess.PIPE, stdout=output, stderr=errors,
                                start_new_session=os.name != 'nt')
        try:
            proc.stdin.write(json.dumps(job, ensure_ascii=False).encode('utf-8'))
            proc.stdin.close()
            heartbeat_at = 0
            while proc.poll() is None:
                if time.time() * 1000 >= job['deadline']:
                    return
                if output.tell() > 64000 or errors.tell() > 64000:
                    return
                if time.monotonic() >= heartbeat_at:
                    try:
                        state = relay.call(path + '/heartbeat', {'lease': job['lease']})['state']
                    except (ConnectionError, PermissionError, OSError, ValueError):
                        return
                    if state != 'running':
                        return
                    heartbeat_at = time.monotonic() + 5
                time.sleep(.2)
            output.seek(0)
            try:
                response = json.loads(output.read(20001))
                if proc.returncode != 0 or not isinstance(response, dict):
                    raise ValueError()
            except (ValueError, UnicodeError):
                response = {'schema_version': 'lp-tutor-response.1', 'context_id': job['context']['context_id'],
                    'excerpt_digest': job['context']['excerpt_digest'], 'error': 'runtime_failed'}
            # Retry delivery of the SAME result, not model execution. Server handles dedupe.
            for attempt in range(3):
                try:
                    relay.call(path + '/complete', {'lease': job['lease'], 'response': response})
                    return
                except PermissionError:
                    return
                except (ConnectionError, OSError, ValueError):
                    if attempt < 2:
                        time.sleep(1)
        finally:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    proc.kill(); proc.wait(timeout=3)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--origin', required=True)
    parser.add_argument('--credentials', type=Path, required=True)
    parser.add_argument('--pair', action='store_true')
    parser.add_argument('--allow-local', action='store_true')
    parser.add_argument('--once', action='store_true')
    parser.add_argument('runner', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    relay = Relay(args.origin, allow_local=args.allow_local)
    if args.pair:
        print('Enter the one-time pairing code:', file=sys.stderr)
        code = sys.stdin.readline().strip()
        nonce = secrets.token_urlsafe(32)
        result = relay.call('/connector/pair', {'pairing_code': code, 'client_nonce': nonce})
        if result.get('client_nonce') != nonce:
            raise ValueError('PAIRING_BINDING_INVALID')
        args.credentials.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(args.credentials, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as file:
            json.dump({'origin': relay.origin, 'token': result['token']}, file)
        os.chmod(args.credentials, 0o600)
        print('PAIRED')
        return
    cfg = json.loads(args.credentials.read_text())
    if cfg['origin'] != relay.origin:
        raise ValueError('CREDENTIAL_ORIGIN_MISMATCH')
    if os.name != 'nt' and args.credentials.stat().st_mode & 0o077:
        raise ValueError('CREDENTIAL_PERMISSIONS_TOO_OPEN')
    relay.token = cfg['token']
    runner = args.runner[1:] if args.runner[:1] == ['--'] else args.runner
    if not runner:
        parser.error('An explicit local runner command is required')
    while True:
        try:
            job = relay.call('/connector/next', {}).get('job')
            if job:
                run_job(relay, job, runner)
        except PermissionError:
            print('CONNECTION_REVOKED', file=sys.stderr)
            return
        except (ConnectionError, OSError, ValueError):
            print('RELAY_UNAVAILABLE', file=sys.stderr)
        if args.once:
            return
        time.sleep(3)


if __name__ == '__main__':
    main()
