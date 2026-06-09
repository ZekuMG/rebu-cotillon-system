-- Normalize active client/socio member numbers.
-- This script MODIFIES DATA. Run the diagnostics first:
-- database/client_member_number_diagnostics_2026_06_08.sql
--
-- Defaults applied:
-- - Active clients only: coalesce(is_active, true)
-- - New numbers start at 1
-- - Ordering: created_at asc nulls last, lower(name), id
-- - Permanent backup table with old -> new mapping
-- - Old number preserved in social_connections.legacyMemberNumber
-- - Transactional update with temporary negative numbers to avoid collisions
-- - Active-only unique index on member_number
--
-- Operational recommendation:
-- - Run outside business hours with the app closed.
-- - Review the backup table before closing your SQL Editor tab.

begin;

lock table public.clients in share row exclusive mode;

create table if not exists public.client_member_number_normalization_audit (
  id bigint not null,
  name text,
  old_member_number bigint,
  new_member_number bigint not null,
  created_at timestamptz,
  was_active boolean not null,
  normalized_at timestamptz not null default now(),
  run_id text not null,
  primary key (id, run_id)
);

create temporary table tmp_client_member_number_normalization as
select
  id,
  name,
  member_number as old_member_number,
  row_number() over (
    order by created_at asc nulls last, lower(coalesce(name, '')), id
  )::bigint as new_member_number,
  created_at,
  coalesce(is_active, true) as was_active,
  'client-member-number-normalization-2026-06-08'::text as run_id
from public.clients
where coalesce(is_active, true);

-- Safety check: new numbers must be unique.
do $$
begin
  if exists (
    select 1
    from tmp_client_member_number_normalization
    group by new_member_number
    having count(*) > 1
  ) then
    raise exception 'Safety check failed: generated duplicate new_member_number values.';
  end if;
end $$;

-- Safety check: do not rerun the same normalization accidentally.
do $$
begin
  if exists (
    select 1
    from public.client_member_number_normalization_audit
    where run_id = 'client-member-number-normalization-2026-06-08'
  ) then
    raise exception 'Safety check failed: this run_id already exists in client_member_number_normalization_audit.';
  end if;
end $$;

insert into public.client_member_number_normalization_audit (
  id,
  name,
  old_member_number,
  new_member_number,
  created_at,
  was_active,
  run_id
)
select
  id,
  name,
  old_member_number,
  new_member_number,
  created_at,
  was_active,
  run_id
from tmp_client_member_number_normalization;

-- Phase 1: move active clients to temporary negative numbers.
-- This prevents collisions when old values overlap with new values.
update public.clients c
set
  member_number = -m.new_member_number,
  social_connections = jsonb_set(
    coalesce(c.social_connections, '{}'::jsonb),
    '{legacyMemberNumber}',
    to_jsonb(c.member_number),
    true
  )
from tmp_client_member_number_normalization m
where c.id = m.id;

-- Phase 2: write final normalized numbers.
update public.clients c
set member_number = m.new_member_number
from tmp_client_member_number_normalization m
where c.id = m.id;

-- Guardrail before creating the unique index.
do $$
begin
  if exists (
    select 1
    from public.clients
    where coalesce(is_active, true)
    group by member_number
    having count(*) > 1
  ) then
    raise exception 'Safety check failed: active clients still have duplicate member_number values.';
  end if;

  if exists (
    select 1
    from public.clients
    where coalesce(is_active, true)
      and (member_number is null or member_number <= 0)
  ) then
    raise exception 'Safety check failed: active clients still have null or non-positive member_number values.';
  end if;
end $$;

create unique index if not exists clients_member_number_active_unique_idx
on public.clients (member_number)
where coalesce(is_active, true);

commit;

-- Verification queries to run after commit.
select
  count(*) as active_clients,
  count(distinct member_number) as active_distinct_member_numbers,
  min(member_number) as min_member_number,
  max(member_number) as max_member_number
from public.clients
where coalesce(is_active, true);

select
  old_member_number,
  new_member_number,
  name,
  id
from public.client_member_number_normalization_audit
where run_id = 'client-member-number-normalization-2026-06-08'
order by new_member_number
limit 25;
