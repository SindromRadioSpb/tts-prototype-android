"""Explicit subscription-only text route; run after OAuth and live model discovery.

Does not touch credentials or C2 voice configuration. Caller owns the backup.
"""
import os
from pathlib import Path
import sys
import yaml

model = sys.argv[1]
if not model or len(model) > 128 or not model.startswith('gpt-'):
    raise SystemExit('INVALID_MODEL')
path = Path(os.environ['HERMES_HOME']) / 'config.yaml'
config = yaml.safe_load(path.read_text()) or {}
config['model'] = {'provider': 'openai-codex', 'default': model}
config.pop('fallback_model', None)
config.pop('fallback_models', None)
for slot in (config.get('auxiliary') or {}).values():
    if isinstance(slot, dict):
        slot['provider'] = 'openai-codex'
        slot['model'] = model
        slot.pop('base_url', None)
        slot.pop('api_key', None)
path.write_text(yaml.safe_dump(config, allow_unicode=True, sort_keys=False))
path.chmod(0o600)
print('SUBSCRIPTION_ROUTE_CONFIGURED', model)
