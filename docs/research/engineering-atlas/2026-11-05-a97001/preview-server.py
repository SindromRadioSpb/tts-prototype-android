"""Local anonymous static preview; serves only public assets and this atlas."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
ROOT = Path(__file__).resolve().parents[4]
class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, request):
        rel = unquote(urlsplit(request).path).lstrip('/')
        base = ROOT if rel.startswith('data/atlas/a97001/') else ROOT/'public'
        target = (base/rel).resolve()
        if not target.is_relative_to(base.resolve()):
            return str(base/'__unavailable__')
        return str(target)
    def log_message(self, *args):
        pass
print('Atlas preview: http://127.0.0.1:8097', flush=True)
ThreadingHTTPServer(('127.0.0.1',8097),Handler).serve_forever()
