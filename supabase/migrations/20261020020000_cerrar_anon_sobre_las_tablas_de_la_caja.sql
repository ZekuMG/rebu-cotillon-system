-- Corte de acceso directo a caja. Aplicar despues de instalar en las PCs la
-- version que exige sesion Auth y RPC transaccionales (npm run audit:pcs).
-- Esta migracion estaba pendiente; se reemplazo su politica anterior de
-- "cualquier operador activo puede hacer todo" por permisos por operacion.
begin;

create index if not exists app_users_auth_active_idx
  on public.app_users(auth_user_id) where is_active is true;

-- Los cambios pendientes se muestran en la administracion, pero las reglas
-- de DB siguen usando los permisos vigentes hasta el siguiente ingreso.
alter table public.app_users
  add column if not exists active_permissions_override jsonb;
update public.app_users
  set active_permissions_override = coalesce(permissions_override, '{}'::jsonb)
  where active_permissions_override is null;

create or replace function public.update_app_user_permissions(
  p_actor_id uuid, p_target_id uuid,
  p_permissions_override jsonb, p_apply_now boolean
)
returns table (
  id uuid, display_name text, role text, avatar text, name_color text,
  theme text, metrics_view_mode text, is_active boolean
)
language plpgsql security definer set search_path = ''
as $$
declare
  actor_user public.app_users;
  target_user public.app_users;
  next_permissions_version integer;
begin
  perform private.assert_rebu_actor(p_actor_id);
  select * into actor_user from public.app_users u where u.id = p_actor_id;
  select * into target_user from public.app_users u where u.id = p_target_id for update;
  if actor_user.id is null or target_user.id is null then
    raise exception 'Usuario invalido' using errcode = '22023';
  end if;
  if target_user.role = 'system' then
    raise exception 'No se pueden editar permisos del usuario Sistema' using errcode = '42501';
  end if;
  if actor_user.role = 'system' then
    if target_user.role not in ('owner', 'seller') then
      raise exception 'Rol objetivo invalido' using errcode = '42501';
    end if;
  elsif actor_user.role = 'owner' then
    if target_user.role <> 'seller' then
      raise exception 'Dueño solo puede editar permisos de Usuarios de Caja' using errcode = '42501';
    end if;
  else
    raise exception 'No autorizado para editar permisos' using errcode = '42501';
  end if;
  perform private.require_rebu_permission(
    private.current_rebu_transaction_actor(),
    case when target_user.role = 'seller'
      then 'userManagement.permissions.editSeller'
      else 'userManagement.permissions.editOwner' end
  );

  next_permissions_version := greatest(coalesce(target_user.permissions_version, 1) + 1, 1);
  update public.app_users u set
    permissions_override = coalesce(p_permissions_override, '{}'::jsonb),
    active_permissions_override = case
      when coalesce(p_apply_now, false)
        then coalesce(p_permissions_override, '{}'::jsonb)
      else coalesce(target_user.active_permissions_override,
                    target_user.permissions_override, '{}'::jsonb)
    end,
    permissions_version = next_permissions_version,
    force_reauth_permissions_version = case
      when coalesce(p_apply_now, false) then next_permissions_version
      else target_user.force_reauth_permissions_version
    end
  where u.id = p_target_id;

  return query select v.id, v.display_name::text, v.role, v.avatar,
    v.name_color, v.theme, v.metrics_view_mode, v.is_active
    from public.app_users_public v where v.id = p_target_id;
end;
$$;

