-- Read-only health report for the tables used during dashboard/history loading.
-- Run after a representative period of application usage.

with target_tables(table_name) as (
  values
    ('sales'),
    ('logs'),
    ('expenses'),
    ('cash_closures')
)
select
  stats.relname as table_name,
  stats.n_live_tup as estimated_rows,
  stats.seq_scan,
  stats.idx_scan,
  pg_size_pretty(pg_total_relation_size(format('public.%I', stats.relname)::regclass)) as total_size,
  stats.last_analyze,
  stats.last_autoanalyze
from pg_stat_user_tables as stats
join target_tables as target on target.table_name = stats.relname
where stats.schemaname = 'public'
order by stats.relname;

select
  index_stats.relname as table_name,
  index_stats.indexrelname as index_name,
  index_stats.idx_scan,
  pg_size_pretty(pg_relation_size(index_stats.indexrelid)) as index_size,
  indexes.indexdef
from pg_stat_user_indexes as index_stats
join pg_indexes as indexes
  on indexes.schemaname = index_stats.schemaname
 and indexes.tablename = index_stats.relname
 and indexes.indexname = index_stats.indexrelname
where index_stats.schemaname = 'public'
  and index_stats.relname in ('sales', 'logs', 'expenses', 'cash_closures')
order by index_stats.relname, index_stats.indexrelname;

