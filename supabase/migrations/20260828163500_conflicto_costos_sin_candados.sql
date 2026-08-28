-- Conflicto de costos de proveedor: barato y no reintentable.
--
-- 1) El chequeo de expected_updated_at ahora corre TAMBIEN antes del for update.
--    Antes, un lote en conflicto trababa filas de products y recien despues
--    abortaba. Entre el 19 y el 28 de agosto de 2026 la base acumulo 84.133.325
--    transacciones abortadas (6.711/min) contra 1.383.537 exitosas: 168.260.530
--    busquedas por PK en products, exactamente 2 por transaccion fallida (el
--    candado y el chequeo). El filtro previo deja el camino de conflicto sin
--    candados. El chequeo posterior NO se saca: es el unico atomico y sigue
--    siendo el que decide.
--
-- 2) El errcode pasa de 40001 a P0001. 40001 es "serialization_failure", que
--    toda la cadena (PostgREST, poolers, wrappers) entiende como "reintenta
--    solo, es transitorio". Aca no lo es: si el inventario cambio, repetir el
--    mismo pedido falla siempre, y cualquier capa que reintente entra en bucle.
--    El mensaje al usuario no cambia; nadie mira el codigo (verificado en src,
--    tests y el bundle instalado).

begin;

CREATE OR REPLACE FUNCTION public.apply_supplier_product_updates_batch(p_action text, p_updates jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor jsonb;
  normalized_action text := lower(trim(coalesce(p_action, '')));
  requested_count integer;
  locked_count integer;
  updated_count integer;
  updated_products jsonb;
begin
  actor := private.current_rebu_transaction_actor();
  perform private.require_rebu_permission(actor, 'bulkEditor.view');
  perform private.require_rebu_permission(actor, 'inventory.edit');

  if normalized_action <> all(array['review', 'ignore', 'approve', 'undo', 'link']) then
    raise exception 'Accion de costos de proveedor invalida';
  end if;

  if p_updates is null or jsonb_typeof(p_updates) <> 'array' then
    raise exception 'El lote de costos debe ser un arreglo JSON';
  end if;

  requested_count := jsonb_array_length(p_updates);
  if requested_count < 1 or requested_count > 500 then
    raise exception 'El lote debe contener entre 1 y 500 productos';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_updates) as update_row(
      product_id bigint,
      expected_updated_at timestamptz,
      purchase_price numeric,
      sale_price numeric,
      apply_purchase_price boolean,
      apply_sale_price boolean,
      supplier_links jsonb
    )
    where update_row.product_id is null
      or update_row.supplier_links is null
      or jsonb_typeof(update_row.supplier_links) <> 'object'
      or (
        coalesce(update_row.apply_purchase_price, false)
        and (update_row.purchase_price is null or update_row.purchase_price <= 0)
      )
      or (
        coalesce(update_row.apply_sale_price, false)
        and (update_row.sale_price is null or update_row.sale_price <= 0)
      )
  ) then
    raise exception 'El lote contiene datos de producto invalidos';
  end if;

  if (
    select count(distinct update_row.product_id)
    from jsonb_to_recordset(p_updates) as update_row(product_id bigint)
  ) <> requested_count then
    raise exception 'El lote contiene productos duplicados';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_updates) as update_row(
      apply_purchase_price boolean,
      apply_sale_price boolean
    )
    where (
      normalized_action in ('review', 'ignore', 'link')
      and (
        coalesce(update_row.apply_purchase_price, false)
        or coalesce(update_row.apply_sale_price, false)
      )
    ) or (
      normalized_action = 'undo'
      and (
        not coalesce(update_row.apply_purchase_price, false)
        or coalesce(update_row.apply_sale_price, false)
      )
    ) or (
      normalized_action = 'approve'
      and not coalesce(update_row.apply_purchase_price, false)
    )
  ) then
    raise exception 'La accion no coincide con los campos solicitados';
  end if;

  -- Filtro barato ANTES de tomar candados. Un lote cuyo expected_updated_at ya
  -- no coincide antes moria DESPUES del for update: trababa filas reales de
  -- products solo para abortar. Con 84 millones de llamadas fallidas (ago-2026)
  -- eso era lo que peleaba con la caja. El chequeo con candado sigue mas abajo y
  -- es el que manda; este solo evita el trabajo inutil.
  if exists (
    select 1
    from public.products as product
    join jsonb_to_recordset(p_updates) as update_row(
      product_id bigint,
      expected_updated_at timestamptz
    ) on product.id = update_row.product_id
    where update_row.expected_updated_at is not null
      and product.updated_at is distinct from update_row.expected_updated_at
  ) then
    raise exception 'El inventario cambio en otra terminal. Recarga y volve a intentar.'
      using errcode = 'P0001';
  end if;

  -- Deterministic locking keeps the transaction short and prevents deadlocks
  -- when two terminals happen to touch overlapping product sets.
  perform product.id
  from public.products as product
  join jsonb_to_recordset(p_updates) as update_row(product_id bigint)
    on product.id = update_row.product_id
  order by product.id
  for update of product;
  get diagnostics locked_count = row_count;

  if locked_count <> requested_count then
    raise exception 'Uno o mas productos del lote ya no existen';
  end if;

  if exists (
    select 1
    from public.products as product
    join jsonb_to_recordset(p_updates) as update_row(
      product_id bigint,
      expected_updated_at timestamptz
    ) on product.id = update_row.product_id
    where update_row.expected_updated_at is not null
      and product.updated_at is distinct from update_row.expected_updated_at
  ) then
    raise exception 'El inventario cambio en otra terminal. Recarga y volve a intentar.'
      using errcode = 'P0001';
  end if;

  with input_rows as (
    select *
    from jsonb_to_recordset(p_updates) as update_row(
      product_id bigint,
      expected_updated_at timestamptz,
      purchase_price numeric,
      sale_price numeric,
      apply_purchase_price boolean,
      apply_sale_price boolean,
      supplier_links jsonb
    )
  ),
  updated as (
    update public.products as product
    set
      "purchasePrice" = case
        when normalized_action in ('approve', 'undo')
          and coalesce(input_rows.apply_purchase_price, false)
          then input_rows.purchase_price
        else product."purchasePrice"
      end,
      price = case
        when normalized_action = 'approve'
          and coalesce(input_rows.apply_sale_price, false)
          then input_rows.sale_price
        else product.price
      end,
      supplier_links = input_rows.supplier_links
    from input_rows
    where product.id = input_rows.product_id
    returning product.*
  )
  select
    count(*)::integer,
    coalesce(jsonb_agg(to_jsonb(updated) order by updated.id), '[]'::jsonb)
  into updated_count, updated_products
  from updated;

  if updated_count <> requested_count then
    raise exception 'No se pudo completar el lote de costos';
  end if;

  return jsonb_build_object(
    'action', normalized_action,
    'count', updated_count,
    'products', updated_products
  );
end;
$function$;

revoke all on function public.apply_supplier_product_updates_batch(text, jsonb)
from public, anon, authenticated;
grant execute on function public.apply_supplier_product_updates_batch(text, jsonb)
to anon, authenticated;

notify pgrst, 'reload schema';

commit;
