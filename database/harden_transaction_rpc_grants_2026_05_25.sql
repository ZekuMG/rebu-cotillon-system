-- Close direct anon access to transactional SECURITY DEFINER RPCs.
-- The desktop app can still fall back to legacy client-side writes until it uses Supabase Auth/trusted backend.
-- Safe to run more than once.

revoke all on function public.apply_product_stock_delta(text, numeric) from public;
revoke execute on function public.apply_product_stock_delta(text, numeric) from anon;
grant execute on function public.apply_product_stock_delta(text, numeric) to authenticated;

revoke all on function public.register_sale_transaction(jsonb, jsonb, jsonb, jsonb) from public;
revoke execute on function public.register_sale_transaction(jsonb, jsonb, jsonb, jsonb) from anon;
grant execute on function public.register_sale_transaction(jsonb, jsonb, jsonb, jsonb) to authenticated;

revoke all on function public.edit_sale_transaction(text, jsonb, jsonb, jsonb, jsonb) from public;
revoke execute on function public.edit_sale_transaction(text, jsonb, jsonb, jsonb, jsonb) from anon;
grant execute on function public.edit_sale_transaction(text, jsonb, jsonb, jsonb, jsonb) to authenticated;

revoke all on function public.void_sale_transaction(text, timestamptz, jsonb, jsonb) from public;
revoke execute on function public.void_sale_transaction(text, timestamptz, jsonb, jsonb) from anon;
grant execute on function public.void_sale_transaction(text, timestamptz, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
