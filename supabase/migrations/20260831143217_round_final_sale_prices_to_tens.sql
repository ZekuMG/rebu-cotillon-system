-- Commercial sale prices are rounded upward to the next multiple of $10.
-- This replaces the prior whole-peso guard without changing costs, totals or
-- historical sale records.

create or replace function private.enforce_product_final_sale_price()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.price is null then
    return new;
  end if;

  new.price := case
    when coalesce(new.product_type, 'quantity') = 'weight'
      then greatest(0, (ceil((new.price * 1000) / 10) * 10) / 1000)
    else greatest(0, ceil(new.price / 10) * 10)
  end;
  return new;
end;
$$;

create or replace function private.enforce_offer_final_sale_price()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.offer_price is not null then
    new.offer_price := greatest(0, ceil(new.offer_price / 10) * 10);
  end if;
  return new;
end;
$$;

create or replace function private.enforce_web_catalog_final_sale_price()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.web_price is not null then
    new.web_price := greatest(0, ceil(new.web_price / 10) * 10);
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_product_final_sale_price() from public, anon, authenticated;
revoke all on function private.enforce_offer_final_sale_price() from public, anon, authenticated;
revoke all on function private.enforce_web_catalog_final_sale_price() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.products') is not null then
    execute $sql$
      update public.products
      set price = case
        when coalesce(product_type, 'quantity') = 'weight'
          then greatest(0, (ceil((price * 1000) / 10) * 10) / 1000)
        else greatest(0, ceil(price / 10) * 10)
      end
      where price is not null
        and price <> case
          when coalesce(product_type, 'quantity') = 'weight'
            then greatest(0, (ceil((price * 1000) / 10) * 10) / 1000)
          else greatest(0, ceil(price / 10) * 10)
        end
    $sql$;
  end if;

  if to_regclass('public.offers') is not null then
    execute $sql$
      update public.offers
      set offer_price = greatest(0, ceil(offer_price / 10) * 10)
      where offer_price is not null
        and offer_price <> greatest(0, ceil(offer_price / 10) * 10)
    $sql$;
  end if;

  if to_regclass('public.web_catalog_products') is not null then
    execute $sql$
      update public.web_catalog_products
      set web_price = greatest(0, ceil(web_price / 10) * 10)
      where web_price <> greatest(0, ceil(web_price / 10) * 10)
    $sql$;
  end if;
end;
$$;
