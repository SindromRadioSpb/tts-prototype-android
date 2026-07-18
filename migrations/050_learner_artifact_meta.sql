-- S-пакет S1 — sidecar bounded-метаданных личных текстов (DESIGN §1.1/§6, решение владельца
-- §0.1-5: PUT-time экстракция title/rows_count ДО агентских согласий; наружу без scope не
-- отдаётся). R12: derived-at-put, rebuildable (reconcile в ops-sweep по built_at<ingested_at);
-- композитный FK ON DELETE CASCADE даёт каскады deleteArtifact/purge/GDPR by construction —
-- ручных писателей-каскадов нет. title хранится char-slice(0,128) — правило усечения ЕДИНОЕ
-- с put-путём по построению (SQL substr == JS slice, посимвольно; критика: byte-slice дал бы
-- расхождение JS/SQL на иврите + mojibake).
CREATE TABLE IF NOT EXISTS learner_artifact_meta (
  user_id      TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'text_bundle',
  artifact_key TEXT NOT NULL,
  title        TEXT,                     -- nullable: битый/бесформенный payload → честный NULL
  rows_count   INTEGER,
  built_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, kind, artifact_key),
  FOREIGN KEY (user_id, kind, artifact_key)
    REFERENCES learner_artifacts(user_id, kind, artifact_key) ON DELETE CASCADE
);

-- Backfill существующих артефактов — ПОСЛЕДНИМ стейтментом цепочки (критика-BLOCKER:
-- json_extract на malformed-JSON = SQLITE_ERROR, не NULL → json_valid-guard обязателен,
-- иначе один байт-мусорный payload клинит ВСЮ миграционную цепочку). Разовый эквивалент
-- PUT-time экстракции (покрыт §0.1-5). Канонический путь = $.texts[0] (первичный путь
-- единственного парсера agentSentenceRepo; $.library.texts — зеркало того же массива).
-- json_array_length: missing → NULL, не-массив → 0 — NULL-терпимо by construction.
INSERT OR REPLACE INTO learner_artifact_meta (user_id, kind, artifact_key, title, rows_count)
  SELECT user_id, kind, artifact_key,
         substr(json_extract(payload_json, '$.texts[0].title'), 1, 128),
         json_array_length(payload_json, '$.texts[0].rows')
    FROM learner_artifacts
   WHERE kind = 'text_bundle' AND json_valid(payload_json);
