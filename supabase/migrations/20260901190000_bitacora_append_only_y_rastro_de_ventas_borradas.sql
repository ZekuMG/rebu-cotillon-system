-- 1-sep-2026 — Blindaje de solo-lectura contra la anon key expuesta.
--
-- Contexto: la anon key viaja en los .exe de las releases PUBLICAS de
-- ZekuMG/rebu-cotillon-system y además quedó en 4 commits del historial del repo
-- (133e02f, f2b6e6e, 767cdbd, d590a84). No se puede rotar ni cerrar el repo sin
-- romper cosas (las 3 PCs se autoactualizan desde ese repo, sin token).
--
-- Tampoco se le puede quitar a `anon` el DELETE sobre `sales`: la app todavía
-- borra ventas directo en App.jsx:15242/15244 (reversión de una venta fallida)
-- y 16052 (editor de transacciones).
--
-- Lo que SÍ se puede hacer hoy sin tocar una línea de código:
--   1) que la bitácora no se pueda borrar (la app nunca borra logs: verificado,
--      solo 17 `select` y 1 `update`);
--   2) que un borrado de venta deje rastro recuperable donde `anon` no llega.

begin;

-- ============ 1. Bitácora append-only ============
-- Antes: anon tenía delete Y truncate sobre 22.593 filas de auditoría.
revoke delete, truncate on public.logs from anon, authenticated, public;

-- ============ 2. Rastro de ventas borradas ============
create schema if not exists private;

create table if not exists private.sales_deleted_audit (
  id           bigserial primary key,
  sale_id      bigint,
  deleted_at   timestamptz not null default now(),
  caller       name        not null default session_user,
  jwt_claims   jsonb,
  client_addr  inet        default inet_client_addr(),
  snapshot     jsonb       not null
);

comment on table private.sales_deleted_audit is
  'Copia de cada venta borrada (cabecera + items). anon no puede leerla ni tocarla.';

create or replace function private.audit_sale_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Nunca bloquear un borrado legítimo de la app: si el registro falla, se ignora.
  begin
    insert into private.sales_deleted_audit (sale_id, jwt_claims, snapshot)
    values (
      old.id,
      nullif(current_setting('request.jwt.claims', true), '')::jsonb,
      jsonb_build_object(
        'sale', to_jsonb(old),
        'items', coalesce(
          (select jsonb_agg(to_jsonb(si)) from public.sale_items si where si.sale_id = old.id),
          '[]'::jsonb)
      )
    );
  exception when others then
    null;
  end;
  return old;
end;
$$;

revoke all on function private.audit_sale_deletion() from public, anon, authenticated;
revoke all on table private.sales_deleted_audit from public, anon, authenticated;

-- BEFORE: así los items todavía existen cuando se toma la foto.
drop trigger if exists trg_sales_deleted_audit on public.sales;
create trigger trg_sales_deleted_audit
before delete on public.sales
for each row execute function private.audit_sale_deletion();

commit;
