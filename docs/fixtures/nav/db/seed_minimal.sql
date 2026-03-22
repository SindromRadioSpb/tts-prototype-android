-- NAV fixtures seed (ALIGNED with migrations/*.sql)
-- Purpose: минимальный стенд SQLite для локального воспроизведения fixtures.
-- ВАЖНО: эта версия соответствует реальным миграциям 002_v3_library.sql, 006_w10_sentence_notes.sql
-- - stable ids: texts.id (=textId), sentences.id (=sentenceId), sentence_notes.id (=noteId)
-- - order_index как НЕ-стабильный (может меняться)

-- НЕ создаём таблицы — используем миграции сервера.
-- Этот seed ТОЛЬКО вставляет данные.

PRAGMA foreign_keys = ON;

-- Seed: texts
-- Обязательные поля: id, text_key, title, source_text
INSERT OR REPLACE INTO texts(id, text_key, title, level, tags_json, source_text, is_archived, created_at, updated_at) VALUES
('t_1001', 'fixture_aluminum_ageing', 'Aluminum ageing — fixture', 'A', '["materials","aluminum"]', 'Fixture source text for aluminum ageing.', 0, '2026-01-18T00:00:00Z', '2026-01-18T00:00:00Z'),
('t_1002', 'fixture_corrosion_basics', 'Corrosion basics — fixture', 'A', '["materials","corrosion"]', 'Fixture source text for corrosion basics.', 0, '2026-01-18T00:00:00Z', '2026-01-18T00:00:00Z');

-- Seed: sentences (реальная таблица, не library_rows)
-- id = sentenceId (stable), text_id = textId, order_index = позиция
DELETE FROM sentences WHERE text_id IN ('t_1001', 't_1002');

INSERT INTO sentences(id, text_id, order_index, he_plain, he_niqqud, translit, ru, created_at) VALUES
('s_0006','t_1001',0,'הזדקנות אלומיניום משנה את החוזק.','הַזְדָּקְנוּת אֲלוּמִינְיוּם מְשַׁנָּה אֶת הַחוֹזֶק.','hazdaknút aluminjúm meshanná et haḥózek.','Старение алюминия изменяет прочность.','2026-01-18T00:01:00Z'),
('s_0007','t_1001',1,'הקשיה משקעים תלויה בזמן ובטמפרטורה.','הַקְשָׁיָה מִשְׁקָעִים תְּלוּיָה בִּזְמַן וּבְטֶמְפֶּרָטוּרָה.','hakshayá mishka''ím tluyá bizmán uvetemperatúra.','Упрочнение выделениями зависит от времени и температуры.','2026-01-18T00:02:00Z'),
('s_0008','t_1001',2,'הזדקנות טבעית מתרחשת בטמפרטורת חדר.','הַזְדָּקְנוּת טִבְעִית מִתְרַחֶשֶׁת בְּטֶמְפֶּרָטוּרַת חֶדֶר.','hazdaknút tiv''ít mitraḥéshet betemperatúrat ḥéder.','Естественное старение происходит при комнатной температуре.','2026-01-18T00:03:00Z'),

('s_0001','t_1002',0,'קורוזיה היא תגובה כימית עם הסביבה.','קוֹרוֹזְיָה הִיא תְּגוּבָה כִּימִית עִם הַסְּבִיבָה.','korózya hi tguvá kimít im hasvivá.','Коррозия — химическая реакция со средой.','2026-01-18T00:04:00Z'),
('s_0002','t_1002',1,'הגנה קתודית יכולה להפחית קורוזיה.','הֲגָנָה קָתוֹדִית יְכוֹלָה לְהַפְחִית קוֹרוֹזְיָה.','haganá katódít ykholá lehafḥít korózya.','Катодная защита может снизить коррозию.','2026-01-18T00:05:00Z'),
('s_0003','t_1002',2,'בסביבה כלורידית מתפתח פיטינג.','בִּסְבִיבָה כְּלוֹרִידִית מִתְפַּתֵּחַ פִּיטִינְג.','bisvivá kloridít mitpatéaḥ piting.','В хлоридной среде развивается питтинг.','2026-01-18T00:06:00Z'),
('s_0004','t_1002',3,'שכבת פסיבציה יכולה להגן על מתכת.','שִׁכְבַת פָּסִיבַצְיָה יְכוֹלָה לְהָגֵן עַל מַתֶּכֶת.','shikhvát pasivatsyá ykholá lehagén al matékhet.','Пассивирующий слой может защищать металл.','2026-01-18T00:07:00Z');

-- Seed: notes
-- id = noteId, note = content (не content_md)
DELETE FROM sentence_notes WHERE text_id IN ('t_1001', 't_1002');

INSERT INTO sentence_notes(id, text_id, sentence_id, note, created_at, updated_at) VALUES
('n_501','t_1001','s_0007','Fixture note n_501: кратко про осадки и упрочнение (precipitation hardening).','2026-01-18T00:10:00Z','2026-01-18T00:10:00Z'),
('n_502','t_1002','s_0003','Fixture note n_502: питтинг в хлоридной среде; напоминание про пассивацию.','2026-01-18T00:12:00Z','2026-01-18T00:12:00Z');
