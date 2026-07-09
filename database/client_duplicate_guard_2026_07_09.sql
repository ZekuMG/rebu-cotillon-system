-- Guardrails for duplicated Rebu clients/socios.
-- Run after resolving current active duplicates. This script is intentionally
-- defensive: it raises before creating indexes if duplicate keys still exist.

create or replace function public.rebu_normalize_client_name(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(regexp_replace(lower(btrim(coalesce(p_value, ''))), '[[:space:]]+', ' ', 'g'), '');
$$;

create or replace function public.rebu_digits_only(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(regexp_replace(coalesce(p_value, ''), '[^0-9]+', '', 'g'), '');
$$;

do $$
begin
  if exists (
    select 1
    from public.clients
    where coalesce(is_active, true)
      and public.rebu_normalize_client_name(name) is not null
      and length(public.rebu_digits_only(phone)) >= 6
    group by public.rebu_normalize_client_name(name), public.rebu_digits_only(phone)
    having count(*) > 1
  ) then
    raise exception 'Duplicate active clients by normalized name + phone. Resolve before creating guard indexes.';
  end if;

  if exists (
    select 1
    from public.clients
    where coalesce(is_active, true)
      and public.rebu_normalize_client_name(name) is not null
      and length(public.rebu_digits_only(dni)) >= 5
    group by public.rebu_normalize_client_name(name), public.rebu_digits_only(dni)
    having count(*) > 1
  ) then
    raise exception 'Duplicate active clients by normalized name + DNI. Resolve before creating guard indexes.';
  end if;

  if exists (
    select 1
    from public.clients
    where coalesce(is_active, true)
      and public.rebu_normalize_client_name(name) is not null
      and nullif(lower(btrim(coalesce(email, ''))), '') is not null
    group by public.rebu_normalize_client_name(name), nullif(lower(btrim(coalesce(email, ''))), '')
    having count(*) > 1
  ) then
    raise exception 'Duplicate active clients by normalized name + email. Resolve before creating guard indexes.';
  end if;

  if exists (
    select 1
    from public.clients
    where coalesce(is_active, true)
      and public.rebu_normalize_client_name(name) is not null
      and coalesce(length(public.rebu_digits_only(phone)), 0) < 6
      and coalesce(length(public.rebu_digits_only(dni)), 0) < 5
      and nullif(lower(btrim(coalesce(email, ''))), '') is null
    group by public.rebu_normalize_client_name(name)
    having count(*) > 1
  ) then
    raise exception 'Duplicate active clients by normalized name without identity. Resolve before creating guard indexes.';
  end if;
end $$;

create unique index if not exists clients_active_name_phone_unique_idx
on public.clients (
  public.rebu_normalize_client_name(name),
  public.rebu_digits_only(phone)
)
where coalesce(is_active, true)
  and public.rebu_normalize_client_name(name) is not null
  and length(public.rebu_digits_only(phone)) >= 6;

create unique index if not exists clients_active_name_dni_unique_idx
on public.clients (
  public.rebu_normalize_client_name(name),
  public.rebu_digits_only(dni)
)
where coalesce(is_active, true)
  and public.rebu_normalize_client_name(name) is not null
  and length(public.rebu_digits_only(dni)) >= 5;

create unique index if not exists clients_active_name_email_unique_idx
on public.clients (
  public.rebu_normalize_client_name(name),
  nullif(lower(btrim(coalesce(email, ''))), '')
)
where coalesce(is_active, true)
  and public.rebu_normalize_client_name(name) is not null
  and nullif(lower(btrim(coalesce(email, ''))), '') is not null;

create unique index if not exists clients_active_name_without_identity_unique_idx
on public.clients (public.rebu_normalize_client_name(name))
where coalesce(is_active, true)
  and public.rebu_normalize_client_name(name) is not null
  and coalesce(length(public.rebu_digits_only(phone)), 0) < 6
  and coalesce(length(public.rebu_digits_only(dni)), 0) < 5
  and nullif(lower(btrim(coalesce(email, ''))), '') is null;

notify pgrst, 'reload schema';
