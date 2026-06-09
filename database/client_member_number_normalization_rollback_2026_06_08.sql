-- Roll back active client/socio member numbers using the audit table created by:
-- database/client_member_number_normalization_apply_2026_06_08.sql
--
-- This script MODIFIES DATA.
-- It restores member_number = old_member_number for the selected run_id.

begin;

lock table public.clients in share row exclusive mode;

do $$
begin
  if not exists (
    select 1
    from public.client_member_number_normalization_audit
    where run_id = 'client-member-number-normalization-2026-06-08'
  ) then
    raise exception 'Rollback failed: no audit rows found for run_id client-member-number-normalization-2026-06-08.';
  end if;
end $$;

drop index if exists public.clients_member_number_active_unique_idx;

-- Phase 1: move normalized numbers to temporary negative values.
update public.clients c
set member_number = -a.new_member_number
from public.client_member_number_normalization_audit a
where c.id = a.id
  and a.run_id = 'client-member-number-normalization-2026-06-08';

-- Phase 2: restore old numbers.
update public.clients c
set member_number = a.old_member_number
from public.client_member_number_normalization_audit a
where c.id = a.id
  and a.run_id = 'client-member-number-normalization-2026-06-08';

commit;

-- Verification query.
select
  count(*) as restored_clients,
  count(*) filter (where c.member_number = a.old_member_number) as matching_old_numbers
from public.clients c
join public.client_member_number_normalization_audit a on a.id = c.id
where a.run_id = 'client-member-number-normalization-2026-06-08';
