begin;

create extension if not exists citext;
create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
grant usage on schema private to service_role;

create sequence if not exists public.web_catalog_code_seq start with 1;

create table if not exists public.web_catalog_products (
  id uuid primary key default gen_random_uuid(),
  source_product_id bigint not null unique,
  catalog_code text not null unique,
  slug text not null,
  title text not null,
  brand text not null default '',
  short_description text not null default '',
  description text not null default '',
  web_price numeric(14, 2) not null default 0,
  price_unit text not null default 'unit',
  availability text not null default 'on_request',
  status text not null default 'draft',
  source_state text not null default 'current',
  source_snapshot jsonb not null default '{}'::jsonb,
  source_fingerprint text not null default '',
  source_reviewed_at timestamptz,
  source_checked_at timestamptz not null default now(),
  requires_review boolean not null default false,
  unpublished_reason text,
  tags text[] not null default '{}',
  seo_title text not null default '',
  seo_description text not null default '',
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  published_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint web_catalog_products_slug_format_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint web_catalog_products_title_length_check
    check (char_length(title) between 1 and 120),
  constraint web_catalog_products_brand_length_check
    check (char_length(brand) <= 120),
  constraint web_catalog_products_short_description_length_check
    check (char_length(short_description) <= 220),
  constraint web_catalog_products_price_check
    check (web_price >= 0),
  constraint web_catalog_products_price_unit_check
    check (price_unit in ('unit', 'kg')),
  constraint web_catalog_products_availability_check
    check (availability in ('available', 'on_request', 'out_of_stock')),
  constraint web_catalog_products_status_check
    check (status in ('draft', 'published', 'archived')),
  constraint web_catalog_products_source_state_check
    check (source_state in ('current', 'changed', 'inactive', 'missing'))
);

create unique index if not exists web_catalog_products_slug_lower_uidx
  on public.web_catalog_products (lower(slug));
create index if not exists web_catalog_products_status_sort_idx
  on public.web_catalog_products (status, is_featured desc, sort_order, updated_at desc);
create index if not exists web_catalog_products_source_state_idx
  on public.web_catalog_products (source_state, requires_review)
  where requires_review = true;
create index if not exists web_catalog_products_published_idx
  on public.web_catalog_products (is_featured desc, sort_order, published_at desc)
  where status = 'published';

create table if not exists public.web_catalog_categories (
  id uuid primary key default gen_random_uuid(),
  name citext not null unique,
  slug text not null,
  description text not null default '',
  accent_color text not null default '#E43895',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.app_users(id) on delete set null,
  updated_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint web_catalog_categories_slug_format_check
    check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint web_catalog_categories_name_length_check
    check (char_length(name::text) between 2 and 80),
  constraint web_catalog_categories_accent_check
    check (accent_color ~ '^#[0-9A-Fa-f]{6}$')
);

create unique index if not exists web_catalog_categories_slug_lower_uidx
  on public.web_catalog_categories (lower(slug));
create index if not exists web_catalog_categories_active_order_idx
  on public.web_catalog_categories (is_active, sort_order, name);

create table if not exists public.web_catalog_product_categories (
  product_id uuid not null references public.web_catalog_products(id) on delete cascade,
  category_id uuid not null references public.web_catalog_categories(id) on delete cascade,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (product_id, category_id)
);

create index if not exists web_catalog_product_categories_category_idx
  on public.web_catalog_product_categories (category_id, sort_order, product_id);

create table if not exists public.web_catalog_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.web_catalog_products(id) on delete cascade,
  storage_path text not null unique,
  public_url text not null,
  alt_text text not null default '',
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint web_catalog_images_alt_length_check
    check (char_length(alt_text) <= 180)
);

create unique index if not exists web_catalog_images_one_cover_uidx
  on public.web_catalog_images (product_id)
  where is_cover = true;
create index if not exists web_catalog_images_product_order_idx
  on public.web_catalog_images (product_id, is_cover desc, sort_order, created_at);

