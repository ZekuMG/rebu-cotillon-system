-- Keep log searches server-side while returning only the lightweight columns
-- needed by the list. Full details are loaded by id when a row is opened.

begin;

create or replace view public.logs_search_summary
with (security_invoker = true)
as
select
  l.id,
  l.created_at,
  l.action,
  l.reason,
  l."user",
  true as search_verified
from public.logs l;

revoke all on public.logs_search_summary from public, anon;
grant select on public.logs_search_summary to authenticated;

create or replace function public.search_logs_summary(
  p_search text default '',
  p_search_scope text default 'all',
  p_product_terms text[] default array[]::text[],
  p_actions text[] default array[]::text[],
  p_excluded_actions text[] default array[]::text[],
  p_action text default '',
  p_user_filter text default '',
  p_date_start timestamptz default null,
  p_date_end timestamptz default null,
  p_sort_column text default 'created_at',
  p_ascending boolean default false,
  p_offset integer default 0,
  p_limit integer default 101
)
returns setof public.logs_search_summary
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  safe_sort_column text := case
    when p_sort_column in ('action', 'user', 'created_at', 'id') then p_sort_column
    else 'created_at'
  end;
  safe_direction text := case when p_ascending then 'asc' else 'desc' end;
  safe_offset integer := greatest(coalesce(p_offset, 0), 0);
  safe_limit integer := least(greatest(coalesce(p_limit, 101), 1), 250);
  normalized_search text := trim(coalesce(p_search, ''));
  normalized_scope text := lower(trim(coalesce(p_search_scope, 'all')));
  normalized_action text := trim(coalesce(p_action, ''));
  normalized_user text := trim(coalesce(p_user_filter, ''));
  user_id_filter text := '';
  user_name_filter text := '';
begin
  if normalized_user like 'id:%' then
    user_id_filter := split_part(split_part(normalized_user, '|', 1), ':', 2);
    user_name_filter := nullif(split_part(normalized_user, '|name:', 2), '');
  elsif normalized_user like 'name:%' then
    user_name_filter := substring(normalized_user from 6);
  else
    user_name_filter := normalized_user;
  end if;

  return query execute format(
    'select l.id, l.created_at, l.action, l.reason, l."user", true
       from public.logs l
      where (coalesce(array_length($1, 1), 0) = 0 or l.action = any($1))
        and (coalesce(array_length($2, 1), 0) = 0 or not (l.action = any($2)))
        and (
          $3 = ''''
          or ($3 = ''Venta Modificada'' and l.action = any(array[''Venta Modificada'', ''Modificación Pedido'', ''Modificacion Pedido'']))
          or l.action = $3
        )
        and ($4 is null or l.created_at >= $4)
        and ($5 is null or l.created_at <= $5)
        and (
          $6 = ''''
          or coalesce(l.user_id::text, '''') = $6
          or ($7 <> '''' and l."user" ilike ''%%'' || $7 || ''%%'')
        )
        and (
          $8 = ''''
          or ($9 = ''user'' and l."user" ilike ''%%'' || $8 || ''%%'')
          or ($9 = ''action'' and (l.action ilike ''%%'' || $8 || ''%%'' or coalesce(l.reason, '''') ilike ''%%'' || $8 || ''%%''))
          or ($9 in (''id'', ''product'') and coalesce(l.details::text, '''') ilike ''%%'' || $8 || ''%%'')
          or (
            $9 not in (''user'', ''action'', ''id'', ''product'')
            and (
              l.id::text = $8
              or l.action ilike ''%%'' || $8 || ''%%''
              or coalesce(l.reason, '''') ilike ''%%'' || $8 || ''%%''
              or l."user" ilike ''%%'' || $8 || ''%%''
              or l.created_at::text ilike ''%%'' || $8 || ''%%''
              or coalesce(l.details::text, '''') ilike ''%%'' || $8 || ''%%''
            )
          )
        )
        and (
          coalesce(array_length($10, 1), 0) = 0
          or exists (
            select 1
              from unnest($10) as product_term
             where coalesce(l.details::text, '''') ilike ''%%'' || product_term || ''%%''
          )
        )
      order by %I %s, l.created_at desc, l.id desc
      offset $11
      limit $12',
    safe_sort_column,
    safe_direction
  )
  using
    coalesce(p_actions, array[]::text[]),
    coalesce(p_excluded_actions, array[]::text[]),
    normalized_action,
    p_date_start,
    p_date_end,
    coalesce(user_id_filter, ''),
    coalesce(user_name_filter, ''),
    normalized_search,
    normalized_scope,
    coalesce(p_product_terms, array[]::text[]),
    safe_offset,
    safe_limit;
end;
$$;

revoke all on function public.search_logs_summary(
  text, text, text[], text[], text[], text, text,
  timestamptz, timestamptz, text, boolean, integer, integer
) from public, anon;

grant execute on function public.search_logs_summary(
  text, text, text[], text[], text[], text, text,
  timestamptz, timestamptz, text, boolean, integer, integer
) to authenticated;

notify pgrst, 'reload schema';

commit;
