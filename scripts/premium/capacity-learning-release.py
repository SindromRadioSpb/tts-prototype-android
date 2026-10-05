"""Recompute a local capacity gate from a fresh read-only server disk measurement."""
import argparse, datetime, json
from pathlib import Path

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dir', type=Path, default=Path('.tmp/learning-release'))
    args = parser.parse_args()
    seal = read(args.dir / 'release-seal.json')
    upload = read(args.dir / 'upload-dry-run.json')
    restore = read(args.dir / 'rollback-restore-report.json')
    measurement = read(args.dir / 'disk-measurement.json')
    assert seal['manifest_sha256'] == upload['manifest_sha256']
    assert upload['files'] == seal['upload_files']
    assert restore['result'] == 'pass'
    timestamp = datetime.datetime.fromisoformat(measurement['measured_at_utc'].replace('Z', '+00:00'))
    age = (datetime.datetime.now(datetime.timezone.utc) - timestamp).total_seconds()
    assert 0 <= age <= 600, 'Refresh the read-only server disk measurement first'
    components = {
        'new_uncompressed_volume_bytes': seal['volume_bytes'],
        'compressed_request_staging_bytes': upload['compressed_request_bytes'],
        'rollback_archive_bytes': (args.dir / 'rollback-v7.zip').stat().st_size,
        'rollback_restore_workspace_bytes': restore['uncompressed_bytes'],
        'largest_atomic_temporary_bytes': seal['largest_file_bytes'],
        'deploy_working_reserve_bytes': 4 * 1024**3,
    }
    required = sum(components.values())
    report = {**measurement, 'manifest_sha256': seal['manifest_sha256'],
              'components': components, 'required_available_bytes': required,
              'shortfall_bytes': max(0, required - measurement['available_bytes']),
              'spare_bytes': max(0, measurement['available_bytes'] - required),
              'capacity_gate': 'pass' if measurement['available_bytes'] >= required else 'blocked',
              'reserve_basis': '4 GiB build workspace: O-018 (~4 GB/deploy), O-047 (3.2G to 213M at the 725 build peak). Image descriptor size is not a build peak estimate.'}
    cleanup_path = args.dir / 'cleanup-result-private.json'
    if cleanup_path.exists():
        cleanup = read(cleanup_path)
        report['cleanup'] = {key: cleanup[key] for key in ['result', 'reclaimed_df_bytes', 'containers_preserved', 'volumes_preserved']}
    (args.dir / 'capacity-preflight.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report))
    if report['capacity_gate'] != 'pass':
        raise SystemExit(1)

if __name__ == '__main__':
    main()
