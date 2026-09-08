"""Ephemeral same-device UI transport. No media or arbitrary filesystem routes."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import threading


class LocalUI:
    def __init__(self, code, config, state, message):
        self.state, self.message = state, message
        self.token = secrets.token_hex(32)
        owner = self
        root = Path(code)
        assets = {
            '': ('text/html; charset=utf-8', b'<!doctype html><html><head><meta charset="utf-8">'
                 b'<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
                 b'<title>LinguistPro</title><link rel="icon" href="data:,">'
                 b'<link rel="stylesheet" href="ui.css"><script src="config.js" defer></script>'
                 b'<script src="ui.js" defer></script><script src="start.js" defer></script>'
                 b'</head><body></body></html>'),
            'ui.js': ('text/javascript; charset=utf-8', (root / 'ui.js').read_bytes()),
            'ui.css': ('text/css; charset=utf-8', (root / 'ui.css').read_bytes()),
            'start.js': ('text/javascript; charset=utf-8', b'window.LPPhoneNative.install(window.LPPhoneConfig);'),
        }

        class Handler(BaseHTTPRequestHandler):
            server_version = 'LinguistProLocalUI'
            def setup(self):
                super().setup()
                self.connection.settimeout(5)

            def log_message(self, *_args):
                pass  # Never log capability URL, metadata or user choices.

            def answer(self, status, content=b'', mime='text/plain; charset=utf-8'):
                self.send_response(status)
                self.send_header('Content-Type', mime)
                self.send_header('Content-Length', str(len(content)))
                self.send_header('Cache-Control', 'no-store')
                self.send_header('Referrer-Policy', 'no-referrer')
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.send_header('X-Frame-Options', 'DENY')
                self.send_header('Content-Security-Policy', "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
                self.end_headers()
                try:
                    self.wfile.write(content)
                except (BrokenPipeError, ConnectionResetError):
                    pass  # UI/app switching may close a polling connection.

            def route(self):
                if self.headers.get('Host') != owner.host or not self.path.startswith(owner.prefix):
                    self.answer(404)
                    return None
                return self.path[len(owner.prefix):]

            def do_GET(self):
                route = self.route()
                if route is None:
                    return
                if route == 'state':
                    self.answer(200, json.dumps(owner.state(), ensure_ascii=True).encode(), 'application/json')
                elif route == 'config.js':
                    value = {**config, 'endpoint': owner.prefix, 'ack': owner.state().get('ack', 0)}
                    self.answer(200, ('window.LPPhoneConfig=' + json.dumps(value, ensure_ascii=True) + ';').encode(), 'text/javascript')
                elif route in assets:
                    mime, data = assets[route]
                    self.answer(200, data, mime)
                else:
                    self.answer(404)

            def do_POST(self):
                route = self.route()
                if route is None:
                    return
                if route != 'command':
                    self.answer(404)
                    return
                if (self.headers.get('Origin') != owner.origin
                        or self.headers.get('Content-Type') != 'application/json'
                        or not secrets.compare_digest(self.headers.get('X-LP-Session', ''), config['session'])
                        or self.headers.get('Transfer-Encoding')):
                    self.answer(403)
                    return
                try:
                    size = int(self.headers.get('Content-Length', '0'))
                except ValueError:
                    size = 0
                if not 1 <= size <= 4096:
                    self.answer(413)
                    return
                body = self.rfile.read(size)
                if len(body) != size:
                    self.answer(400)
                    return
                try:
                    if not isinstance(json.loads(body), dict):
                        raise ValueError()
                except (ValueError, UnicodeError):
                    self.answer(400)
                    return
                owner.message(body)
                self.answer(200, json.dumps(owner.state(), ensure_ascii=True).encode(), 'application/json')

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.server.daemon_threads = True
        self.host = '127.0.0.1:' + str(self.server.server_port)
        self.origin = 'http://' + self.host
        self.prefix = '/session/' + self.token + '/'
        self.url = self.origin + self.prefix
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={'poll_interval': .1}, daemon=True)
        self.thread.start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
