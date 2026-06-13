alter table ppv_items
  add column if not exists triggers text[] default '{}',
  add column if not exists min_price_stars int default 150,
  add column if not exists bargaining_enabled boolean default true;
