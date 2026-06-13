CREATE TABLE IF NOT EXISTS ppv_purchases (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id      uuid        REFERENCES bots(id)      ON DELETE CASCADE,
  item_id     uuid        REFERENCES ppv_items(id) ON DELETE SET NULL,
  tg_user_id  bigint,
  chat_id     bigint,
  amount_stars integer    NOT NULL DEFAULT 0,
  payload     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ppv_purchases_bot_id_idx     ON ppv_purchases(bot_id);
CREATE INDEX IF NOT EXISTS ppv_purchases_created_at_idx ON ppv_purchases(created_at);
CREATE INDEX IF NOT EXISTS ppv_purchases_item_id_idx    ON ppv_purchases(item_id);

-- Back-fill purchases counter from existing tg_updates payment records
UPDATE ppv_items pi
SET purchases = sub.cnt
FROM (
  SELECT
    SPLIT_PART(payload, ':', 2)::uuid AS item_id,
    COUNT(*) AS cnt
  FROM tg_updates
  WHERE type = 'payment'
    AND payload LIKE 'ppv:%'
    AND payload ~ '^ppv:[0-9a-f-]{36}$'
  GROUP BY 1
) sub
WHERE pi.id = sub.item_id;
