-- MUTATING / MANUAL. Apply only after every desktop is updated, Supabase Auth is
-- linked for every operator, and VITE_REBU_ENABLE_AUTH_RPC=1 is deployed.
begin;

revoke insert, update, delete on table public.orders from anon, authenticated;
revoke insert, update, delete on table public.clients from anon, authenticated;
revoke all on table public.member_point_entries from public, anon, authenticated;

grant select on table public.orders to authenticated;
grant select on table public.clients to authenticated;
grant select on table public.member_point_entries to authenticated;

grant insert (
  name, member_number, dni, phone, email, "extraInfo", social_connections,
  points, is_active, created_at
) on table public.clients to authenticated;

grant update (
  name, member_number, dni, phone, email, "extraInfo", social_connections,
  is_active
) on table public.clients to authenticated;

-- Orders are mutated exclusively through save_order_with_points_once.
grant execute on function public.save_order_with_points_once(text, text, uuid, jsonb, bigint, jsonb) to authenticated;
grant execute on function public.register_order_sale_once(text, uuid, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.adjust_member_points_once(text, bigint, bigint, text, text, timestamptz) to authenticated;

commit;
