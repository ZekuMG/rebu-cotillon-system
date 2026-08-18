-- NOT AUTORUN.
-- Preconditions:
--   1. Export or otherwise verify a recoverable database backup.
--   2. Run database/logs_compaction_preview_2026_08_16.sql.
--   3. Run batches outside business hours while watching Disk IO.
--
-- Executing this file only installs the maintenance helpers. It does not update
-- public.logs until the final SELECT example is explicitly uncommented.

create schema if not exists rebu_maintenance;
revoke all on schema rebu_maintenance from public, anon, authenticated;

create or replace function rebu_maintenance.compact_log_details(
  p_value jsonb,
  p_key text default ''
)
returns jsonb
language plpgsql
immutable
parallel safe
set search_path = pg_catalog, rebu_maintenance
as $$
declare
  value_type text;
  normalized_key text := regexp_replace(lower(coalesce(p_key, '')), '[^a-z0-9_]', '', 'g');
  string_value text;
  compacted jsonb;
begin
  if p_value is null then
    return null;
  end if;

  value_type := jsonb_typeof(p_value);

  if value_type = 'string' then
    string_value := p_value #>> '{}';

    if normalized_key = any(array['image', 'image_thumb', 'imagethumb', 'thumb', 'thumbnail', 'avatar'])
       and btrim(string_value) <> '' then
      return to_jsonb(
        case when normalized_key like '%avatar%'
          then '[avatar omitido]'
          else '[imagen omitida]'
        end
      );
    end if;

    if lower(left(string_value, 11)) = 'data:image/' then
      return to_jsonb(
        case when normalized_key like '%avatar%'
          then '[avatar omitido]'
          else '[imagen omitida]'
        end
      );
    end if;

    if normalized_key like '%avatar%' and length(string_value) > 120 then
      return to_jsonb('[avatar omitido]'::text);
    end if;

    if length(string_value) > 4000 then
      return to_jsonb(left(string_value, 4000) || '... [texto recortado]');
    end if;

    return p_value;
  end if;

  if value_type = 'array' then
    select coalesce(
      jsonb_agg(
        rebu_maintenance.compact_log_details(item_value, p_key)
        order by item_ordinal
      ),
      '[]'::jsonb
    )
      into compacted
      from jsonb_array_elements(p_value) with ordinality as items(item_value, item_ordinal);
    return compacted;
  end if;

  if value_type = 'object' then
    select coalesce(
      jsonb_object_agg(
        entry_key,
        rebu_maintenance.compact_log_details(entry_value, entry_key)
      ),
      '{}'::jsonb
    )
      into compacted
      from jsonb_each(p_value) as entries(entry_key, entry_value);
    return compacted;
  end if;

  return p_value;
end;
$$;

create or replace function rebu_maintenance.compact_legacy_logs_batch(
  p_before timestamptz default timestamptz '2026-05-25 00:00:00+00',
  p_batch_size integer default 100,
  p_min_details_bytes integer default 8192
)
returns table (
  updated_rows integer,
  before_bytes bigint,
  after_bytes bigint,
  saved_bytes bigint
)
language plpgsql
security definer
set search_path = pg_catalog, public, rebu_maintenance
as $$
begin
  if p_batch_size < 1 or p_batch_size > 500 then
    raise exception 'p_batch_size debe estar entre 1 y 500';
  end if;

  return query
  with candidates as materialized (
    select
      l.id,
      l.details,
      pg_column_size(l.details)::bigint as original_bytes
    from public.logs l
    where l.created_at < p_before
      and pg_column_size(l.details) >= greatest(p_min_details_bytes, 1)
      and (
        l.details::text ~* '"(image|image_thumb|imagethumb|thumb|thumbnail|avatar)"[[:space:]]*:'
        or l.details::text ~* 'data:image/'
      )
    order by l.id
    limit p_batch_size
    for update skip locked
  ), compacted as (
    select
      c.id,
      c.original_bytes,
      rebu_maintenance.compact_log_details(c.details) as next_details
    from candidates c
  ), updated as (
    update public.logs l
       set details = c.next_details
      from compacted c
     where l.id = c.id
       and l.details is distinct from c.next_details
    returning c.original_bytes, pg_column_size(l.details)::bigint as compacted_bytes
  )
  select
    count(*)::integer,
    coalesce(sum(u.original_bytes), 0)::bigint,
    coalesce(sum(u.compacted_bytes), 0)::bigint,
    coalesce(sum(u.original_bytes - u.compacted_bytes), 0)::bigint
  from updated u;
end;
$$;

revoke all on function rebu_maintenance.compact_log_details(jsonb, text)
  from public, anon, authenticated;
revoke all on function rebu_maintenance.compact_legacy_logs_batch(timestamptz, integer, integer)
  from public, anon, authenticated;

-- After backup, run ONE batch and inspect updated_rows/saved_bytes and Disk IO.
-- Repeat only while updated_rows > 0 and the project remains healthy.
-- select * from rebu_maintenance.compact_legacy_logs_batch(
--   timestamptz '2026-05-25 00:00:00+00',
--   100,
--   8192
-- );
