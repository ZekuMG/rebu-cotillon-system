with expected_tables(table_name) as (
  values
    ('agenda_contacts'), ('app_users'), ('app_users_public'), ('budgets'), ('orders'),
    ('clients'), ('products'), ('rewards'), ('sales'), ('sale_items'), ('logs'),
    ('expenses'), ('cash_closures'), ('register_state'), ('offers')
),
expected_columns(table_name, column_name) as (
  values
    ('clients','is_active'), ('clients','social_connections'), ('clients','extraInfo'), ('clients','updated_at'),
    ('rewards','is_active'),
    ('products','active_offers'), ('products','updated_at'), ('products','product_type'), ('products','expiration_date'), ('products','image_thumb'), ('products','is_active'),
    ('sales','status'), ('sales','voided_at'), ('sales','payment_breakdown'), ('sales','cash_received'), ('sales','cash_change'), ('sales','user_id'), ('sales','user_role'), ('sales','user_name'), ('sales','points_earned'), ('sales','points_spent'), ('sales','installments'),
    ('sale_items','cost'), ('sale_items','is_custom'), ('sale_items','is_discount'), ('sale_items','is_combo'), ('sale_items','product_type'), ('sale_items','subtotal'), ('sale_items','sale_id'), ('sale_items','product_id'), ('sale_items','product_title'), ('sale_items','quantity'), ('sale_items','price'), ('sale_items','is_reward'),
    ('app_users','permissions_override'), ('app_users','permissions_version'), ('app_users','force_reauth_permissions_version'), ('app_users','metrics_view_mode'), ('app_users','auth_user_id'), ('app_users','auth_email'),
    ('budgets','payment_method'), ('budgets','payment_breakdown'), ('budgets','installments'), ('budgets','is_active'),
    ('orders','payment_method'), ('orders','payment_breakdown'), ('orders','installments'), ('orders','is_active'),
    ('logs','user_name'), ('logs','user_id'), ('logs','user_role'),
    ('expenses','user_id'), ('expenses','user_role'), ('expenses','payment_method'),
    ('cash_closures','user_id'), ('cash_closures','user_role'), ('cash_closures','payment_methods_summary'), ('cash_closures','items_sold_list'), ('cash_closures','new_clients_list'), ('cash_closures','expenses_snapshot'), ('cash_closures','transactions_snapshot')
),
expected_indexes(indexname) as (
  values
    ('agenda_contacts_name_idx'), ('agenda_contacts_type_idx'), ('agenda_contacts_is_active_idx'), ('agenda_contacts_created_at_idx'),
    ('budgets_created_at_idx'), ('budgets_is_active_idx'), ('budgets_member_id_idx'),
    ('orders_budget_id_idx'), ('orders_created_at_idx'), ('orders_is_active_idx'), ('orders_member_id_idx'), ('orders_status_idx'),
    ('clients_is_active_name_idx'), ('clients_social_connections_gin_idx'), ('clients_instagram_handle_unique_idx'),
    ('rewards_is_active_points_idx'),
    ('logs_created_at_id_idx'), ('logs_action_created_at_idx'), ('logs_user_created_at_idx'), ('logs_action_trgm_idx'), ('logs_user_trgm_idx'), ('logs_reason_trgm_idx'),
    ('sales_created_at_idx'), ('sales_client_id_idx'), ('sales_status_idx'), ('sales_user_id_idx'), ('sales_voided_at_idx'),
    ('sale_items_sale_id_idx'), ('sale_items_product_id_idx'),
    ('app_users_role_idx'), ('app_users_is_active_idx'), ('app_users_auth_user_id_key'), ('app_users_auth_email_key')
),
expected_functions(function_name) as (
  values
    ('set_agenda_contacts_updated_at'), ('set_app_users_updated_at'), ('bootstrap_app_users'),
    ('verify_app_user_login'), ('create_app_user'), ('update_app_user_profile'), ('update_app_user_password'), ('set_app_user_active'), ('update_app_user_permissions'),
    ('verify_app_user_login_private'), ('list_app_users_private'),
    ('verify_app_user_login_auth_bridge'), ('get_current_auth_app_user'), ('link_current_auth_user_to_app_user'),
    ('search_logs'), ('apply_product_stock_delta'), ('register_sale_transaction'), ('edit_sale_transaction'), ('void_sale_transaction')
),
tables_check as (
  select e.table_name, (c.relname is not null) as exists
  from expected_tables e
  left join pg_class c on c.relname = e.table_name
  left join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
),
columns_check as (
  select e.table_name, e.column_name, (c.column_name is not null) as exists, c.data_type, c.column_default
  from expected_columns e
  left join information_schema.columns c
    on c.table_schema = 'public' and c.table_name = e.table_name and c.column_name = e.column_name
),
indexes_check as (
  select e.indexname, (i.indexname is not null) as exists, i.tablename, i.indexdef
  from expected_indexes e
  left join pg_indexes i on i.schemaname = 'public' and i.indexname = e.indexname
),
functions_check as (
  select e.function_name, (count(p.oid) > 0) as exists,
         coalesce(jsonb_agg(distinct pg_get_function_identity_arguments(p.oid)) filter (where p.oid is not null), '[]'::jsonb) as signatures
  from expected_functions e
  left join pg_proc p on p.proname = e.function_name
  left join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  group by e.function_name
),
view_columns as (
  select table_name, coalesce(jsonb_agg(column_name order by ordinal_position), '[]'::jsonb) as columns
  from information_schema.columns
  where table_schema = 'public' and table_name = 'app_users_public'
  group by table_name
),
rls as (
  select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('app_users','sales','sale_items','products','clients','logs','rewards','orders','budgets','agenda_contacts')
),
policies as (
  select schemaname, tablename, policyname, roles, cmd
  from pg_policies
  where schemaname = 'public'
    and tablename in ('app_users','sales','sale_items','products','clients','logs','rewards','orders','budgets','agenda_contacts')
),
triggers as (
  select event_object_table as table_name, trigger_name
  from information_schema.triggers
  where trigger_schema = 'public'
    and event_object_table in ('agenda_contacts','app_users')
),
function_grants as (
  select p.proname as function_name, pg_get_function_identity_arguments(p.oid) as signature,
         coalesce(jsonb_agg(distinct r.rolname) filter (where has_function_privilege(r.oid, p.oid, 'EXECUTE')), '[]'::jsonb) as execute_roles
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join pg_roles r
  where n.nspname = 'public'
    and p.proname in ('verify_app_user_login','create_app_user','update_app_user_profile','update_app_user_password','set_app_user_active','update_app_user_permissions','verify_app_user_login_private','list_app_users_private','verify_app_user_login_auth_bridge','apply_product_stock_delta','register_sale_transaction','edit_sale_transaction','void_sale_transaction','search_logs')
    and r.rolname in ('anon','authenticated','public')
  group by p.proname, p.oid
)
select jsonb_pretty(jsonb_build_object(
  'tables', (select jsonb_agg(to_jsonb(t) order by table_name) from tables_check t),
  'columns', (select jsonb_agg(to_jsonb(c) order by table_name, column_name) from columns_check c),
  'indexes', (select jsonb_agg(to_jsonb(i) order by indexname) from indexes_check i),
  'functions', (select jsonb_agg(to_jsonb(f) order by function_name) from functions_check f),
  'app_users_public_columns', (select columns from view_columns limit 1),
  'rls', (select jsonb_agg(to_jsonb(r) order by table_name) from rls r),
  'policies', (select coalesce(jsonb_agg(to_jsonb(p) order by tablename, policyname), '[]'::jsonb) from policies p),
  'triggers', (select coalesce(jsonb_agg(to_jsonb(t) order by table_name, trigger_name), '[]'::jsonb) from triggers t),
  'function_grants', (select coalesce(jsonb_agg(to_jsonb(g) order by function_name, signature), '[]'::jsonb) from function_grants g)
)) as diagnostics;
