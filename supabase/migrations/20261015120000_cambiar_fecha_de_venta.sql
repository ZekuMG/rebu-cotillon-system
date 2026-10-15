-- Cambiar la fecha y hora de una venta ya cargada.
--
-- Para que sirve: cuando se cargan hoy ventas de un dia anterior, la caja de
-- hoy las suma (cuenta todo lo que tenga hora posterior a la apertura). Con
-- esto, desde Historial -> Editar venta, se le pone la fecha real.
--
-- Por que una funcion aparte: register_sale_transaction fija created_at con
-- now() a proposito ("la fecha la decide la base") y edit_sale_transaction no
-- deja tocar created_at. Esta es la unica puerta para cambiarla, y pide:
--   * una sesion de un operador activo (sin sesion no se sabe quien fue);
--   * el permiso 'register.manage' (dueño y quienes abren/cierran la caja);
--   * una fecha que no sea futura. Para atras no hay limite (pedido de Mikkel).
-- Los cierres de caja ya guardados NO se recalculan: son una foto del dia.
--
-- Para volver atras:
--   drop function if exists public.change_sale_date(text, timestamptz);

begin;

create or replace function public.change_sale_date(
  p_sale_id text,
  p_created_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  actor jsonb := private.current_rebu_transaction_actor();
  previous_created_at timestamptz;
begin
  if actor is null then
    raise exception 'Para cambiar la fecha de una venta hay que entrar con sesión.'
      using errcode = '42501';
  end if;

  perform private.require_rebu_permission(actor, 'register.manage');

  if p_created_at is null then
    raise exception 'Falta la nueva fecha de la venta.';
  end if;

  -- Un margen chico por si el reloj de la PC adelanta unos minutos.
  if p_created_at > now() + interval '5 minutes' then
    raise exception 'La fecha de la venta no puede ser futura.';
  end if;

  select sale.created_at
  into previous_created_at
  from public.sales as sale
  where sale.id::text = p_sale_id
  for update;

  if not found then
    raise exception 'Venta inexistente';
  end if;

  update public.sales
  set created_at = p_created_at
  where id::text = p_sale_id;

  return jsonb_build_object(
    'id', p_sale_id,
    'created_at', p_created_at,
    'previous_created_at', previous_created_at
  );
end;
$function$;

revoke all on function public.change_sale_date(text, timestamptz) from public, anon;
grant execute on function public.change_sale_date(text, timestamptz) to authenticated, service_role;

commit;
