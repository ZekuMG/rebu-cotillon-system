-- Las sugerencias de enlace de Casa Alberto vivian SOLO en memoria de React
-- (`useState([])` en BulkEditorView). Una corrida larga de deteccion podia
-- encontrar cientos de coincidencias por nombre y perderlas enteras al cerrar
-- la app: es exactamente lo que paso la noche del 4-sep.
--
-- Solo las coincidencias por codigo de barras EXACTO se guardaban solas en
-- `products`; las que necesitan revision humana (por nombre o por codigo
-- recortado) eran las unicas que no se persistian.
--
-- 🪤 POR QUE UNA TABLA APARTE Y NO `products.supplier_links`:
-- `products` esta en la publicacion `supabase_realtime`. Escribir ahi ~1.170
-- sugerencias de madrugada mandaria 1.170 mensajes con la fila completa a TODAS
-- las PCs conectadas -- el mismo patron de la tormenta de costos -- y ademas
-- pisaria lo que alguien tenga editando en el Editor Masivo. Esta tabla queda
-- FUERA de realtime a proposito: la deteccion escribe en silencio.

create table if not exists public.supplier_link_suggestions (
  product_id        bigint      not null references public.products(id) on delete cascade,
  casa_alberto_id   text        not null,
  matched_by        text        not null default 'title_search',
  status            text        not null default 'pending',
  payload           jsonb       not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint supplier_link_suggestions_pkey primary key (product_id, casa_alberto_id),
  constraint supplier_link_suggestions_status_check
    check (status in ('pending', 'dismissed'))
);

comment on table public.supplier_link_suggestions is
  'Enlaces que Casa Alberto propuso y esperan revision humana. Fuera de realtime a proposito.';
comment on column public.supplier_link_suggestions.status is
  'pending = esperando tu OK. dismissed = descartada, no volver a proponerla.';

-- Para listar rapido lo pendiente y para limpiar lo viejo.
create index if not exists supplier_link_suggestions_status_idx
  on public.supplier_link_suggestions (status, updated_at desc);

create or replace function public.touch_supplier_link_suggestion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_supplier_link_suggestions_touch on public.supplier_link_suggestions;
create trigger trg_supplier_link_suggestions_touch
  before update on public.supplier_link_suggestions
  for each row execute function public.touch_supplier_link_suggestion();

alter table public.supplier_link_suggestions enable row level security;

-- Mismo criterio que `products`: la app de escritorio trabaja como `anon`.
drop policy if exists supplier_link_suggestions_anon on public.supplier_link_suggestions;
create policy supplier_link_suggestions_anon
  on public.supplier_link_suggestions for all to anon
  using (true) with check (true);

drop policy if exists supplier_link_suggestions_authenticated on public.supplier_link_suggestions;
create policy supplier_link_suggestions_authenticated
  on public.supplier_link_suggestions for all to authenticated
  using ((select private.web_catalog_current_actor_id()) is not null)
  with check ((select private.web_catalog_current_actor_id()) is not null);

grant select, insert, update, delete on public.supplier_link_suggestions to anon, authenticated;

-- ⚠️ A PROPOSITO: NO se agrega a `supabase_realtime`. Ver la nota de arriba.
