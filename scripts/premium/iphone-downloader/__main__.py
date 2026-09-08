"""Entry inside the already hash-verified archive. No unverified code extraction."""
import hashlib
import json
from pathlib import Path, PurePosixPath
import runpy
import sys
import tempfile
import zipfile


def unpack(archive_path):
    archive_path = Path(archive_path).resolve()
    with zipfile.ZipFile(archive_path) as archive:
        manifest = json.loads(archive.read('manifest.json'))
        files = manifest['files']
        if set(archive.namelist()) != set(files) | {'manifest.json'}:
            raise ValueError('PACKAGE_CONTENT_INVALID')
        data = {}
        for name, digest in files.items():
            path = PurePosixPath(name)
            if path.is_absolute() or '..' in path.parts or '\\' in name or ':' in name:
                raise ValueError('PACKAGE_PATH_INVALID')
            content = archive.read(name)
            if hashlib.sha256(content).hexdigest() != digest:
                raise ValueError('PACKAGE_CONTENT_INVALID')
            data[name] = content
    code = archive_path.parent / (archive_path.stem + '-code')
    if code.is_symlink() or not code.resolve().is_relative_to(archive_path.parent):
        raise ValueError('PACKAGE_PATH_INVALID')
    if not code.exists():
        with tempfile.TemporaryDirectory(prefix='.code-stage-', dir=archive_path.parent) as temp:
            stage = Path(temp)
            for name, content in data.items():
                target = stage / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
            stage.rename(code)
    for name, digest in files.items():
        target = (code / name).resolve()
        if not target.is_relative_to(code.resolve()) or hashlib.sha256(target.read_bytes()).hexdigest() != digest:
            raise ValueError('INSTALLED_CODE_CHANGED')
    return code


if __name__ == '__main__':
    code_root = unpack(sys.argv[0])
    sys.path.insert(0, str(code_root))
    import runner
    raise SystemExit(runner.main(code_root, Path(sys.argv[0]).resolve().parent.parent))
