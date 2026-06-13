CREATE OR REPLACE FUNCTION increment_ppv_purchases(item_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE ppv_items SET purchases = purchases + 1 WHERE id = item_id;
$$;
