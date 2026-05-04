-- Supabase database size diagnostics for cotillon-rebu-db.
-- Safe first pass: read-only SELECT statements only.
-- Run this from Supabase SQL Editor and keep the result sets for review.
-- This script does not delete rows, does not vacuum, and does not change schema.

-- ============================================================================
-- 1) Database size and largest relations
-- ============================================================================

select
  current_database() as database_name,
  pg_database_size(current_database()) as database_size_bytes,
  pg_size_pretty(pg_database_size(current_database())) as database_size;

with relation_sizes as (
  select
    n.nspname as schema_name,
    c.relname as relation_name,
    case c.relkind
      when 'r' then 'table'
      when 'm' then 'materialized_view'
      when 'p' then 'partitioned_table'
      else c.relkind::text
    end as relation_type,
    pg_total_relation_size(c.oid) as total_bytes,
    pg_relation_size(c.oid) as table_bytes,
    pg_indexes_size(c.oid) as index_bytes,
    greatest(
      pg_total_relation_size(c.oid) - pg_relation_size(c.oid) - pg_indexes_size(c.oid),
      0
    ) as toast_bytes,
    coalesce(s.n_live_tup, 0) as estimated_rows,
    coalesce(s.n_dead_tup, 0) as dead_rows,
    s.last_vacuum,
    s.last_autovacuum,
    s.last_analyze,
    s.last_autoanalyze
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_stat_all_tables s on s.relid = c.oid
  where c.relkind in ('r', 'm', 'p')
    and n.nspname not in ('pg_catalog', 'information_schema')
    and n.nspname not like 'pg_toast%'
)
select
  schema_name,
  relation_name,
  relation_type,
  pg_size_pretty(total_bytes) as total_size,
  pg_size_pretty(table_bytes) as table_size,
  pg_size_pretty(index_bytes) as indexes_size,
  pg_size_pretty(toast_bytes) as toast_size,
  estimated_rows,
  dead_rows,
  round((dead_rows::numeric / nullif(estimated_rows + dead_rows, 0)) * 100, 2) as dead_row_pct,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
from relation_sizes
order by total_bytes desc
limit 75;

-- Public tables focused view.
select
  schemaname,
  relname as table_name,
  n_live_tup as estimated_rows,
  n_dead_tup as dead_rows,
  round((n_dead_tup::numeric / nullif(n_live_tup + n_dead_tup, 0)) * 100, 2) as dead_row_pct,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
from pg_stat_user_tables
order by n_live_tup desc;

-- Exact row counts for the app tables used by this project.
-- If a table is missing in an older database, run the remaining SELECTs manually.
select 'products' as table_name, count(*) as rows from public.products
union all select 'clients', count(*) from public.clients
union all select 'sales', count(*) from public.sales
union all select 'sale_items', count(*) from public.sale_items
union all select 'logs', count(*) from public.logs
union all select 'expenses', count(*) from public.expenses
union all select 'cash_closures', count(*) from public.cash_closures
union all select 'budgets', count(*) from public.budgets
union all select 'orders', count(*) from public.orders
union all select 'agenda_contacts', count(*) from public.agenda_contacts
union all select 'categories', count(*) from public.categories
union all select 'rewards', count(*) from public.rewards
union all select 'offers', count(*) from public.offers
union all select 'register_state', count(*) from public.register_state
order by rows desc;

-- ============================================================================
-- 2) Index size, low-use indexes, and possible duplicates
-- ============================================================================

with index_sizes as (
  select
    s.schemaname,
    s.relname as table_name,
    s.indexrelname as index_name,
    pg_relation_size(s.indexrelid) as index_bytes,
    s.idx_scan,
    s.idx_tup_read,
    s.idx_tup_fetch,
    i.indisprimary as is_primary,
    i.indisunique as is_unique,
    pg_get_indexdef(s.indexrelid) as index_definition
  from pg_stat_all_indexes s
  join pg_index i on i.indexrelid = s.indexrelid
  where s.schemaname not in ('pg_catalog', 'information_schema')
)
select
  schemaname,
  table_name,
  index_name,
  pg_size_pretty(index_bytes) as index_size,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  is_primary,
  is_unique,
  index_definition
from index_sizes
order by index_bytes desc
limit 75;