create table if not exists public.web_catalog_events (
  id bigint generated always as identity primary key,
  product_id uuid references public.web_catalog_products(id) on delete set null,
  actor_id uuid references public.app_users(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint web_catalog_events_type_check check (
    event_type in (
      'imported', 'updated', 'published', 'unpublished', 'archived',
      'restored', 'source_changed', 'source_inactive', 'source_missing',
      'source_reviewed'
    )
  )
);

create index if not exists web_catalog_events_product_created_idx
  on public.web_catalog_events (product_id, created_at desc);
create index if not exists web_catalog_events_actor_created_idx
  on public.web_catalog_events (actor_id, created_at desc)
  where actor_id is not null;

create or replace function private.web_catalog_slugify(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(
    translate(
      lower(coalesce(value, '')),
      'áéíóúüñÁÉÍÓÚÜÑ',
      'aeiouunAEIOUUN'
    ),
    '[^a-z0-9]+',
    '-',
    'g'
  ));
$$;

create or replace function private.web_catalog_current_actor_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select app_user.id
  from public.app_users as app_user
  where app_user.auth_user_id = (select auth.uid())
    and app_user.is_active = true
  limit 1;
$$;

create or replace function private.web_catalog_has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_users as app_user
    where app_user.auth_user_id = (select auth.uid())
      and app_user.is_active = true
      and case
        when coalesce(app_user.permissions_override, '{}'::jsonb) ? permission_key
          then coalesce((app_user.permissions_override ->> permission_key)::boolean, false)
        when app_user.role in ('system', 'owner') then true
        else false
      end
  );
$$;

create or replace function private.web_catalog_source_snapshot(source_row public.products)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', source_row.id,
    'title', coalesce(source_row.title, ''),
    'brand', coalesce(source_row.brand, ''),
    'price', coalesce(source_row.price, 0),
    'stock', coalesce(source_row.stock, 0),
    'category', coalesce(source_row.category, ''),
    'image', coalesce(source_row.image, ''),
    'image_thumb', coalesce(source_row.image_thumb, ''),
    'barcode', coalesce(source_row.barcode, ''),
    'product_type', coalesce(source_row.product_type, 'quantity'),
    'is_active', coalesce(source_row.is_active, false),
    'deleted_at', source_row.deleted_at,
    'updated_at', source_row.updated_at
  );
$$;

create or replace function private.web_catalog_source_fingerprint(source_row public.products)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select md5((select private.web_catalog_source_snapshot(source_row))::text);
$$;

revoke all on function private.web_catalog_slugify(text) from public, anon, authenticated;
revoke all on function private.web_catalog_current_actor_id() from public, anon;
revoke all on function private.web_catalog_has_permission(text) from public, anon;
revoke all on function private.web_catalog_source_snapshot(public.products) from public, anon, authenticated;
revoke all on function private.web_catalog_source_fingerprint(public.products) from public, anon, authenticated;
grant execute on function private.web_catalog_current_actor_id() to authenticated;
grant execute on function private.web_catalog_has_permission(text) to authenticated;

alter table public.products
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_products_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
before update on public.products
for each row
execute function public.set_products_updated_at();

create or replace function private.web_catalog_prepare_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select private.web_catalog_current_actor_id());
  source_row public.products;
