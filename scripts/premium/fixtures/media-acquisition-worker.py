"""Browser test ONLY: real HTTP/jobs/ffprobe/remux, generated source instead of YouTube."""
import argparse
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'media-acquisition'))
from acquisition_service.main import WorkerApplication, WorkerServer, WorkerHandler
from acquisition_service.media_verify import normalize_and_verify


class SlowHandler(WorkerHandler):
    def setup(self):
        super().setup()
        original = self.wfile

        class SlowWriter:
            def write(self, data):
                if len(data) >= 65536:
                    time.sleep(0.5)
                return original.write(data)

            def __getattr__(self, name):
                return getattr(original, name)
        self.wfile = SlowWriter()


class FixtureBackend:
    def __init__(self, folder):
        self.folder = folder
        for height in (360, 720):
            subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-f', 'lavfi', '-i',
                f'testsrc2=size={height * 16 // 9}x{height}:rate=24', '-f', 'lavfi', '-i',
                'sine=frequency=440:sample_rate=48000', '-t', '8', '-c:v', 'libx264',
                '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-b:v', '8M', '-minrate', '8M',
                '-maxrate', '8M', '-bufsize', '8M', '-x264-params', 'nal-hrd=cbr',
                '-c:a', 'aac', str(folder / f'{height}.mp4')], check=True)
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(folder / '360.mp4'),
                        '-vn', '-c:a', 'copy', str(folder / 'audio.m4a')], check=True)

    def resolve(self, canonical_url):
        return {'id': canonical_url.split('v=')[-1], 'title': 'שיעור עברית — Учебное видео',
            'duration': 8, 'availability': 'public', 'formats': [
                {'format_id': str(height), 'ext': 'mp4', 'height': height, 'vcodec': 'avc1.42001E',
                 'acodec': 'mp4a.40.2', 'filesize': (self.folder / f'{height}.mp4').stat().st_size,
                 'protocol': 'https'} for height in (360, 720)] + [
                {'format_id': '140', 'ext': 'm4a', 'vcodec': 'none', 'acodec': 'mp4a.40.2',
                 'filesize': (self.folder / 'audio.m4a').stat().st_size, 'protocol': 'https', 'abr': 128}]}

    def prepare(self, *, plan, option, job_dir, cancel_event, progress):
        video = option['kind'] == 'video'
        source = self.folder / (f"{option['quality']}.mp4" if video else 'audio.m4a')
        destination = job_dir / source.name
        shutil.copyfile(source, destination)
        progress('VERIFYING', destination.stat().st_size, destination.stat().st_size)
        output, verification = normalize_and_verify(destination, option, plan, cancel_event)
        return output, 'video/mp4' if video else 'audio/mp4', 'fixture.mp4' if video else 'fixture.m4a', verification


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, required=True)
    parser.add_argument('--origin', required=True)
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='lp-browser-worker-') as folder:
        root = Path(folder)
        backend = FixtureBackend(root)
        app = WorkerApplication(secret='browser-fixture-secret-not-production', allowed_origins={args.origin},
                                temp_root=str(root / 'jobs'), backend=backend)
        server = WorkerServer(('127.0.0.1', args.port), app)
        server.RequestHandlerClass = SlowHandler
        server.serve_forever()
