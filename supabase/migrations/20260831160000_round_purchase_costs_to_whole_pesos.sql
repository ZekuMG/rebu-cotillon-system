-- Current product purchase costs are finalized in whole pesos, rounded upward.
-- Weight products keep storage precision per gram while their cost per kilo is
-- a whole peso. Historical sale rows and their cost snapshots are untouched.

create schema if not exists private;

create or replace function private.enforce_product_purchase_cost()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new."purchasePrice" is null then
    return new;
  end if;

  new."purchasePrice" := case
    when coalesce(new.product_type, 'quantity') = 'weight'
      then greatest(0, ceil(new."purchasePrice" * 1000) / 1000)
    else greatest(0, ceil(new."purchasePrice"))
  end;
  return new;
end;
$$;

revoke all on function private.enforce_product_purchase_cost() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.products') is not null then
    execute $sql$
      update public.products
      set "purchasePrice" = case
        when coalesce(product_type, 'quantity') = 'weight'
          then greatest(0, ceil("purchasePrice" * 1000) / 1000)
        else greatest(0, ceil("purchasePrice"))
      end
      where "purchasePrice" is not null
        and "purchasePrice" <> case
          when coalesce(product_type, 'quantity') = 'weight'
            then greatest(0, ceil("purchasePrice" * 1000) / 1000)
          else greatest(0, ceil("purchasePrice"))
        end
    $sql$;

    execute 'drop trigger if exists trg_products_purchase_cost on public.products';
    execute $sql$
      create trigger trg_products_purchase_cost
      before insert or update of "purchasePrice", product_type on public.products
      for each row execute function private.enforce_product_purchase_cost()
    $sql$;
  end if;
end;
$$;