begin
  new.slug := private.web_catalog_slugify(new.slug);
  if new.slug = '' then
    new.slug := 'producto-' || new.source_product_id::text;
  end if;

  if tg_op = 'INSERT' then
    new.catalog_code := 'REB-' || lpad(nextval('public.web_catalog_code_seq')::text, 6, '0');
    select * into source_row
    from public.products
    where id = new.source_product_id
    limit 1;

    if source_row.id is null then
      raise exception 'El producto de Rebu no existe.' using errcode = '23503';
    end if;

    new.source_snapshot := private.web_catalog_source_snapshot(source_row);
    new.source_fingerprint := private.web_catalog_source_fingerprint(source_row);
    new.source_checked_at := now();
    new.source_state := case
      when source_row.is_active = false or source_row.deleted_at is not null then 'inactive'
      else 'current'
    end;
    new.requires_review := new.source_state <> 'current';
    new.created_by := actor_id;
    new.updated_by := actor_id;
  elsif pg_trigger_depth() = 1 then
    if new.catalog_code is distinct from old.catalog_code
      or new.source_product_id is distinct from old.source_product_id then
      raise exception 'El codigo publico y el vinculo de origen son inmutables.' using errcode = '23514';
    end if;
    new.updated_by := actor_id;
  end if;

  new.updated_at := now();

  if new.status = 'published' and pg_trigger_depth() = 1 then
    if not (select private.web_catalog_has_permission('catalog.publish')) then
      raise exception 'No tenes permiso para publicar el catalogo.' using errcode = '42501';
    end if;
    if new.source_state in ('inactive', 'missing') or new.requires_review then
      raise exception 'Revisa el vinculo con Rebu antes de publicar.' using errcode = '23514';
    end if;
    if char_length(trim(new.title)) < 3
      or char_length(trim(new.short_description)) < 20
      or char_length(trim(new.description)) < 40
      or new.web_price <= 0
      or not exists (
        select 1
        from public.web_catalog_product_categories as link
        join public.web_catalog_categories as category on category.id = link.category_id
        where link.product_id = new.id and category.is_active = true
      )
      or not exists (
        select 1
        from public.web_catalog_images as image
        where image.product_id = new.id and image.is_cover = true
      ) then
      raise exception 'La ficha no cumple los requisitos de publicacion.' using errcode = '23514';
    end if;

    if tg_op = 'INSERT' or old.status is distinct from 'published' then
      new.published_at := now();
      new.published_by := actor_id;
      new.unpublished_reason := null;
    end if;
  elsif tg_op = 'UPDATE' and old.status = 'published' and new.status <> 'published' then
    if pg_trigger_depth() = 1 and not (select private.web_catalog_has_permission('catalog.publish')) then
      raise exception 'No tenes permiso para despublicar el catalogo.' using errcode = '42501';
    end if;
    new.published_at := null;
    new.published_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_web_catalog_prepare_product on public.web_catalog_products;
create trigger trg_web_catalog_prepare_product
before insert or update on public.web_catalog_products
for each row
execute function private.web_catalog_prepare_product();

create or replace function private.web_catalog_prepare_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select private.web_catalog_current_actor_id());
begin
  new.slug := private.web_catalog_slugify(new.slug);
  if new.slug = '' then
    new.slug := private.web_catalog_slugify(new.name::text);
  end if;
  if new.slug = '' then
    raise exception 'La categoria necesita un nombre valido.' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := actor_id;
  end if;
  new.updated_by := actor_id;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_web_catalog_prepare_category on public.web_catalog_categories;
create trigger trg_web_catalog_prepare_category
before insert or update on public.web_catalog_categories
for each row
execute function private.web_catalog_prepare_category();

create or replace function private.web_catalog_prepare_image()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select private.web_catalog_current_actor_id());
  image_count integer;
begin
  if tg_op = 'INSERT' then
    select count(*) into image_count
    from public.web_catalog_images
    where product_id = new.product_id;
    if image_count >= 8 then
      raise exception 'Cada producto admite hasta 8 imagenes.' using errcode = '23514';
    end if;
    new.created_by := actor_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_web_catalog_prepare_image on public.web_catalog_images;
create trigger trg_web_catalog_prepare_image
before insert or update on public.web_catalog_images
for each row
execute function private.web_catalog_prepare_image();

create or replace function private.web_catalog_audit_product()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_name text;
  actor_id uuid := (select private.web_catalog_current_actor_id());