select
  s.schemaname,
  s.relname as table_name,
  s.indexrelname as index_name,
  pg_size_pretty(pg_relation_size(s.indexrelid)) as index_size,
  s.idx_scan,
  i.indisprimary as is_primary,
  i.indisunique as is_unique,
  pg_get_indexdef(s.indexrelid) as index_definition
from pg_stat_all_indexes s
join pg_index i on i.indexrelid = s.indexrelid
where s.schemaname = 'public'
  and not i.indisprimary
  and s.idx_scan = 0
order by pg_relation_size(s.indexrelid) desc;

with normalized_indexes as (
  select
    schemaname,
    tablename,
    indexname,
    regexp_replace(indexdef, '^CREATE (UNIQUE )?INDEX [^ ]+ ON ', 'CREATE \1INDEX ON ') as normalized_definition,
    indexdef
  from pg_indexes
  where schemaname = 'public'
)
select
  schemaname,
  tablename,
  count(*) as matching_indexes,
  array_agg(indexname order by indexname) as index_names,
  min(normalized_definition) as normalized_definition
from normalized_indexes
group by schemaname, tablename, normalized_definition
having count(*) > 1
order by matching_indexes desc, tablename;

-- ============================================================================
-- 3) Columns that can hold large payloads
-- ============================================================================

select
  table_schema,
  table_name,
  column_name,
  data_type
from information_schema.columns
where table_schema in ('public', 'storage', 'auth')
  and data_type in ('text', 'json', 'jsonb', 'bytea')
order by table_schema, table_name, column_name;

-- Generates optional per-column size queries for every text/json/jsonb/bytea column.
-- Copy the generated_sql rows for columns that look suspicious.
select
  format(
    'select %L as source, count(*) as rows, pg_size_pretty(coalesce(sum(pg_column_size(%I)),0)::bigint) as total_size, pg_size_pretty(coalesce(max(pg_column_size(%I)),0)::bigint) as largest_value from %I.%I;',
    table_schema || '.' || table_name || '.' || column_name,
    column_name,
    column_name,
    table_schema,
    table_name
  ) as generated_sql
from information_schema.columns
where table_schema in ('public', 'storage', 'auth')
  and data_type in ('text', 'json', 'jsonb', 'bytea')
order by table_schema, table_name, column_name;

-- ============================================================================
-- 4) App-specific heavy columns and snapshots
-- ============================================================================

with heavy_columns as (
  select
    'logs.details' as source,
    count(*) as rows,
    coalesce(sum(pg_column_size(details)), 0)::bigint as total_bytes,
    coalesce(max(pg_column_size(details)), 0)::bigint as largest_bytes
  from public.logs
  union all
  select
    'cash_closures.transactions_snapshot',
    count(*),
    coalesce(sum(pg_column_size(transactions_snapshot)), 0)::bigint,
    coalesce(max(pg_column_size(transactions_snapshot)), 0)::bigint
  from public.cash_closures
  union all
  select
    'cash_closures.expenses_snapshot',
    count(*),
    coalesce(sum(pg_column_size(expenses_snapshot)), 0)::bigint,
    coalesce(max(pg_column_size(expenses_snapshot)), 0)::bigint
  from public.cash_closures
  union all
  select
    'cash_closures.items_sold_list',
    count(*),
    coalesce(sum(pg_column_size(items_sold_list)), 0)::bigint,
    coalesce(max(pg_column_size(items_sold_list)), 0)::bigint
  from public.cash_closures
  union all
  select
    'cash_closures.new_clients_list',
    count(*),
    coalesce(sum(pg_column_size(new_clients_list)), 0)::bigint,
    coalesce(max(pg_column_size(new_clients_list)), 0)::bigint
  from public.cash_closures
  union all
  select
    'cash_closures.payment_methods_summary',
    count(*),
    coalesce(sum(pg_column_size(payment_methods_summary)), 0)::bigint,
    coalesce(max(pg_column_size(payment_methods_summary)), 0)::bigint
  from public.cash_closures
  union all
  select
    'budgets.items_snapshot',
    count(*),
    coalesce(sum(pg_column_size(items_snapshot)), 0)::bigint,
    coalesce(max(pg_column_size(items_snapshot)), 0)::bigint
  from public.budgets
  union all
  select
    'orders.items_snapshot',
    count(*),
    coalesce(sum(pg_column_size(items_snapshot)), 0)::bigint,
    coalesce(max(pg_column_size(items_snapshot)), 0)::bigint
  from public.orders
)
select
  source,
  rows,
  pg_size_pretty(total_bytes) as total_size,
  pg_size_pretty(largest_bytes) as largest_value,
  round(total_bytes::numeric / nullif(rows, 0), 2) as avg_bytes_per_row