-- El puente anonimo valida la clave; no adelanta los permisos si Auth falla.
create or replace function public.verify_app_user_login_auth_bridge(
  p_user_id uuid, p_password text
)
returns table (
  id uuid, display_name text, role text, avatar text, name_color text,
  theme text, metrics_view_mode text, is_active boolean,
  permissions_override jsonb, permissions_version integer,
  force_reauth_permissions_version integer, created_at timestamptz,
  updated_at timestamptz, created_by uuid, auth_user_id uuid, auth_email text
)
language plpgsql security definer set search_path = ''
as $$
declare matched_user public.app_users;
begin
  select * into matched_user from public.app_users u
    where u.id = p_user_id and u.is_active is true limit 1;
  if matched_user.id is null then return; end if;
  if matched_user.password_hash = extensions.crypt(
    coalesce(p_password, ''), matched_user.password_hash
  ) then
    return query select u.id, u.display_name::text, u.role, u.avatar,
      u.name_color, u.theme, u.metrics_view_mode, u.is_active,
      u.permissions_override, u.permissions_version,
      u.force_reauth_permissions_version, u.created_at, u.updated_at,
      u.created_by, u.auth_user_id, u.auth_email::text
      from public.app_users u where u.id = matched_user.id;
  end if;
end;
$$;

-- Se llama solo despues de abrir y cotejar la sesion Supabase Auth.
create or replace function public.activate_app_user_permissions_after_login()
returns boolean language plpgsql security definer set search_path = ''
as $$
declare actor_id uuid;
begin
  select u.id into actor_id from public.app_users u
    where u.auth_user_id = (select auth.uid()) and u.is_active is true
    limit 1;
  if actor_id is null then
    raise exception 'La sesion no corresponde a un usuario activo de Rebu'
      using errcode = '42501';
  end if;
  update public.app_users u
    set active_permissions_override = coalesce(u.permissions_override, '{}'::jsonb)
    where u.id = actor_id
      and u.active_permissions_override is distinct from u.permissions_override;
  return true;
end;
$$;
revoke all on function public.activate_app_user_permissions_after_login()
  from public, anon;
grant execute on function public.activate_app_user_permissions_after_login()
  to authenticated;

-- Otros helpers privados que leen el perfil tambien deben usar el estado
-- vigente. Se conservan sus cuerpos y solo se reemplaza esa expresion.
do $$
declare f record; original_definition text; updated_definition text;
begin
  for f in select p.oid from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private' and p.prosecdef
  loop
    original_definition := pg_get_functiondef(f.oid);
    updated_definition := replace(replace(
      original_definition,
      'coalesce(app_user.permissions_override, ''{}''::jsonb)',
      'coalesce(app_user.active_permissions_override, app_user.permissions_override, ''{}''::jsonb)'
    ),
      '(app_user.permissions_override ->> permission_key)',
      '(coalesce(app_user.active_permissions_override, app_user.permissions_override, ''{}''::jsonb) ->> permission_key)'
    );
    if updated_definition <> original_definition then
      execute updated_definition;
    end if;
  end loop;
end;
$$;

-- Espejo del preset de vendedor en src/utils/userPermissions.js. Los cambios
-- de permisos hechos desde la app siempre prevalecen sobre este preset.
create or replace function private.rebu_actor_can(p_actor jsonb, p_permission text)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare
  actor_role text := lower(coalesce(p_actor ->> 'role', ''));
  overrides jsonb := coalesce(p_actor -> 'permissions_override', '{}'::jsonb);
begin
  if overrides ? p_permission then
    return coalesce((overrides ->> p_permission)::boolean, false);
  end if;
  if actor_role in ('system', 'sistema', 'admin', 'owner', 'dueño', 'dueno') then
    return true;
  end if;
  if actor_role = 'seller' then
    return p_permission = any(array[
      'dashboard.view', 'dashboard.filter.day', 'dashboard.filter.week',
      'dashboard.filter.month', 'dashboard.filter.year', 'inventory.view',
      'clients.view', 'clients.create', 'clients.edit', 'clients.delete',
      'agenda.view', 'orders.view', 'orders.createBudget',
      'orders.editBudget', 'orders.deleteBudget', 'orders.createOrder',
      'orders.editOrder', 'orders.cancelOrder', 'orders.deleteOrder',
      'orders.markRetired', 'orders.registerPayment', 'whatsapp.view',
      'whatsapp.reply', 'whatsapp.conversation.archive', 'history.view',
      'pos.view', 'extras.view'
    ]);
  end if;
  return false;
