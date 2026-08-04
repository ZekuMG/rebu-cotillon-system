-- Read-only verification for the tables consumed by Rebu Realtime.
-- Run in the Supabase SQL editor. Every row should report published = true.

with expected_tables(table_name) as (
  values
    ('register_state'),
    ('cash_closures'),
    ('sales'),
    ('expenses'),
    ('logs'),
    ('app_users'),
    ('products'),
    ('clients'),
    ('categories'),
    ('offers'),
    ('rewards'),
    ('agenda_contacts')
)
select
  expected.table_name,
  exists (
    select 1
    from pg_publication_tables as publication_table
    where publication_table.pubname = 'supabase_realtime'
      and publication_table.schemaname = 'public'
      and publication_table.tablename = expected.table_name
  ) as published
from expected_tables as expected
order by expected.table_name;