begin
  if tg_op = 'INSERT' then
    event_name := 'imported';
  elsif old.source_state <> new.source_state and new.source_state = 'missing' then
    event_name := 'source_missing';
  elsif old.source_state <> new.source_state and new.source_state = 'inactive' then
    event_name := 'source_inactive';
  elsif old.status <> new.status then
    event_name := case
      when new.status = 'published' then 'published'
      when new.status = 'archived' then 'archived'
      when old.status = 'archived' then 'restored'
      else 'unpublished'
    end;
  elsif old.source_state <> new.source_state and new.source_state = 'changed' then
    event_name := 'source_changed';
  elsif old.source_reviewed_at is distinct from new.source_reviewed_at then
    event_name := 'source_reviewed';
  else
    event_name := 'updated';
  end if;

  insert into public.web_catalog_events (product_id, actor_id, event_type, payload)
  values (
    new.id,
    actor_id,
    event_name,
    jsonb_build_object(
      'status', new.status,
      'source_state', new.source_state,
      'requires_review', new.requires_review
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_web_catalog_audit_product on public.web_catalog_products;
create trigger trg_web_catalog_audit_product
after insert or update on public.web_catalog_products
for each row
execute function private.web_catalog_audit_product();

create or replace function private.web_catalog_note_source_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_fingerprint text;
begin
  if tg_op = 'DELETE' then
    update public.web_catalog_products
    set status = case when status = 'published' then 'draft' else status end,
        source_state = 'missing',
        requires_review = true,
        unpublished_reason = 'source_missing',
        source_checked_at = now()
    where source_product_id = old.id;
    return old;
  end if;

  next_fingerprint := private.web_catalog_source_fingerprint(new);

  update public.web_catalog_products
  set status = case
        when (new.is_active = false or new.deleted_at is not null) and status = 'published' then 'draft'
        else status
      end,
      source_state = case
        when new.is_active = false or new.deleted_at is not null then 'inactive'
        when source_fingerprint <> next_fingerprint then 'changed'
        else 'current'
      end,
      requires_review = case
        when new.is_active = false or new.deleted_at is not null then true
        else source_fingerprint <> next_fingerprint
      end,
      unpublished_reason = case
        when new.is_active = false or new.deleted_at is not null then 'source_inactive'
        else unpublished_reason
      end,
      source_checked_at = now()
  where source_product_id = new.id;

  return new;
end;
$$;

drop trigger if exists trg_web_catalog_source_updated on public.products;
create trigger trg_web_catalog_source_updated
after update on public.products
for each row
execute function private.web_catalog_note_source_change();

drop trigger if exists trg_web_catalog_source_deleted on public.products;
create trigger trg_web_catalog_source_deleted
before delete on public.products
for each row
execute function private.web_catalog_note_source_change();

create or replace function public.import_web_catalog_product(p_source_product_id bigint)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_row public.products;
  created_id uuid;
  base_slug text;
begin
  if not (select private.web_catalog_has_permission('catalog.edit')) then
    raise exception 'No tenes permiso para editar el catalogo.' using errcode = '42501';
  end if;

  select * into source_row
  from public.products
  where id = p_source_product_id
    and is_active = true
    and deleted_at is null
  limit 1;

  if source_row.id is null then
    raise exception 'El producto de Rebu no existe o esta inactivo.' using errcode = 'P0002';
  end if;

  base_slug := private.web_catalog_slugify(source_row.title);
  if base_slug = '' then base_slug := 'producto'; end if;

  insert into public.web_catalog_products (
    source_product_id, slug, title, brand, web_price, price_unit,
    availability, status
  ) values (
    source_row.id,
    base_slug || '-' || source_row.id::text,
    left(trim(coalesce(source_row.title, 'Producto Rebu')), 120),
    left(trim(coalesce(source_row.brand, '')), 120),
    round(
      case when source_row.product_type = 'weight'
        then coalesce(source_row.price, 0) * 1000
        else coalesce(source_row.price, 0)
      end,
      2
    ),
    case when source_row.product_type = 'weight' then 'kg' else 'unit' end,
    'on_request',
    'draft'
  )
  returning id into created_id;

  return created_id;
exception
  when unique_violation then
    raise exception 'Este producto ya fue agregado al catalogo.' using errcode = '23505';
end;
$$;

create or replace function public.review_web_catalog_source(
  p_catalog_product_id uuid,
  p_apply_fields text[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  catalog_row public.web_catalog_products;
  source_row public.products;
  next_snapshot jsonb;
  next_fingerprint text;
begin
  if not (select private.web_catalog_has_permission('catalog.edit')) then
    raise exception 'No tenes permiso para editar el catalogo.' using errcode = '42501';
  end if;

  select * into catalog_row
  from public.web_catalog_products
  where id = p_catalog_product_id
  for update;

  if catalog_row.id is null then
    raise exception 'La ficha del catalogo no existe.' using errcode = 'P0002';
  end if;

  select * into source_row
  from public.products
  where id = catalog_row.source_product_id
  limit 1;

  if source_row.id is null then
    raise exception 'El producto fuente ya no existe.' using errcode = 'P0002';
  end if;
  if source_row.is_active = false or source_row.deleted_at is not null then
    raise exception 'El producto fuente sigue inactivo.' using errcode = '23514';
  end if;

  next_snapshot := private.web_catalog_source_snapshot(source_row);
  next_fingerprint := private.web_catalog_source_fingerprint(source_row);
  p_apply_fields := coalesce(p_apply_fields, '{}'::text[]);

  update public.web_catalog_products
  set title = case when 'title' = any(p_apply_fields) then left(trim(source_row.title), 120) else title end,
      brand = case when 'brand' = any(p_apply_fields) then left(trim(coalesce(source_row.brand, '')), 120) else brand end,
      web_price = case when 'price' = any(p_apply_fields) then round(
        case when source_row.product_type = 'weight' then source_row.price * 1000 else source_row.price end,
        2
      ) else web_price end,
      price_unit = case when 'price_unit' = any(p_apply_fields)
        then case when source_row.product_type = 'weight' then 'kg' else 'unit' end
        else price_unit
      end,
      source_snapshot = next_snapshot,
      source_fingerprint = next_fingerprint,
      source_state = 'current',
      source_reviewed_at = now(),
      source_checked_at = now(),
      requires_review = false,
      unpublished_reason = case when unpublished_reason in ('source_inactive', 'source_missing') then null else unpublished_reason end
  where id = catalog_row.id;
end;
$$;

revoke all on function public.import_web_catalog_product(bigint) from public, anon, authenticated;
revoke all on function public.review_web_catalog_source(uuid, text[]) from public, anon, authenticated;
grant execute on function public.import_web_catalog_product(bigint) to authenticated;
grant execute on function public.review_web_catalog_source(uuid, text[]) to authenticated;

alter table public.web_catalog_products enable row level security;
alter table public.web_catalog_categories enable row level security;
alter table public.web_catalog_product_categories enable row level security;
alter table public.web_catalog_images enable row level security;
alter table public.web_catalog_events enable row level security;

drop policy if exists web_catalog_products_public_read on public.web_catalog_products;
create policy web_catalog_products_public_read
on public.web_catalog_products for select to anon
using (status = 'published');

drop policy if exists web_catalog_products_authenticated_read on public.web_catalog_products;
create policy web_catalog_products_authenticated_read
on public.web_catalog_products for select to authenticated
using (status = 'published' or (select private.web_catalog_has_permission('catalog.view')));

drop policy if exists web_catalog_products_editor_insert on public.web_catalog_products;
create policy web_catalog_products_editor_insert
on public.web_catalog_products for insert to authenticated
with check ((select private.web_catalog_has_permission('catalog.edit')));

drop policy if exists web_catalog_products_editor_update on public.web_catalog_products;
create policy web_catalog_products_editor_update
on public.web_catalog_products for update to authenticated
using ((select private.web_catalog_has_permission('catalog.edit')))
with check ((select private.web_catalog_has_permission('catalog.edit')));

drop policy if exists web_catalog_categories_public_read on public.web_catalog_categories;
create policy web_catalog_categories_public_read
on public.web_catalog_categories for select to anon
using (is_active = true);

drop policy if exists web_catalog_categories_authenticated_read on public.web_catalog_categories;
create policy web_catalog_categories_authenticated_read
on public.web_catalog_categories for select to authenticated
using (is_active = true or (select private.web_catalog_has_permission('catalog.view')));

drop policy if exists web_catalog_categories_editor_insert on public.web_catalog_categories;
create policy web_catalog_categories_editor_insert
on public.web_catalog_categories for insert to authenticated
with check ((select private.web_catalog_has_permission('catalog.edit')));

drop policy if exists web_catalog_categories_editor_update on public.web_catalog_categories;
create policy web_catalog_categories_editor_update
on public.web_catalog_categories for update to authenticated
using ((select private.web_catalog_has_permission('catalog.edit')))
with check ((select private.web_catalog_has_permission('catalog.edit')));

drop policy if exists web_catalog_product_categories_public_read on public.web_catalog_product_categories;
create policy web_catalog_product_categories_public_read
on public.web_catalog_product_categories for select to anon
using (
  exists (
    select 1 from public.web_catalog_products as product
    where product.id = product_id and product.status = 'published'
  )
  and exists (
    select 1 from public.web_catalog_categories as category
    where category.id = category_id and category.is_active = true
  )
);

drop policy if exists web_catalog_product_categories_authenticated_read on public.web_catalog_product_categories;
create policy web_catalog_product_categories_authenticated_read
on public.web_catalog_product_categories for select to authenticated
using (
  (select private.web_catalog_has_permission('catalog.view'))
  or exists (
    select 1 from public.web_catalog_products as product
    where product.id = product_id and product.status = 'published'
  )
);

drop policy if exists web_catalog_product_categories_editor_insert on public.web_catalog_product_categories;
create policy web_catalog_product_categories_editor_insert
on public.web_catalog_product_categories for insert to authenticated
with check ((select private.web_catalog_has_permission('catalog.edit')));

drop policy if exists web_catalog_product_categories_editor_update on public.web_catalog_product_categories;
create policy web_catalog_product_categories_editor_update
on public.web_catalog_product_categories for update to authenticated
using ((select private.web_catalog_has_permission('catalog.edit')))
with check ((select private.web_catalog_has_permission('catalog.edit')));

drop policy if exists web_catalog_product_categories_editor_delete on public.web_catalog_product_categories;
create policy web_catalog_product_categories_editor_delete
on public.web_catalog_product_categories for delete to authenticated
using ((select private.web_catalog_has_permission('catalog.edit')));

drop policy if exists web_catalog_images_public_read on public.web_catalog_images;
create policy web_catalog_images_public_read
on public.web_catalog_images for select to anon
using (
  exists (
    select 1 from public.web_catalog_products as product
    where product.id = product_id and product.status = 'published'
  )
);

drop policy if exists web_catalog_images_authenticated_read on public.web_catalog_images;
create policy web_catalog_images_authenticated_read
on public.web_catalog_images for select to authenticated
using (
  (select private.web_catalog_has_permission('catalog.view'))
  or exists (
    select 1 from public.web_catalog_products as product
    where product.id = product_id and product.status = 'published'
  )
);

drop policy if exists web_catalog_images_editor_insert on public.web_catalog_images;
create policy web_catalog_images_editor_insert
on public.web_catalog_images for insert to authenticated
with check ((select private.web_catalog_has_permission('catalog.edit')));

drop policy if exists web_catalog_images_editor_update on public.web_catalog_images;
create policy web_catalog_images_editor_update
on public.web_catalog_images for update to authenticated
using ((select private.web_catalog_has_permission('catalog.edit')))
with check ((select private.web_catalog_has_permission('catalog.edit')));

drop policy if exists web_catalog_images_editor_delete on public.web_catalog_images;
create policy web_catalog_images_editor_delete
on public.web_catalog_images for delete to authenticated
using ((select private.web_catalog_has_permission('catalog.edit')));

drop policy if exists web_catalog_events_editor_read on public.web_catalog_events;
create policy web_catalog_events_editor_read
on public.web_catalog_events for select to authenticated
using ((select private.web_catalog_has_permission('catalog.view')));

revoke all on table public.web_catalog_products from public, anon, authenticated;
revoke all on table public.web_catalog_categories from public, anon, authenticated;
revoke all on table public.web_catalog_product_categories from public, anon, authenticated;
revoke all on table public.web_catalog_images from public, anon, authenticated;
revoke all on table public.web_catalog_events from public, anon, authenticated;

grant select (
  id, catalog_code, slug, title, brand, short_description, description,
  web_price, price_unit, availability, tags, seo_title, seo_description,
  is_featured, sort_order, published_at, status
) on public.web_catalog_products to anon;
grant select (id, name, slug, description, accent_color, sort_order, is_active)
  on public.web_catalog_categories to anon;
grant select on public.web_catalog_product_categories to anon;
grant select (id, product_id, public_url, alt_text, sort_order, is_cover, created_at)
  on public.web_catalog_images to anon;

grant select on public.web_catalog_products to authenticated;
grant update (
  slug, title, brand, short_description, description, web_price, price_unit,
  availability, status, tags, seo_title, seo_description, is_featured,
  sort_order, unpublished_reason
) on public.web_catalog_products to authenticated;
grant select, insert, update on public.web_catalog_categories to authenticated;
grant select, insert, update, delete on public.web_catalog_product_categories to authenticated;
grant select, insert, update, delete on public.web_catalog_images to authenticated;
grant select on public.web_catalog_events to authenticated;
grant usage, select on sequence public.web_catalog_code_seq to authenticated;
grant usage, select on sequence public.web_catalog_events_id_seq to authenticated;

grant all on public.web_catalog_products to service_role;
grant all on public.web_catalog_categories to service_role;
grant all on public.web_catalog_product_categories to service_role;
grant all on public.web_catalog_images to service_role;
grant all on public.web_catalog_events to service_role;
grant usage, select on sequence public.web_catalog_code_seq to service_role;
grant usage, select on sequence public.web_catalog_events_id_seq to service_role;

create or replace view public.web_catalog_public_products
with (security_invoker = true)
as
select
  product.id,
  product.catalog_code,
  product.slug,
  product.title,
  product.brand,
  product.short_description,
  product.description,
  product.web_price,
  product.price_unit,
  product.availability,
  product.tags,
  product.seo_title,
  product.seo_description,
  product.is_featured,
  product.sort_order,
  product.published_at,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', category.id,
        'name', category.name::text,
        'slug', category.slug,
        'accent_color', category.accent_color
      ) order by link.sort_order, category.sort_order, category.name
    )
    from public.web_catalog_product_categories as link
    join public.web_catalog_categories as category on category.id = link.category_id
    where link.product_id = product.id and category.is_active = true
  ), '[]'::jsonb) as categories,
  coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', image.id,
        'url', image.public_url,
        'alt', image.alt_text,
        'is_cover', image.is_cover
      ) order by image.is_cover desc, image.sort_order, image.created_at
    )
    from public.web_catalog_images as image
    where image.product_id = product.id
  ), '[]'::jsonb) as images
