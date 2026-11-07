begin;

-- The mobile client never writes tables directly. Privileged implementations
-- live outside the exposed schema and derive the actor from Supabase Auth.
create table private.rebu_mobile_stock_operations (
  operation_id uuid primary key,
  actor_id uuid not null,
  product_id bigint not null,
  request jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table private.rebu_mobile_stock_operations enable row level security;
revoke all on private.rebu_mobile_stock_operations from public, anon, authenticated;

create function private.rebu_mobile_product_payload(p public.products)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id::text, 'title', p.title, 'brand', p.brand,
    'barcode', p.barcode, 'stock', p.stock, 'price', p.price,
    'category', p.category, 'product_type', p.product_type,
    'image_thumb', p.image_thumb, 'updated_at', p.updated_at
  );
$$;
revoke all on function private.rebu_mobile_product_payload(public.products) from public, anon, authenticated;

create function private.rebu_mobile_profile()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Ingresá con tu usuario de Rebu.' using errcode = '42501'; end if;
  actor := private.current_rebu_transaction_actor();
  perform private.require_rebu_permission(actor, 'inventory.view');
  return jsonb_build_object('id', actor->>'id', 'display_name', actor->>'display_name',
    'can_edit', private.rebu_actor_can(actor, 'inventory.edit'));
end;
$$;