from heavy_columns
order by total_bytes desc;

select
  id,
  created_at,
  action,
  reason,
  pg_size_pretty(pg_column_size(details)::bigint) as details_size,
  left(details::text, 240) as details_preview
from public.logs
order by pg_column_size(details) desc nulls last
limit 50;

select
  id,
  created_at,
  date,
  type,
  pg_size_pretty(pg_column_size(transactions_snapshot)::bigint) as transactions_snapshot_size,
  pg_size_pretty(pg_column_size(expenses_snapshot)::bigint) as expenses_snapshot_size,
  pg_size_pretty(pg_column_size(items_sold_list)::bigint) as items_sold_list_size,
  sales_count,
  total_sales
from public.cash_closures
order by (
  coalesce(pg_column_size(transactions_snapshot), 0)
  + coalesce(pg_column_size(expenses_snapshot), 0)
  + coalesce(pg_column_size(items_sold_list), 0)
) desc
limit 50;

select
  'budget' as record_type,
  id,
  created_at,
  customer_name,
  total_amount,
  is_active,
  pg_size_pretty(pg_column_size(items_snapshot)::bigint) as items_snapshot_size,
  left(items_snapshot::text, 240) as items_preview
from public.budgets
order by pg_column_size(items_snapshot) desc nulls last
limit 25;

select
  'order' as record_type,
  id,
  created_at,
  customer_name,
  status,
  total_amount,
  is_active,
  pg_size_pretty(pg_column_size(items_snapshot)::bigint) as items_snapshot_size,
  left(items_snapshot::text, 240) as items_preview
from public.orders
order by pg_column_size(items_snapshot) desc nulls last
limit 25;

-- ============================================================================
-- 5) Images, files, base64, and storage metadata
-- ============================================================================

select
  count(*) as products,
  count(*) filter (where image like 'data:image/%') as image_base64_rows,
  count(*) filter (where image_thumb like 'data:image/%') as thumb_base64_rows,
  count(*) filter (where image like '%/storage/v1/object/public/product-images/%') as storage_image_rows,
  count(*) filter (where image_thumb like '%/storage/v1/object/public/product-images/%') as storage_thumb_rows,
  count(*) filter (where coalesce(image, '') = '') as empty_image_rows,
  count(*) filter (where coalesce(image_thumb, '') = '') as empty_thumb_rows,
  pg_size_pretty(coalesce(sum(octet_length(image)), 0)::bigint) as image_text_size,
  pg_size_pretty(coalesce(sum(octet_length(image_thumb)), 0)::bigint) as thumb_text_size,
  pg_size_pretty(coalesce(max(octet_length(image)), 0)::bigint) as largest_image_text,
  pg_size_pretty(coalesce(max(octet_length(image_thumb)), 0)::bigint) as largest_thumb_text
from public.products;

select
  id,
  title,
  is_active,
  pg_size_pretty(octet_length(image)::bigint) as image_size,
  left(image, 120) as image_prefix
from public.products
where image like 'data:image/%'
order by octet_length(image) desc
limit 50;

select
  id,
  title,
  is_active,
  pg_size_pretty(octet_length(image_thumb)::bigint) as thumb_size,
  left(image_thumb, 120) as thumb_prefix
from public.products
where image_thumb like 'data:image/%'
order by octet_length(image_thumb) desc
limit 50;

-- Storage object bytes are storage usage, not database table bytes.
-- This still helps confirm whether product images are in Storage instead of rows.
select
  bucket_id,
  count(*) as objects,
  pg_size_pretty(
    coalesce(sum(nullif(metadata->>'size', '')::bigint), 0)::bigint
  ) as object_bytes_from_metadata,
  min(created_at) as oldest_object,
  max(created_at) as newest_object
from storage.objects
group by bucket_id
order by coalesce(sum(nullif(metadata->>'size', '')::bigint), 0) desc;

-- ============================================================================
-- 6) Cleanup candidates, counts only
-- ============================================================================