from public.web_catalog_products as product
where product.status = 'published';

revoke all on public.web_catalog_public_products from public, anon, authenticated;
grant select on public.web_catalog_public_products to anon, authenticated;
grant select on public.web_catalog_public_products to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'catalog-images',
  'catalog-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists rebu_catalog_images_editor_select on storage.objects;
create policy rebu_catalog_images_editor_select
on storage.objects for select to authenticated
using (
  bucket_id = 'catalog-images'
  and (select private.web_catalog_has_permission('catalog.view'))
);

drop policy if exists rebu_catalog_images_editor_insert on storage.objects;
create policy rebu_catalog_images_editor_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'catalog-images'
  and (storage.foldername(name))[1] = 'products'
  and (select private.web_catalog_has_permission('catalog.edit'))
);

drop policy if exists rebu_catalog_images_editor_update on storage.objects;
create policy rebu_catalog_images_editor_update
on storage.objects for update to authenticated
using (
  bucket_id = 'catalog-images'
  and (select private.web_catalog_has_permission('catalog.edit'))
)
with check (
  bucket_id = 'catalog-images'
  and (storage.foldername(name))[1] = 'products'
  and (select private.web_catalog_has_permission('catalog.edit'))
);

drop policy if exists rebu_catalog_images_editor_delete on storage.objects;
create policy rebu_catalog_images_editor_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'catalog-images'
  and (select private.web_catalog_has_permission('catalog.edit'))
);

