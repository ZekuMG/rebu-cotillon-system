select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'products'
  and indexname = 'products_updated_at_id_idx';