select
  'logs_test_or_prueba' as candidate,
  count(*) as rows
from public.logs
where action ilike '%test%'
   or action ilike '%prueba%'
   or reason ilike '%test%'
   or reason ilike '%prueba%'
   or details::text ilike '%test%'
   or details::text ilike '%prueba%';

select
  action,
  count(*) as rows,
  min(created_at) as oldest,
  max(created_at) as newest,
  pg_size_pretty(coalesce(sum(pg_column_size(details)), 0)::bigint) as details_size,
  pg_size_pretty(coalesce(max(pg_column_size(details)), 0)::bigint) as largest_details
from public.logs
group by action
order by coalesce(sum(pg_column_size(details)), 0) desc;

select 'inactive_products' as candidate, count(*) as rows from public.products where is_active = false
union all select 'test_products', count(*) from public.products where title ilike '%test%' or title ilike '%prueba%'
union all select 'inactive_budgets', count(*) from public.budgets where is_active = false
union all select 'inactive_or_cancelled_orders', count(*) from public.orders where is_active = false or status ilike 'Cancelado'
union all select 'old_logs_180_days', count(*) from public.logs where created_at < now() - interval '180 days'
union all select 'old_logs_365_days', count(*) from public.logs where created_at < now() - interval '365 days'
union all select 'old_cash_closures_365_days', count(*) from public.cash_closures where created_at < now() - interval '365 days';

select
  id,
  title,
  category,
  is_active,
  created_at,
  pg_size_pretty((octet_length(coalesce(image, '')) + octet_length(coalesce(image_thumb, '')))::bigint) as image_text_size
from public.products
where title ilike '%test%'
   or title ilike '%prueba%'
   or category ilike '%test%'
   or category ilike '%prueba%'
order by created_at desc nulls last, id desc;

select
  lower(trim(title)) as normalized_title,
  count(*) as rows,
  array_agg(id order by id) as ids,
  bool_or(is_active) as has_active_product,
  pg_size_pretty(
    sum(octet_length(coalesce(image, '')) + octet_length(coalesce(image_thumb, '')))::bigint
  ) as combined_image_text_size
from public.products
group by lower(trim(title))
having count(*) > 1
order by count(*) desc, normalized_title
limit 100;

select
  lower(trim(name)) as normalized_client_name,
  count(*) as rows,
  array_agg(id order by id) as ids,
  array_agg(member_number order by id) as member_numbers,
  bool_or(is_active) as has_active_client
from public.clients
group by lower(trim(name))
having count(*) > 1
order by count(*) desc, normalized_client_name
limit 100;

-- ============================================================================
-- 7) Growth view by month for high-risk app tables
-- ============================================================================

with monthly_rows as (
  select 'logs' as table_name, created_at, pg_column_size(l)::bigint as row_bytes
  from public.logs l
  union all
  select 'sales', created_at, pg_column_size(s)::bigint
  from public.sales s
  union all
  select 'sale_items', s.created_at, pg_column_size(si)::bigint
  from public.sale_items si
  left join public.sales s on s.id = si.sale_id
  union all
  select 'cash_closures', created_at, pg_column_size(cc)::bigint
  from public.cash_closures cc
  union all
  select 'budgets', created_at, pg_column_size(b)::bigint
  from public.budgets b
  union all
  select 'orders', created_at, pg_column_size(o)::bigint
  from public.orders o
)
select
  table_name,
  date_trunc('month', created_at)::date as month,
  count(*) as rows,
  pg_size_pretty(sum(row_bytes)::bigint) as approx_row_size,
  pg_size_pretty(max(row_bytes)::bigint) as largest_row
from monthly_rows
where created_at is not null
group by table_name, date_trunc('month', created_at)
order by month desc, sum(row_bytes) desc;

-- ============================================================================
-- How to interpret the first pass
-- ============================================================================
-- 1. If toast_size is large, oversized text/json/jsonb values are likely.
-- 2. If indexes_size is large, inspect the top index and zero-scan result sets.
-- 3. If logs.details or cash_closures snapshots dominate, plan log/snapshot archival.
-- 4. If base64 image rows appear, migrate those images to Supabase Storage.
-- 5. If dead_row_pct is high after confirmed cleanup, plan VACUUM ANALYZE.
-- 6. Consider VACUUM FULL only during a maintenance window because it locks tables.
