-- 025_channel_stats.sql
-- D1 channel-aware агрегация «судьбы слова» (AI_MENTOR_RECON §14 D1, пре-условие CLG-P6 №3).
-- srs_projections.channel_stats_json — DERIVED-агрегат review-строк лога по семьям каналов:
--   production (dictate/reverse — порождение формы) vs receptive (всё остальное).
-- Форма: {"production":{"reps","again","hard","good","last_at","last_grade"},"receptive":{...}}.
-- Пересчитывается recomputeForKeys/rebuildAll (как весь derived-кэш); NULL = review-строк нет.
-- Классификатор семей — ЕДИНСТВЕННЫЙ источник: public/js/grade-policy.js (общий с клиентом).
-- Без BEGIN/COMMIT (раннер сам оборачивает).

ALTER TABLE srs_projections ADD COLUMN channel_stats_json TEXT;
