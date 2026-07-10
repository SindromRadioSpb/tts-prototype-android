-- CLG-P8.3 — surface-generalization agent_challenges (SPEC §4 в редакции §9 п.6: rebuild ОТМЕНЁН,
-- additive-only). telegram_chat_id ОСТАЁТСЯ NOT NULL: у miniapp-challenge chat_id заполняется из
-- активного channel_link (существует by construction — miniapp-сессия требует активную связку).
-- surface-enum валидируется в коде (паттерн 034), НЕ CHECK'ом. hint_used_at — единственный дом
-- факта hint-демоции (§9 п.7): evidence_scope на строке НЕ мутируется, scope выводит reviewer.
ALTER TABLE agent_challenges ADD COLUMN surface TEXT NOT NULL DEFAULT 'telegram_bot';
ALTER TABLE agent_challenges ADD COLUMN hint_used_at TEXT;
