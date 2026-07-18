-- 048_artifact_tombstones — Sync-hardening P2 (LINGUISTPRO_SYNC_HARDENING_P0P2_DESIGN §3/§6.4).
-- Право-на-удаление для class-C артефактов («Мои тексты»): DELETE-эндпоинт физически удаляет
-- строку learner_artifacts (байты освобождаются), tombstone = маркер события удаления, чтобы
-- DOWN-цикл другого устройства НЕ ресурректил удалённое (BRIDGE_RECON §2.4: удалённый локально
-- текст оставался server-readable и воскресал каждым fullSync). LWW-семантика: правка НОВЕЕ
-- deleted_at воскрешает (PUT снимает tombstone); правка СТАРШЕ — отклоняется DELETED_NEWER и
-- клиент применяет удаление локально. Tombstone ставится ТОЛЬКО при реальном удалении
-- существовавшего артефакта (фантомные ключи не тombstонятся — кап мусора by construction);
-- прюнинг >180 дней — ops-sweep. user_id → автоматически в GDPR export/delete-sweep
-- (динамический PRAGMA-скан identityRepo). NB: consent_records.purged_at НЕ добавляется здесь —
-- колонка существует с миграции 020 (критика F2-1).
CREATE TABLE IF NOT EXISTS artifact_tombstones (
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'text_bundle',
  artifact_key TEXT NOT NULL,
  deleted_at   TEXT NOT NULL,            -- client-claimed (LWW-ось updated_at); clamp к now при future >1ч
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, kind, artifact_key)
);
CREATE INDEX IF NOT EXISTS ix_artifact_tombstones_user ON artifact_tombstones(user_id, kind, created_at);
