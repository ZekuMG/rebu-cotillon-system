create table if not exists public.agenda_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_type text not null check (contact_type in ('supplier', 'wholesaler')),
  phone text null,
  email text null,
  address text null,
  website text null,
  tax_id text null,
  contact_person text null,
  notes text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agenda_contacts_name_idx on public.agenda_contacts (name);
create index if not exists agenda_contacts_type_idx on public.agenda_contacts (contact_type);
create index if not exists agenda_contacts_is_active_idx on public.agenda_contacts (is_active);
create index if not exists agenda_contacts_created_at_idx on public.agenda_contacts (created_at desc);

create or replace function public.set_agenda_contacts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_agenda_contacts_updated_at on public.agenda_contacts;
create trigger trg_agenda_contacts_updated_at
before update on public.agenda_contacts
for each row
execute function public.set_agenda_contacts_updated_at();
