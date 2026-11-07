"""Verify a complete unpacked delivery; optional independent restore/re-export test."""
import argparse
import hashlib
import json
from pathlib import Path
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import material_snapshot as snapshot

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--roundtrip', type=Path, help='New, nonexistent test directory outside delivery')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    expected = json.loads((root / 'CHECKSUMS.json').read_text(encoding='utf8'))
    actual = snapshot.inventory(root)
    actual.pop('CHECKSUMS.json', None)
    if actual != expected:
        raise ValueError('Delivery file inventory mismatch')
    inventory = snapshot.verify(root / 'material')
    snapshot.validate_import(root / 'material/payload')
    result = {'delivery_files':len(expected)+1, 'material_files':len(inventory),
              'checksums':'passed','semantic_validation':'passed','roundtrip':'not_requested'}
    if args.roundtrip:
        destination = args.roundtrip.resolve()
        if destination.exists() or root == destination or root in destination.parents:
            raise ValueError('Roundtrip destination must be new and outside delivery')
        destination.mkdir(parents=True)
        snapshot.transfer(root / 'material/payload', destination / 'restored')
        snapshot.validate_import(destination / 'restored')
        snapshot.transfer(destination / 'restored', destination / 'reexport', export=True)
        if snapshot.verify(destination / 'reexport') != inventory:
            raise ValueError('Roundtrip mismatch')
        if snapshot.inventory(root / 'material/payload') != inventory:
            raise ValueError('Original material changed')
        result['roundtrip'] = 'passed'
        (destination / 'verification.json').write_text(json.dumps(result,indent=2),encoding='utf8')
    print(json.dumps(result,indent=2))

if __name__ == '__main__':
    main()
