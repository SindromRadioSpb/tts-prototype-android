"""Pinned compatibility fix: Hermes now requires an editable installation."""
import hashlib
from pathlib import Path

path = Path('/hermeswebui_init.bash')
source = path.read_text()
old = '    uv pip install "$_stage_src[all]" --trusted-host'
assert source.count(old) == 1, 'Upstream install contract changed'
source = source.replace(old, '    uv pip install -e "$_stage_src[all]" --trusted-host')
# Editable metadata must reference a retained directory across container restarts.
assert source.count('_stage_src="/tmp/hermes-agent-build"') == 1
source = source.replace('_stage_src="/tmp/hermes-agent-build"', '_stage_src="/app/hermes-agent-build"')
old_cleanup = '    rm -rf "$_stage_src"\n  else'
assert source.count(old_cleanup) == 1, 'Upstream cleanup contract changed'
source = source.replace(old_cleanup, '    # Retain the editable source for the lifetime of this container.\n  else')
path.write_text(source)
print('INSTALLER_EDITABLE_PATCH_PASS', hashlib.sha256(source.encode()).hexdigest())