drop policy if exists "Public Access Products" on public.products;
revoke all on table public.products from anon;
revoke all on sequence public.products_id_seq from anon;
grant select (
  id, created_at, title, brand, price, stock, category, image, barcode,
  is_active, deleted_at, product_type, image_thumb, updated_at
) on public.products to anon;

alter table public.products enable row level security;

drop policy if exists products_public_active_read on public.products;
create policy products_public_active_read
on public.products for select to anon
using (is_active = true and deleted_at is null);

drop policy if exists products_rebu_authenticated_access on public.products;
create policy products_rebu_authenticated_access
on public.products for all to authenticated
using ((select private.web_catalog_current_actor_id()) is not null)
with check ((select private.web_catalog_current_actor_id()) is not null);

grant select, insert, update, delete on public.products to authenticated;
grant usage, select on sequence public.products_id_seq to authenticated;

revoke all on function public.set_products_updated_at() from public, anon, authenticated;
revoke all on function private.web_catalog_prepare_product() from public, anon, authenticated;
revoke all on function private.web_catalog_prepare_category() from public, anon, authenticated;
revoke all on function private.web_catalog_prepare_image() from public, anon, authenticated;
revoke all on function private.web_catalog_audit_product() from public, anon, authenticated;
revoke all on function private.web_catalog_note_source_change() from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