create function private.rebu_mobile_search_products(p_query text, p_offset integer, p_exact boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor jsonb; products jsonb; has_more boolean; query_text text; terms text[];
begin
  if (select auth.uid()) is null then raise exception 'Ingresá con tu usuario de Rebu.' using errcode = '42501'; end if;
  actor := private.current_rebu_transaction_actor();
  perform private.require_rebu_permission(actor, 'inventory.view');
  if p_offset is null or p_offset < 0 or p_offset > 100000 then raise exception 'Página inválida.'; end if;
  query_text := left(trim(coalesce(p_query, '')), 120);
  terms := regexp_split_to_array(translate(lower(query_text), 'áéíóúüñ', 'aeiouun'), '\s+');
  with matches as (
    select p.* from public.products p
    where p.is_active is distinct from false and p.deleted_at is null
      and case when p_exact then p.barcode = query_text
        else query_text = '' or not exists (
          select 1 from unnest(terms) term
          where strpos(translate(lower(concat_ws(' ', p.title, p.brand, p.barcode)), 'áéíóúüñ', 'aeiouun'), term) = 0
        ) end
    order by case when p.barcode = query_text then 0 else 1 end, p.title, p.id
    limit 31 offset p_offset
  ), numbered as (select m.*, row_number() over () as position from matches m)
  select coalesce(jsonb_agg(private.rebu_mobile_product_payload(p) order by n.position) filter (where n.position <= 30), '[]'::jsonb),
    count(*) > 30
    into products, has_more
  from numbered n join public.products p on p.id = n.id;
  return jsonb_build_object('products', products, 'has_more', has_more);
end;
$$;

create function private.rebu_mobile_product(p_product_id bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor jsonb; product public.products;
begin
  if (select auth.uid()) is null then raise exception 'Ingresá con tu usuario de Rebu.' using errcode = '42501'; end if;
  actor := private.current_rebu_transaction_actor();
  perform private.require_rebu_permission(actor, 'inventory.view');
  select * into product from public.products where id = p_product_id and is_active is distinct from false and deleted_at is null;
  if not found then raise exception 'El producto ya no está disponible.' using errcode = 'P0002'; end if;
  return private.rebu_mobile_product_payload(product);
end;
$$;

create function private.rebu_mobile_save_stock(
  p_operation_id uuid, p_product_id bigint, p_mode text,
  p_quantity bigint, p_expected_stock bigint, p_reason text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor jsonb; product public.products; previous private.rebu_mobile_stock_operations;
  request jsonb; result jsonb; next_stock bigint; stock_before integer; lifecycle jsonb;
begin
  if (select auth.uid()) is null then raise exception 'Ingresá con tu usuario de Rebu.' using errcode = '42501'; end if;
  actor := private.current_rebu_transaction_actor();
  perform private.require_rebu_permission(actor, 'inventory.view');
  perform private.require_rebu_permission(actor, 'inventory.edit');
  if p_operation_id is null or p_product_id is null or p_mode is null or p_mode not in ('add', 'set')
    or p_quantity is null or p_quantity < 0 or p_quantity > 2147483647
    or p_expected_stock is null or (p_mode = 'add' and p_quantity = 0)
    or length(trim(coalesce(p_reason, ''))) < 3 or length(p_reason) > 300 then
    raise exception 'Revisá la cantidad y escribí un motivo de entre 3 y 300 caracteres.' using errcode = '22023';
  end if;
  request := jsonb_build_object('product_id', p_product_id, 'mode', p_mode, 'quantity', p_quantity,
    'expected_stock', p_expected_stock, 'reason', trim(p_reason));
  -- Serializes retries of the same operation, including concurrent HTTP requests.
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  select * into previous from private.rebu_mobile_stock_operations where operation_id = p_operation_id;
  if found then
    if previous.actor_id <> (actor->>'id')::uuid or previous.request <> request then
      raise exception 'Este movimiento ya se usó con otros datos.' using errcode = '22023';
    end if;
    return previous.result || jsonb_build_object('replayed', true);
  end if;
  select * into product from public.products where id = p_product_id for update;
  if not found or product.is_active is false or product.deleted_at is not null then
    raise exception 'El producto ya no está disponible.' using errcode = 'P0002';
  end if;
  if product.stock is distinct from p_expected_stock then
    raise exception 'El stock cambió. Actualizá el producto antes de confirmar.' using errcode = '40001';
  end if;
  stock_before := product.stock;
  next_stock := case when p_mode = 'add' then product.stock::bigint + p_quantity else p_quantity end;
  if next_stock < 0 or next_stock > 2147483647 or next_stock = product.stock then
    raise exception 'El stock resultante está fuera de rango o no tiene cambios.' using errcode = '22023';
  end if;
  lifecycle := coalesce(product.supplier_links->'stock_lifecycle', '{}'::jsonb);
  if next_stock > 0 then
    lifecycle := (lifecycle - 'outOfStockSince') || jsonb_build_object('lastRestockedAt', now());
  elsif product.stock > 0 then
    lifecycle := lifecycle || jsonb_build_object('outOfStockSince', coalesce(lifecycle->'outOfStockSince', to_jsonb(now())));
  end if;
  update public.products set stock = next_stock::integer, updated_at = now(),
    supplier_links = jsonb_set(coalesce(supplier_links, '{}'::jsonb), '{stock_lifecycle}', lifecycle)
    where id = product.id returning * into product;
  result := jsonb_build_object('product', private.rebu_mobile_product_payload(product),
    'before', stock_before, 'after', next_stock, 'operation_id', p_operation_id, 'replayed', false);
  insert into public.logs (action, details, "user", user_name, user_id, user_role, reason)
  values (case when p_mode = 'add' then 'Ingreso de Stock' else 'Ajuste de Stock' end,
    jsonb_build_object('id', product.id, 'title', product.title, 'source', 'mobile_pwa',
      'operation_id', p_operation_id, 'mode', p_mode, 'previousStock', stock_before,
      'newStock', next_stock, 'quantity', next_stock - stock_before, 'product_type', product.product_type),
    actor->>'display_name', actor->>'display_name', actor->>'id', actor->>'role', trim(p_reason));
  insert into private.rebu_mobile_stock_operations(operation_id, actor_id, product_id, request, result)
    values (p_operation_id, (actor->>'id')::uuid, product.id, request, result);
  return result;
end;
$$;

-- Explicit invoker wrappers are the only mobile endpoints in the Data API.
create function public.rebu_mobile_profile() returns jsonb language sql security invoker set search_path = ''
  as $$ select private.rebu_mobile_profile(); $$;
create function public.rebu_mobile_search_products(p_query text default '', p_offset integer default 0, p_exact boolean default false)
returns jsonb language sql security invoker set search_path = ''
  as $$ select private.rebu_mobile_search_products(p_query, p_offset, p_exact); $$;
create function public.rebu_mobile_product(p_product_id bigint) returns jsonb language sql security invoker set search_path = ''
  as $$ select private.rebu_mobile_product(p_product_id); $$;
create function public.rebu_mobile_save_stock(p_operation_id uuid, p_product_id bigint, p_mode text, p_quantity bigint, p_expected_stock bigint, p_reason text)
returns jsonb language sql security invoker set search_path = ''
  as $$ select private.rebu_mobile_save_stock(p_operation_id, p_product_id, p_mode, p_quantity, p_expected_stock, p_reason); $$;

revoke all on function private.rebu_mobile_profile(), private.rebu_mobile_search_products(text, integer, boolean),
  private.rebu_mobile_product(bigint), private.rebu_mobile_save_stock(uuid, bigint, text, bigint, bigint, text) from public, anon, authenticated;
revoke all on function public.rebu_mobile_profile(), public.rebu_mobile_search_products(text, integer, boolean),
  public.rebu_mobile_product(bigint), public.rebu_mobile_save_stock(uuid, bigint, text, bigint, bigint, text) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.rebu_mobile_profile(), private.rebu_mobile_search_products(text, integer, boolean),
  private.rebu_mobile_product(bigint), private.rebu_mobile_save_stock(uuid, bigint, text, bigint, bigint, text) to authenticated;
grant execute on function public.rebu_mobile_profile(), public.rebu_mobile_search_products(text, integer, boolean),
  public.rebu_mobile_product(bigint), public.rebu_mobile_save_stock(uuid, bigint, text, bigint, bigint, text) to authenticated;

notify pgrst, 'reload schema';
commit;
