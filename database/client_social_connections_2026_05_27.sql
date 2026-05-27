-- Adds extensible social connection metadata for clients/socios.
-- Safe to run more than once. No RLS changes.

alter table public.clients
  add column if not exists social_connections jsonb not null default '{}'::jsonb;

create index if not exists clients_social_connections_gin_idx
  on public.clients using gin (social_connections);

create unique index if not exists clients_instagram_handle_unique_idx
  on public.clients ((lower(nullif(social_connections #>> '{instagram,handle}', ''))))
  where nullif(social_connections #>> '{instagram,handle}', '') is not null
    and coalesce(is_active, true);
