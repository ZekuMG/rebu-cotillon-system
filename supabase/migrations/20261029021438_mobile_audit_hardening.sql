begin;

-- A login directory must never be an alternate route to changing app_users.
-- Keep the existing SELECT contract used by both desktop and mobile login.
revoke insert, update, delete, truncate, references, trigger on public.app_users_public from public, anon, authenticated;
revoke insert(id,display_name,role,avatar,name_color,theme,metrics_view_mode,is_active),
  update(id,display_name,role,avatar,name_color,theme,metrics_view_mode,is_active),
  references(id,display_name,role,avatar,name_color,theme,metrics_view_mode,is_active)
  on public.app_users_public from public, anon, authenticated;
grant select on public.app_users_public to anon, authenticated;

-- The original positive-stock branch incorrectly labelled downward recounts
-- as restocks. Restrict it to receipts, while keeping depletion metadata.
do $migration$
declare definition text;
begin
  select pg_get_functiondef('private.rebu_mobile_save_stock(uuid,bigint,text,bigint,bigint,text)'::regprocedure) into definition;
  if position('if next_stock > 0 then' in definition) = 0 then
    raise exception 'Unexpected mobile stock function; review migration before applying.';
  end if;
  definition := replace(definition,
    'lifecycle := coalesce(product.supplier_links->''stock_lifecycle'', ''{}''::jsonb);',
    'lifecycle := case when jsonb_typeof(product.supplier_links->''stock_lifecycle'') = ''object'' then product.supplier_links->''stock_lifecycle'' else ''{}''::jsonb end;');
  definition := replace(definition,
    'if next_stock > 0 then
    lifecycle := (lifecycle - ''outOfStockSince'') || jsonb_build_object(''lastRestockedAt'', now());',
    'if next_stock > product.stock then
    lifecycle := (lifecycle - ''outOfStockSince'') || jsonb_build_object(''lastRestockedAt'', now());
  elsif next_stock > 0 then
    lifecycle := lifecycle - ''outOfStockSince'';');
  execute definition;
end;
$migration$;

-- A receipt may have committed before the client lost its connection. This
-- endpoint resolves its outcome even when inventory.edit has since been revoked.
create function private.rebu_mobile_stock_status(p_operation_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor jsonb; operation private.rebu_mobile_stock_operations;
begin
  if (select auth.uid()) is null then raise exception 'Ingresá con tu usuario de Rebu.' using errcode = '42501'; end if;
  actor := private.current_rebu_transaction_actor();
  if p_operation_id is null then raise exception 'Movimiento inválido.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  select * into operation from private.rebu_mobile_stock_operations where operation_id = p_operation_id and actor_id = (actor->>'id')::uuid;
  if not found then return jsonb_build_object('status', 'not_found'); end if;
  return jsonb_build_object('status', 'confirmed', 'result', operation.result || jsonb_build_object('replayed', true));
end;
$$;
create function public.rebu_mobile_stock_status(p_operation_id uuid)
returns jsonb language sql security invoker set search_path = ''
as $$ select private.rebu_mobile_stock_status(p_operation_id); $$;
revoke all on function private.rebu_mobile_stock_status(uuid), public.rebu_mobile_stock_status(uuid) from public, anon, authenticated;
grant execute on function private.rebu_mobile_stock_status(uuid), public.rebu_mobile_stock_status(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
