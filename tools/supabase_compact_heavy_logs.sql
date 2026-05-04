-- Compact heavy log details caused by base64 avatars/images.
-- Safe intent: preserve audit rows and replace oversized embedded images with placeholders.
-- Run the SELECT sections first. Run the UPDATE sections only after reviewing the counts.

-- ============================================================================
-- 1) Confirm the heavy log root cause
-- ============================================================================

select
  action,
  count(*) as rows,
  pg_size_pretty(coalesce(sum(pg_column_size(details)), 0)::bigint) as current_details_size,
  pg_size_pretty(coalesce(max(pg_column_size(details)), 0)::bigint) as largest_details
from public.logs
where details::text like '%data:image/%'
group by action
order by coalesce(sum(pg_column_size(details)), 0) desc;

select
  count(*) as rows_with_top_level_avatar_base64,
  pg_size_pretty(coalesce(sum(pg_column_size(details)), 0)::bigint) as current_details_size
from public.logs
where jsonb_typeof(details) = 'object'
  and details ? 'avatar'
  and details->>'avatar' like 'data:image/%';

select
  id,
  created_at,
  action,
  pg_size_pretty(pg_column_size(details)::bigint) as details_size,
  left(details::text, 220) as details_preview
from public.logs
where details::text like '%data:image/%'
order by pg_column_size(details) desc
limit 25;

-- ============================================================================
-- 2) Compact top-level avatar fields in logs
-- ============================================================================
-- This is the main cleanup for the current database. Based on the audit results,
-- session and user logs repeatedly stored a large base64 avatar in details.avatar.

begin;

update public.logs
set details = jsonb_set(details, '{avatar}', to_jsonb('[avatar omitido]'::text), true)
where jsonb_typeof(details) = 'object'
  and details ? 'avatar'
  and details->>'avatar' like 'data:image/%';

-- Review how many rows were touched in the SQL Editor result.
-- Then check the new live size estimate before deciding to commit.
select
  action,
  count(*) as rows,
  pg_size_pretty(coalesce(sum(pg_column_size(details)), 0)::bigint) as details_size,
  pg_size_pretty(coalesce(max(pg_column_size(details)), 0)::bigint) as largest_details
from public.logs
group by action
order by coalesce(sum(pg_column_size(details)), 0) desc;

-- If the result looks correct, replace ROLLBACK with COMMIT.
rollback;

-- ============================================================================
-- 3) Optional: compact other top-level image fields if any exist
-- ============================================================================
-- Run these SELECTs first. Only use the matching UPDATE if rows are found.

select
  'image' as field_name,
  count(*) as rows,
  pg_size_pretty(coalesce(sum(pg_column_size(details)), 0)::bigint) as current_details_size
from public.logs
where jsonb_typeof(details) = 'object'
  and details ? 'image'
  and details->>'image' like 'data:image/%'
union all
select
  'image_thumb',
  count(*),
  pg_size_pretty(coalesce(sum(pg_column_size(details)), 0)::bigint)
from public.logs
where jsonb_typeof(details) = 'object'
  and details ? 'image_thumb'
  and details->>'image_thumb' like 'data:image/%'
union all
select
  'imageThumb',
  count(*),
  pg_size_pretty(coalesce(sum(pg_column_size(details)), 0)::bigint)
from public.logs
where jsonb_typeof(details) = 'object'
  and details ? 'imageThumb'
  and details->>'imageThumb' like 'data:image/%';

-- Uncomment and run inside a transaction only if the SELECT above finds rows.
-- begin;
-- update public.logs
-- set details = jsonb_set(details, '{image}', to_jsonb('[imagen omitida]'::text), true)
-- where jsonb_typeof(details) = 'object'
--   and details ? 'image'
--   and details->>'image' like 'data:image/%';
--
-- update public.logs
-- set details = jsonb_set(details, '{image_thumb}', to_jsonb('[imagen omitida]'::text), true)
-- where jsonb_typeof(details) = 'object'
--   and details ? 'image_thumb'
--   and details->>'image_thumb' like 'data:image/%';
--
-- update public.logs
-- set details = jsonb_set(details, '{imageThumb}', to_jsonb('[imagen omitida]'::text), true)
-- where jsonb_typeof(details) = 'object'
--   and details ? 'imageThumb'
--   and details->>'imageThumb' like 'data:image/%';
--
-- select action, count(*) as rows, pg_size_pretty(sum(pg_column_size(details))::bigint) as details_size
-- from public.logs
-- group by action
-- order by sum(pg_column_size(details)) desc;
-- rollback;

-- ============================================================================
-- 4) Reclaiming physical database size after compaction
-- ============================================================================
-- The UPDATE makes live rows much smaller, but PostgreSQL may keep old dead TOAST
-- pages allocated until vacuuming. Start with the non-blocking option:
--
-- vacuum (analyze) public.logs;
--
-- If Supabase Database Size does not drop enough, schedule a maintenance window
-- and run the blocking option:
--
-- vacuum full public.logs;
--
-- VACUUM FULL rewrites and locks the table while it runs. Do it when the POS is idle.
