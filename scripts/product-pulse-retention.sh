#!/usr/bin/env bash
# Umami 3.0.3 PostgreSQL, only one explicitly supplied analytics website.
# Default is read-only. Cron uses --apply after an inventory / dry-run.
set -euo pipefail
container="${1:?PostgreSQL container required}"
website="${2:?Umami website UUID required}"
mode="${3:---dry-run}"
[[ "$container" =~ ^[a-zA-Z0-9_-]+$ ]] || exit 2
[[ "$website" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]] || exit 2
[[ "$mode" == "--apply" || "$mode" == "--dry-run" ]] || exit 2
psql_in_container() {
  docker exec -i "$container" sh -c 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
}
if [[ "$mode" == "--dry-run" ]]; then
  psql_in_container <<SQL
BEGIN READ ONLY;
SET LOCAL statement_timeout='30s';
SELECT count(*) AS expired_events FROM website_event WHERE website_id='$website'::uuid AND created_at < now()-interval '90 days';
SELECT count(*) AS expired_event_properties FROM event_data WHERE website_id='$website'::uuid AND created_at < now()-interval '90 days';
COMMIT;
SQL
  exit
fi
psql_in_container <<SQL
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='2s';
SELECT pg_advisory_xact_lock(hashtext('linguistpro-product-pulse-retention'));
DELETE FROM event_data WHERE website_id='$website'::uuid AND (created_at < now()-interval '90 days' OR website_event_id IN (SELECT event_id FROM website_event WHERE website_id='$website'::uuid AND created_at < now()-interval '90 days'));
DELETE FROM website_event WHERE website_id='$website'::uuid AND created_at < now()-interval '90 days';
DELETE FROM session_data WHERE website_id='$website'::uuid AND created_at < now()-interval '90 days';
DELETE FROM session s WHERE s.website_id='$website'::uuid AND s.created_at < now()-interval '90 days' AND NOT EXISTS (SELECT 1 FROM website_event e WHERE e.session_id=s.session_id) AND NOT EXISTS (SELECT 1 FROM session_data d WHERE d.session_id=s.session_id);
COMMIT;
SQL