exception when invalid_text_representation then return false;
end;
$$;
revoke all on function private.rebu_actor_can(jsonb, text)
  from public, anon, authenticated;

create or replace function private.rebu_current_has_any(p_permissions text[])
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare actor_user public.app_users; permission_key text;
begin
  if (select auth.uid()) is null then return false; end if;
  select * into actor_user from public.app_users u
    where u.auth_user_id = (select auth.uid()) and u.is_active is true limit 1;
  if actor_user.id is null then return false; end if;
  foreach permission_key in array p_permissions loop
    if private.rebu_actor_can(
      to_jsonb(actor_user) || jsonb_build_object(
        'permissions_override', coalesce(actor_user.active_permissions_override,
          actor_user.permissions_override, '{}'::jsonb)
      ), permission_key
    ) then
      return true;
    end if;
  end loop;
  return false;
end;
$$;
revoke all on function private.rebu_current_has_any(text[]) from public, anon;
grant execute on function private.rebu_current_has_any(text[]) to authenticated;

-- Sin JWT o con un usuario desactivado, las funciones de transaccion fallan.
create or replace function private.current_rebu_transaction_actor()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare actor jsonb;
begin
  select jsonb_build_object(
    'id', u.id, 'role', u.role, 'display_name', u.display_name,
    'permissions_override', coalesce(u.active_permissions_override,
      u.permissions_override, '{}'::jsonb)
  ) into actor
  from public.app_users u
  where u.auth_user_id = (select auth.uid()) and u.is_active is true
  limit 1;
  if actor is null then
    raise exception 'Ingresá de nuevo para operar en la nube.'
      using errcode = '42501';
  end if;
  return actor;
end;
$$;
revoke all on function private.current_rebu_transaction_actor()
  from public, anon, authenticated;

create or replace function private.require_rebu_permission(
  p_actor jsonb, p_permission text
)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_actor is null or not private.rebu_actor_can(p_actor, p_permission) then
    raise exception 'No tenés permiso para esta operación (%)', p_permission
      using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.require_rebu_permission(jsonb, text)
  from public, anon, authenticated;

-- La autorizacion fina de gestion de usuarios se comprueba tambien en DB.
-- El primer corte ya vinculo p_actor_id con auth.uid(); aqui se respetan
-- ademas las excepciones configuradas en la pantalla de permisos.
do $$
declare rule record; proc record; original_definition text; secured_definition text;
begin
  for rule in select * from (values
    ('create_app_user',
      'perform private.require_rebu_permission(private.current_rebu_transaction_actor(), ''userManagement.createUsers'');'),
    ('list_app_users_private',
      'perform private.require_rebu_permission(private.current_rebu_transaction_actor(), ''userManagement.view'');'),
    ('set_app_user_active',
      'perform private.require_rebu_permission(private.current_rebu_transaction_actor(), ''userManagement.toggleActive'');'),
    ('update_app_user_profile',
      'if p_actor_id <> p_target_id then perform private.require_rebu_permission(private.current_rebu_transaction_actor(), ''userManagement.editProfiles''); end if;'),
    ('update_app_user_password',
      'if p_actor_id <> p_target_id then perform private.require_rebu_permission(private.current_rebu_transaction_actor(), ''userManagement.editProfiles''); end if;'),
    ('update_app_user_permissions',
      'perform private.require_rebu_permission(private.current_rebu_transaction_actor(), case when (select u.role from public.app_users u where u.id = p_target_id) = ''seller'' then ''userManagement.permissions.editSeller'' else ''userManagement.permissions.editOwner'' end);')
  ) as required_permission(function_name, check_sql)
  loop
    for proc in select p.oid, p.oid::regprocedure as signature
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = rule.function_name and p.prosecdef
    loop
      original_definition := pg_get_functiondef(proc.oid);
      secured_definition := regexp_replace(
        original_definition, '\mbegin\M',
        E'begin\n  ' || rule.check_sql,
        'i'
      );
      if secured_definition = original_definition then
        raise exception 'No se pudo proteger %', proc.signature;
      end if;
      execute secured_definition;
    end loop;
    if not found then raise exception 'Falta la funcion %', rule.function_name; end if;
  end loop;
