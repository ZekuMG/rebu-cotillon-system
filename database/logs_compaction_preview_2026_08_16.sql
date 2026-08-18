-- READ ONLY. Run before any historical compaction.
-- The May 25 cutoff includes the second image-key hardening release.

select
  count(*) as total_rows,
  count(*) filter (where created_at < timestamptz '2026-05-25 00:00:00+00') as legacy_rows,
  count(*) filter (where pg_column_size(details) >= 8192) as rows_over_8_kib,
  count(*) filter (
    where created_at < timestamptz '2026-05-25 00:00:00+00'
      and pg_column_size(details) >= 8192
      and (
        details::text ~* '"(image|image_thumb|imagethumb|thumb|thumbnail|avatar)"[[:space:]]*:'
        or details::text ~* 'data:image/'
      )
  ) as compactable_legacy_rows,
  pg_size_pretty(sum(pg_column_size(details))::bigint) as logical_details_size,
  pg_size_pretty(pg_total_relation_size('public.logs')) as physical_logs_size
from public.logs;

select
  id,
  created_at,
  action,
  pg_size_pretty(pg_column_size(details)::bigint) as details_size
from public.logs
where created_at < timestamptz '2026-05-25 00:00:00+00'
order by pg_column_size(details) desc
limit 50;
