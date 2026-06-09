-- Read-only diagnostics for normalizing client/socio member numbers.
-- Safe to run in Supabase SQL Editor. This file does not modify data.
--
-- Goal:
-- - Inspect current random member_number values.
-- - Detect active duplicates, nulls, and non-positive numbers.
-- - Preview a deterministic renumbering by creation order.
--
-- Proposed ordering:
-- 1) created_at ascending, with missing dates last
-- 2) name ascending
-- 3) id ascending

-- 1) General state of clients.member_number.
select
  count(*) as total_clients,
  count(*) filter (where coalesce(is_active, true)) as active_clients,
  count(*) filter (where not coalesce(is_active, true)) as inactive_clients,
  count(*) filter (where coalesce(is_active, true) and member_number is null) as active_without_member_number,
  count(*) filter (where coalesce(is_active, true) and member_number <= 0) as active_with_non_positive_member_number,
  count(distinct member_number) filter (where coalesce(is_active, true) and member_number is not null) as active_distinct_member_numbers,
  min(member_number) filter (where coalesce(is_active, true) and member_number is not null) as active_min_member_number,
  max(member_number) filter (where coalesce(is_active, true) and member_number is not null) as active_max_member_number
from public.clients;

-- 2) Active duplicate member numbers, if any.
select
  member_number,
  count(*) as duplicate_count,
  jsonb_agg(
    jsonb_build_object(
      'id', id,
      'name', name,
      'created_at', created_at
    )
    order by created_at asc nulls last, lower(coalesce(name, '')), id
  ) as clients
from public.clients
where coalesce(is_active, true)
  and member_number is not null
group by member_number
having count(*) > 1
order by member_number;

-- 3) Active clients that need special attention before renumbering.
select
  id,
  name,
  member_number,
  created_at,
  is_active
from public.clients
where coalesce(is_active, true)
  and (member_number is null or member_number <= 0)
order by created_at asc nulls last, lower(coalesce(name, '')), id;

-- 4) Proposed normalization preview.
-- Review this result before applying any update.
with ranked_clients as (
  select
    id,
    name,
    member_number as old_member_number,
    row_number() over (
      order by created_at asc nulls last, lower(coalesce(name, '')), id
    ) as new_member_number,
    created_at,
    is_active
  from public.clients
  where coalesce(is_active, true)
)
select
  id,
  name,
  old_member_number,
  new_member_number,
  created_at,
  case
    when old_member_number is null then 'missing_number'
    when old_member_number = new_member_number then 'unchanged'
    else 'will_change'
  end as normalization_status
from ranked_clients
order by new_member_number;

-- 5) Summary of proposed normalization.
with ranked_clients as (
  select
    id,
    member_number as old_member_number,
    row_number() over (
      order by created_at asc nulls last, lower(coalesce(name, '')), id
    ) as new_member_number
  from public.clients
  where coalesce(is_active, true)
)
select
  count(*) as active_clients_to_number,
  count(*) filter (where old_member_number = new_member_number) as unchanged_clients,
  count(*) filter (where old_member_number is distinct from new_member_number) as clients_that_will_change,
  min(new_member_number) as proposed_min_member_number,
  max(new_member_number) as proposed_max_member_number,
  count(distinct new_member_number) as proposed_distinct_member_numbers
from ranked_clients;

-- 6) Inactive clients that currently reuse an active member number.
-- This does not block an active-only unique index, but it is useful historical context.
with active_numbers as (
  select distinct member_number
  from public.clients
  where coalesce(is_active, true)
    and member_number is not null
)
select
  c.id,
  c.name,
  c.member_number,
  c.created_at,
  c.is_active
from public.clients c
join active_numbers a on a.member_number = c.member_number
where not coalesce(c.is_active, true)
order by c.member_number, c.created_at asc nulls last, lower(coalesce(c.name, '')), c.id;