end;
$$;

-- El cierre manual requiere register.manage. El automatico tambien puede
-- ejecutarlo una caja vendedora, pero solo si la hora configurada ya paso.
-- La operacion sigue siendo atomica y la identidad del cierre sale del JWT.
create or replace function public.close_register_once(
  p_expected_opened_at timestamptz, p_closure jsonb,
  p_save_report boolean, p_last_updated_by text
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  actor jsonb := private.current_rebu_transaction_actor();
  v_is_open boolean;
  v_opened_at timestamptz;
  v_closing_time text;
  v_report_id bigint;
  v_report_created_at timestamptz;
  v_auto boolean := coalesce(p_closure ->> 'type', '') = 'Automático';
  local_open timestamp;
  local_now timestamp;
  scheduled_local timestamp;
begin
  if not private.rebu_actor_can(actor, 'register.manage') then
    if not v_auto or not coalesce(p_save_report, false)
       or not private.rebu_actor_can(actor, 'pos.view') then
      raise exception 'No tenés permiso para cerrar la caja'
        using errcode = '42501';
    end if;
  end if;

  select state.is_open, state.opened_at, state.closing_time::text
    into v_is_open, v_opened_at, v_closing_time
  from public.register_state state where state.id = 1 for update;
  if not found then
    raise exception 'No existe el estado de la caja' using errcode = 'P0002';
  end if;
  if not coalesce(v_is_open, false) then
    return jsonb_build_object('status', 'already_closed');
  end if;
  if v_opened_at is distinct from p_expected_opened_at then
    return jsonb_build_object('status', 'cycle_changed');
  end if;

  if not private.rebu_actor_can(actor, 'register.manage') then
    if v_opened_at is null or nullif(v_closing_time, '') is null then
      raise exception 'No hay horario de cierre automatico configurado'
        using errcode = '42501';
    end if;
    local_open := v_opened_at at time zone 'America/Argentina/Buenos_Aires';
    local_now := clock_timestamp() at time zone 'America/Argentina/Buenos_Aires';
    scheduled_local := local_open::date + v_closing_time::time;
    if scheduled_local <= local_open then
      scheduled_local := scheduled_local + interval '1 day';
    end if;
    if local_now < scheduled_local then
      raise exception 'Aun no llego el horario de cierre automatico'
        using errcode = '42501';
    end if;
  end if;

  if p_save_report then
    if jsonb_typeof(p_closure) is distinct from 'object' then
      raise exception 'Faltan los datos del informe de caja' using errcode = '22023';
    end if;
    insert into public.cash_closures (
      date, open_time, close_time, user_id, user_role, user_name, type,
      opening_balance, total_sales, final_balance, total_cost,
      total_expenses, net_profit, sales_count, average_ticket,
      payment_methods_summary, items_sold_list, new_clients_list,
      expenses_snapshot, transactions_snapshot
    ) values (
      p_closure ->> 'date', p_closure ->> 'open_time', p_closure ->> 'close_time',
      actor ->> 'id', actor ->> 'role', actor ->> 'display_name',
      case when v_auto then 'Automático' else 'Manual' end,
      (p_closure ->> 'opening_balance')::numeric,
      (p_closure ->> 'total_sales')::numeric,
      (p_closure ->> 'final_balance')::numeric,
      (p_closure ->> 'total_cost')::numeric,
      (p_closure ->> 'total_expenses')::numeric,
      (p_closure ->> 'net_profit')::numeric,
      (p_closure ->> 'sales_count')::integer,
      (p_closure ->> 'average_ticket')::numeric,
      p_closure -> 'payment_methods_summary',
      p_closure -> 'items_sold_list',
      p_closure -> 'new_clients_list',
      p_closure -> 'expenses_snapshot',
      p_closure -> 'transactions_snapshot'
    ) returning id, created_at into v_report_id, v_report_created_at;
  end if;

  update public.register_state
    set is_open = false, opening_balance = 0, opened_at = null,
      last_updated_by = case when v_auto then 'Sistema (Auto)' else actor ->> 'display_name' end
    where id = 1;
  return jsonb_build_object(
    'status', 'closed', 'report_id', v_report_id,
    'report_created_at', v_report_created_at
  );
end;
$$;
revoke all on function public.close_register_once(timestamptz, jsonb, boolean, text)
  from public, anon;
grant execute on function public.close_register_once(timestamptz, jsonb, boolean, text)
  to authenticated;

-- Las tablas de datos no aceptan anon. Cada accion se relaciona con la llave
-- de permisos de Rebu. Las tablas de ventas, pedidos y puntos son de lectura:
-- las escrituras ocurren exclusivamente en sus RPC atomicas.
do $$
declare
  rule record;
  policy_row record;
  read_expr text;
  write_expr text;
begin
  for rule in select * from (values
    ('agenda_contacts', array['agenda.view'], array['agenda.create'], array['agenda.edit','agenda.delete'], array['agenda.delete']),
    ('budgets', array['orders.view','whatsapp.budget.approve'], array['orders.createBudget'], array['orders.editBudget'], array['orders.deleteBudget']),
    ('cash_closures', array['dashboard.view','reports.view','register.manage'], array['register.manage'], array['register.manage'], array[]::text[]),
    ('categories', array['inventory.view','pos.view','extras.view'], array['extras.categories.manage'], array['extras.categories.manage'], array['extras.categories.manage']),
    ('clients', array['clients.view','pos.view','orders.view'], array['clients.create'], array['clients.edit'], array['clients.delete']),
    ('expenses', array['dashboard.view','reports.view','extras.view'], array['extras.expenses.manage'], array['extras.expenses.manage'], array['extras.expenses.manage']),
    ('logs', array['logs.view'], array['pos.view'], array['logs.editNotes'], array[]::text[]),
    ('member_point_entries', array['clients.view','pos.view'], array[]::text[], array[]::text[], array[]::text[]),
    ('offers', array['pos.view','extras.view'], array['extras.offers.manage'], array['extras.offers.manage'], array['extras.offers.manage']),
    ('orders', array['orders.view','pos.view'], array[]::text[], array[]::text[], array[]::text[]),
    ('register_state', array['pos.view','dashboard.view','reports.view'], array['register.manage'], array['register.manage'], array[]::text[]),
    ('rewards', array['clients.view','pos.view','extras.view'], array['extras.rewards.manage'], array['extras.rewards.manage'], array['extras.rewards.manage']),
    ('sale_items', array['history.view','dashboard.view','pos.view','reports.view','metrics.view'], array[]::text[], array[]::text[], array[]::text[]),
    ('sales', array['history.view','dashboard.view','pos.view','reports.view','metrics.view'], array[]::text[], array[]::text[], array[]::text[])
  ) as permissions(table_name, select_keys, insert_keys, update_keys, delete_keys)
  loop
    execute format('revoke all on table public.%I from anon', rule.table_name);
    execute format('alter table public.%I enable row level security', rule.table_name);
    for policy_row in select policyname from pg_policies
      where schemaname = 'public' and tablename = rule.table_name
    loop
      execute format('drop policy %I on public.%I', policy_row.policyname, rule.table_name);
    end loop;

    if cardinality(rule.select_keys) > 0 then
      read_expr := format('(select private.rebu_current_has_any(%L::text[]))', rule.select_keys);
      if rule.table_name = 'logs' then
        read_expr := read_expr || format(
          ' or ((select private.rebu_current_has_any(%L::text[])) and action = any(%L::text[]))',
          array['history.view'],
          array['Nueva Venta','Venta Realizada','Venta Anulada','Venta Restaurada',
            'Venta Eliminada','Borrado Permanente','Modificacion Pedido',
            'Modificación Pedido','Venta Modificada']
        ) || format(
          ' or ((select private.rebu_current_has_any(%L::text[])) and created_at >= now() - interval ''1 day'')',
          array['dashboard.view']
        );
      end if;
      execute format('create policy rebu_select on public.%I for select to authenticated using (%s)',
        rule.table_name, read_expr);
    end if;
    if cardinality(rule.insert_keys) > 0 then
      write_expr := format('(select private.rebu_current_has_any(%L::text[]))', rule.insert_keys);
      execute format('create policy rebu_insert on public.%I for insert to authenticated with check (%s)',
        rule.table_name, write_expr);
    end if;
    if cardinality(rule.update_keys) > 0 then
      write_expr := format('(select private.rebu_current_has_any(%L::text[]))', rule.update_keys);
      execute format('create policy rebu_update on public.%I for update to authenticated using (%s) with check (%s)',
        rule.table_name, write_expr, write_expr);
    end if;
    if cardinality(rule.delete_keys) > 0 then
      write_expr := format('(select private.rebu_current_has_any(%L::text[]))', rule.delete_keys);
      execute format('create policy rebu_delete on public.%I for delete to authenticated using (%s)',
        rule.table_name, write_expr);
    end if;
  end loop;
end;
$$;

-- Un usuario activo puede anotar sus operaciones, pero no leer toda la
-- bitacora ni falsificar nombre/rol del actor en los registros nuevos.
drop policy if exists rebu_insert on public.logs;
create policy rebu_insert on public.logs for insert to authenticated
  with check ((select private.web_catalog_current_actor_id()) is not null);

create or replace function private.rebu_stamp_log_actor()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare actor public.app_users;
begin
  if (select auth.role()) = 'service_role' then return new; end if;
  select * into actor from public.app_users u
  where u.auth_user_id = (select auth.uid()) and u.is_active is true limit 1;
  if actor.id is null then
    raise exception 'Operador no autenticado para guardar el registro'
      using errcode = '42501';
  end if;
  new."user" := actor.display_name;
  if jsonb_typeof(new.details) = 'object' then
    new.details := new.details || jsonb_build_object(
      'userId', actor.id, 'userRole', actor.role, 'userName', actor.display_name
    );
  end if;
  return new;
end;
$$;
revoke all on function private.rebu_stamp_log_actor() from public, anon, authenticated;
drop trigger if exists rebu_stamp_log_actor on public.logs;
create trigger rebu_stamp_log_actor before insert on public.logs
  for each row execute function private.rebu_stamp_log_actor();

-- Puntos y ventas nunca se actualizan directamente desde la API.
revoke insert, update, delete on public.sales, public.sale_items,
  public.orders, public.member_point_entries from authenticated;

-- El saldo de puntos lo modifica solo la logica transaccional de la base.
create or replace function private.rebu_protect_client_points()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.points is distinct from old.points
     and current_user not in ('postgres', 'service_role') then
    raise exception 'Los puntos solo pueden cambiar mediante una operacion autorizada'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.rebu_protect_client_points() from public, anon, authenticated;
drop trigger if exists rebu_protect_client_points on public.clients;
create trigger rebu_protect_client_points before update on public.clients
  for each row execute function private.rebu_protect_client_points();

-- Productos: lectura publica de activos; escrituras solo con permisos de
-- inventario/catalogo. Una politica antigua USING true anularia las nuevas.
do $$ declare policy_row record;
begin
  for policy_row in select policyname from pg_policies
    where schemaname = 'public' and tablename = 'products'
  loop
    execute format('drop policy %I on public.products', policy_row.policyname);
  end loop;
end $$;
alter table public.products enable row level security;
revoke all on public.products from anon;
grant select on public.products to anon;
create policy rebu_public_product_read on public.products for select to anon
  using (is_active is true and deleted_at is null);
create policy rebu_product_read on public.products for select to authenticated
  using ((select private.rebu_current_has_any(array['inventory.view','pos.view','catalog.view'])));
create policy rebu_product_insert on public.products for insert to authenticated
  with check ((select private.rebu_current_has_any(array['inventory.create','catalog.edit'])));
create policy rebu_product_update on public.products for update to authenticated
  using ((select private.rebu_current_has_any(array['inventory.edit','catalog.edit','catalog.publish'])))
  with check ((select private.rebu_current_has_any(array['inventory.edit','catalog.edit','catalog.publish'])));
create policy rebu_product_delete on public.products for delete to authenticated
  using ((select private.rebu_current_has_any(array['inventory.delete'])));

revoke all on public.supplier_link_suggestions from anon;
drop policy if exists supplier_link_suggestions_anon on public.supplier_link_suggestions;

-- SECURITY DEFINER ignora RLS: cada RPC sensible debe comprobar permiso.
do $$
declare rule record; proc record; original_definition text; secured_definition text;
begin
  for rule in select * from (values
    ('register_sale_transaction','pos.view'),
    ('edit_sale_transaction','history.editSale'),
    ('void_sale_transaction','history.voidSale'),
    ('apply_product_stock_delta','inventory.edit'),
    ('create_whatsapp_budget_once','whatsapp.budget.approve'),
    ('search_logs','logs.view'),
    ('search_logs_summary','logs.view'),
    ('list_whatsapp_device_access_requests','whatsapp.connection.manage'),
    ('review_whatsapp_device_access','whatsapp.connection.manage'),
    ('request_whatsapp_device_access','whatsapp.view'),
    ('authorize_whatsapp_device_access','whatsapp.view'),
    ('get_my_whatsapp_device_access','whatsapp.view')
  ) as required_permission(function_name, permission_key)
  loop
    for proc in select p.oid, p.oid::regprocedure as signature
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = rule.function_name and p.prosecdef
    loop
      original_definition := pg_get_functiondef(proc.oid);
      secured_definition := regexp_replace(
        original_definition, '\mbegin\M',
        format(E'begin\n  perform private.require_rebu_permission(private.current_rebu_transaction_actor(), %L);', rule.permission_key),
        'i'
      );
      if secured_definition = original_definition then
        raise exception 'No se pudo proteger %', proc.signature;
      end if;
      execute secured_definition;
    end loop;
    if not found then
      raise exception 'Falta la RPC %', rule.function_name;
    end if;
  end loop;
end;
$$;

-- Retirar todo EXECUTE heredado por anon, salvo el puente que valida la clave
-- antes de abrir una sesion. No se reabren funciones *_unchecked_*.
do $$ declare proc record;
begin
  for proc in select p.oid::regprocedure as signature, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
      and has_function_privilege('anon', p.oid, 'execute')
  loop
    if proc.proname = 'verify_app_user_login_auth_bridge' then continue; end if;
    execute format('revoke all on function %s from public, anon', proc.signature);
    if proc.proname not like '%\_unchecked\_%' escape '\'
       and proc.proname not in ('bootstrap_app_users','verify_app_user_login','verify_app_user_login_private') then
      execute format('grant execute on function %s to authenticated', proc.signature);
    end if;
  end loop;
end;
$$;

-- La vinculacion manual historica ya no forma parte del ingreso. Cada alta
-- crea su identidad Auth de manera atomica; no debe poder reasignarse por RPC.
revoke all on function public.link_current_auth_user_to_app_user(uuid, text)
  from public, anon, authenticated;

alter default privileges for role postgres in schema public revoke all on tables from anon;
alter default privileges for role postgres in schema public revoke all on sequences from anon;
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres revoke execute on functions from public;

notify pgrst, 'reload schema';
commit;
