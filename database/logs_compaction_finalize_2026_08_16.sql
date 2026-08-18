-- Run after all compaction batches have completed.
-- This makes dead tuples reusable and refreshes planner statistics without an
-- exclusive full-table rewrite.

vacuum (analyze) public.logs;

select
  pg_size_pretty(pg_relation_size('public.logs')) as table_heap,
  pg_size_pretty(pg_indexes_size('public.logs')) as indexes,
  pg_size_pretty(pg_total_relation_size('public.logs')) as total,
  n_live_tup as live_rows_estimate,
  n_dead_tup as dead_rows_estimate,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
from pg_stat_user_tables
where schemaname = 'public'
  and relname = 'logs';

-- VACUUM FULL would return allocated pages to the filesystem, but it takes an
-- exclusive lock and rewrites the table. Do not run it while the app is in use.
