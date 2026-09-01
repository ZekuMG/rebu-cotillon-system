-- Historial de ventas: contar, sumar y buscar del lado del servidor.
--
-- PROBLEMA MEDIDO (1-sep-2026, contra prod).
-- El encabezado del Historial mostraba "N ventas - $X" sumando en el navegador
-- SOLO las filas que el feed alcanzo a descargar (una ventana de ~100 ventas).
-- Real: 3944 ventas / $33.645.620,37. Mostraba: ~100 ventas / ~$965.454.
-- Ademas la busqueda y los filtros de pago/usuario/categoria corrian tambien
-- sobre esa ventana, asi que buscar un producto viejo devolvia resultados
-- incompletos, y cada cambio de pagina volvia a bajar la ventana entera desde
-- arriba (limit creciente, sin range).
--
-- ESTA MIGRACION no cambia datos ni permisos de tablas. Agrega dos funciones
-- de SOLO LECTURA que le permiten al Historial pedir:
--   1. el total real (cantidad + monto) de las ventas que matchean el filtro;
--   2. los ids de UNA pagina, ya ordenados.
-- Con eso la app baja 50 filas por pagina en vez de la ventana completa.
--
-- PARIDAD CON EL CLIENTE. `rebu_fold_text` replica exactamente lo que hace
-- HistoryView en JavaScript:
--     String(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
-- Se usa `normalize(..., NFD)` (Postgres 13+) en vez de la extension
-- `unaccent`, que NO esta instalada en este proyecto.
--
-- LO QUE NO HACE. La categoria y el vendedor no se resuelven aca: la app ya
-- tiene el inventario y el catalogo de usuarios en memoria, asi que manda
-- `p_product_ids` / `p_user_ids` ya resueltos. Evita duplicar en SQL la logica
-- de `matchesHistoryCategoryFilter` y `matchesUnifiedUserFilter`, que es donde
-- se meterian las diferencias entre lo que muestra la lista y lo que cuenta el
-- encabezado.

begin;

-- ---------------------------------------------------------------------------
-- 1. Plegado de acentos, identico al del navegador
-- ---------------------------------------------------------------------------

create or replace function public.rebu_fold_text(p_value text)
returns text
language sql
immutable
parallel safe
as $fold$
  select btrim(regexp_replace(normalize(lower(coalesce(p_value, '')), NFD), '[̀-ͯ]', '', 'g'));
$fold$;

comment on function public.rebu_fold_text(text) is
  'Minusculas sin acentos. Espejo de normalize(NFD)+strip de HistoryView.jsx.';

-- ---------------------------------------------------------------------------
-- 2. Consulta del historial: totales + una pagina de ids
-- ---------------------------------------------------------------------------
--
-- Devuelve jsonb:
--   {
--     "total_count":   ventas que matchean, sin anuladas ni borradas (encabezado)
--     "total_amount":  suma de esas ventas                            (encabezado)
--     "match_count":   ventas que matchean, incluidas anuladas        (paginador)
--     "sale_ids":      [ids de la pagina pedida, ya ordenados]
--   }
--
-- p_date_start / p_date_end son fechas SIN hora (YYYY-MM-DD) y se interpretan
-- en hora de Buenos Aires, igual que los filtros de la pantalla. El feed viejo
-- las mandaba como `${fecha}T00:00:00.000Z` (UTC), lo que corria el corte 3 hs
-- y dejaba afuera ventas del dia elegido.

create or replace function public.sales_history_page(
  p_tokens        text[]      default null,
  p_date_start    date        default null,
  p_date_end      date        default null,
  p_payment       text        default null,
  p_user_ids      text[]      default null,
  p_user_names    text[]      default null,
  p_user_legacy   boolean     default false,
  p_product_ids   bigint[]    default null,
  p_only_test     boolean     default false,
  p_ascending     boolean     default false,
  p_limit         integer     default 50,
  p_offset        integer     default 0
)
returns jsonb
language sql
stable
parallel safe
as $fn$
with args as (
  select
    nullif(p_tokens, '{}')                             as tokens,
    replace(public.rebu_fold_text(p_payment), ' ', '') as payment_key,
    nullif(p_user_ids, '{}')                           as user_ids,
    (select array_agg(public.rebu_fold_text(n))
       from unnest(coalesce(p_user_names, '{}'::text[])) n)  as user_names,
    nullif(p_product_ids, '{}')                        as product_ids,
    case when p_date_start is null then null
         else (p_date_start::timestamp) at time zone 'America/Argentina/Buenos_Aires'
    end                                                as ts_start,
    case when p_date_end is null then null
         else ((p_date_end + 1)::timestamp) at time zone 'America/Argentina/Buenos_Aires'
    end                                                as ts_end,
    greatest(coalesce(p_limit, 50), 0)                 as lim,
    greatest(coalesce(p_offset, 0), 0)                 as off
),
matched as (
  select s.id, s.created_at, s.total, s.status
  from public.sales s, args a
  where (a.ts_start is null or s.created_at >= a.ts_start)
    and (a.ts_end   is null or s.created_at <  a.ts_end)
    -- Metodo de pago: mira el desglose si existe; si no, el texto suelto
    -- ("Efectivo + Mercado Pago", "MercadoPago", "Debito"...).
    and (
      a.payment_key is null or a.payment_key = ''
      or (
        jsonb_typeof(s.payment_breakdown) = 'array'
        and exists (
          select 1 from jsonb_array_elements(s.payment_breakdown) e
          where replace(public.rebu_fold_text(e->>'method'), ' ', '') = a.payment_key
        )
      )
      or (
        jsonb_typeof(s.payment_breakdown) is distinct from 'array'
        and replace(public.rebu_fold_text(s.payment_method), ' ', '') like '%' || a.payment_key || '%'
      )
    )
    -- Vendedor. `p_user_legacy` es el grupo de ventas viejas, sin user_id.
    and (
      (a.user_ids is null and a.user_names is null and not p_user_legacy)
      or (p_user_legacy and s.user_id is null)
      or (a.user_ids is not null and s.user_id = any (a.user_ids))
      or (a.user_names is not null and public.rebu_fold_text(s.user_name) = any (a.user_names))
    )
    -- Categoria: la app manda los ids de producto de esa categoria.
    and (
      a.product_ids is null
      or exists (
        select 1 from public.sale_items i
        where i.sale_id = s.id and i.product_id = any (a.product_ids)
      )
    )
    -- Busqueda libre y modo prueba comparten el mismo texto plano.
    and (
      (a.tokens is null and not p_only_test)
      or (
        select case
                 when p_only_test then position('test' in h.hay) > 0
                 else not exists (
                   select 1 from unnest(a.tokens) t where position(t in h.hay) = 0
                 )
               end
        from (
          select public.rebu_fold_text(concat_ws(' ',
            s.id::text,
            s.user_name,
            s.payment_method,
            s.total::text,
            to_char(s.created_at at time zone 'America/Argentina/Buenos_Aires', 'DD/MM/YY'),
            (select c.name || ' ' || coalesce(c.member_number::text, '')
               from public.clients c where c.id = s.client_id),
            (select string_agg(i.product_title, ' ')
               from public.sale_items i where i.sale_id = s.id)
          )) as hay
        ) h
      )
    )
    -- Fuera del modo prueba, las ventas de prueba no se muestran (igual que
    -- isTestRecord en el navegador).
    --
    -- Este filtro corre en TODAS las consultas, asi que se escribe barato a
    -- proposito: `ilike` en vez de rebu_fold_text (la palabra "test" no lleva
    -- acentos, y `normalize(NFD)` sobre cada fila costaba ~60 ms por consulta)
    -- y `exists` en vez de `string_agg`, para cortar en la primera coincidencia
    -- en lugar de agregar todos los items de la venta.
    and (
      p_only_test
      or not (
        s.user_name ilike '%test%'
        or exists (
          select 1 from public.clients c
          where c.id = s.client_id and c.name ilike '%test%'
        )
        or exists (
          select 1 from public.sale_items i
          where i.sale_id = s.id and i.product_title ilike '%test%'
        )
      )
    )
),
ordered as (
  select
    m.id,
    row_number() over (
      order by
        case when p_ascending then m.created_at end asc,
        case when p_ascending then m.id end asc,
        case when not p_ascending then m.created_at end desc,
        case when not p_ascending then m.id end desc
    ) as rn
  from matched m
)
select jsonb_build_object(
  'total_count',
    (select count(*) from matched
      where status is distinct from 'voided' and status is distinct from 'deleted'),
  'total_amount',
    (select coalesce(sum(total), 0) from matched
      where status is distinct from 'voided' and status is distinct from 'deleted'),
  'match_count',
    (select count(*) from matched),
  'sale_ids',
    coalesce((
      select jsonb_agg(o.id order by o.rn)
      from ordered o, args a
      where o.rn > a.off and o.rn <= a.off + a.lim
    ), '[]'::jsonb)
);
$fn$;

comment on function public.sales_history_page(text[], date, date, text, text[], text[], boolean, bigint[], boolean, boolean, integer, integer) is
  'Historial de ventas: totales reales del filtro + los ids de una pagina. Solo lectura.';

-- ---------------------------------------------------------------------------
-- 3. Las ventas que solo viven en los logs
-- ---------------------------------------------------------------------------
--
-- El Historial no se arma solo con la tabla `sales`: tambien reconstruye ventas
-- a partir de los logs, para que una venta borrada siga figurando. Medido el
-- 1-sep-2026: de 3.966 logs de venta, SOLO 15 no tienen fila en `sales`
-- (7 con log de borrado, 8 que desaparecieron sin dejarlo), todas de marzo y
-- abril de 2026.
--
-- Antes, para encontrar esas 15, la app se bajaba los 3.964 logs "Venta
-- Realizada" completos: 5,8 MB de `details`. Esta funcion devuelve los ids de
-- esos logs y nada mas, asi la app pide 15 filas en vez de 3.964.

create or replace function public.sales_history_orphan_log_ids()
returns bigint[]
language sql
stable
parallel safe
as $orphans$
  -- El id del log se convierte a bigint ANTES de comparar: con `s.id::text` la
  -- comparacion no puede usar la clave primaria de `sales` y la consulta pasaba
  -- de ~30 ms a 1,1 s (medido). Un id que no sea numerico queda como NULL, o
  -- sea "sin fila en sales", que es justo lo que se quiere reconstruir.
  select coalesce(array_agg(l.id order by l.created_at), '{}'::bigint[])
  from public.logs l
  where l.action in ('Venta Realizada', 'Nueva Venta')
    and l.details is not null
    and not exists (
      select 1 from public.sales s
      where s.id = nullif(
        regexp_replace(
          coalesce(l.details->>'transactionId', l.details->>'id', l.id::text),
          '\D', '', 'g'
        ), ''
      )::bigint
    );
$orphans$;

comment on function public.sales_history_orphan_log_ids() is
  'Ids de logs de venta que ya no tienen fila en sales. El Historial las reconstruye desde ahi.';

-- ---------------------------------------------------------------------------
-- 4. Permisos
-- ---------------------------------------------------------------------------
-- La app trabaja SIEMPRE como `anon` (VITE_REBU_WHATSAPP_AUTH_SESSION=0, ver
-- 20260826230000_caja_sin_jwt.sql). Se otorga a los dos roles a proposito: si
-- algun dia se vuelve a prender la sesion, la funcion sigue andando.
-- Son funciones de SOLO LECTURA sobre tablas que `anon` ya puede leer
-- (20260827020000_anon_sin_limitantes.sql): no abren nada nuevo.

grant execute on function public.rebu_fold_text(text) to anon, authenticated;
grant execute on function public.sales_history_page(text[], date, date, text, text[], text[], boolean, bigint[], boolean, boolean, integer, integer) to anon, authenticated;
grant execute on function public.sales_history_orphan_log_ids() to anon, authenticated;

commit;
