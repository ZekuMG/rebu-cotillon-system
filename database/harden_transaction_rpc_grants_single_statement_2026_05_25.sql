-- Same as harden_transaction_rpc_grants_2026_05_25.sql, packaged as one statement for supabase db query.

do $$
begin
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
end;
$$
