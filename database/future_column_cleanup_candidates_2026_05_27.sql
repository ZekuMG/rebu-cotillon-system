-- Future column cleanup candidates for Rebu Cotillon.
-- DO NOT RUN destructive statements without a fresh backup and a manual review.
--
-- Purpose:
-- - Keep a single place for columns created by mistake, deprecated columns,
--   or columns that may be unused by the app.
-- - First run the read-only diagnostics.
-- - Only uncomment DROP statements after confirming the column is unused
--   and has no valuable data.

-- ---------------------------------------------------------------------------
-- Candidate: public.clients.extrainfo
-- Reason:
-- - Created accidentally in lowercase while the intended case-sensitive column
--   is public.clients."extraInfo".
-- - At the time of discovery, extrainfo had 0 non-null rows.
-- ---------------------------------------------------------------------------

-- Read-only diagnostic:
select
  count(*) as total_clients,
  count(*) filter (where extrainfo is not null) as extrainfo_non_null,
  count(*) filter (where "extraInfo" is not null) as extraInfo_non_null
from public.clients;

-- Optional data preservation step if extrainfo ever contains useful data:
-- update public.clients
-- set "extraInfo" = coalesce("extraInfo", extrainfo)
-- where extrainfo is not null;

-- Destructive cleanup, only after backup and confirmation:
-- alter table public.clients
-- drop column if exists extrainfo;
