-- A commercial price is finalized in whole pesos. Costs, discounts, totals,
-- historical sale rows and all intermediate calculations keep their precision.

create schema if not exists private;

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
      then greatest(0, ceil(new.price * 1000) / 1000)
    else greatest(0, ceil(new.price))
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
    new.offer_price := greatest(0, ceil(new.offer_price));
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
    new.web_price := greatest(0, ceil(new.web_price));
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
          then greatest(0, ceil(price * 1000) / 1000)
        else greatest(0, ceil(price))
      end
      where price is not null
        and (
          (coalesce(product_type, 'quantity') = 'weight' and price * 1000 <> trunc(price * 1000))
          or (coalesce(product_type, 'quantity') <> 'weight' and price <> trunc(price))
        )
    $sql$;

    execute 'drop trigger if exists trg_products_final_sale_price on public.products';
    execute $sql$
      create trigger trg_products_final_sale_price
      before insert or update of price, product_type on public.products
      for each row execute function private.enforce_product_final_sale_price()
    $sql$;
  end if;

  if to_regclass('public.offers') is not null then
    execute $sql$
      update public.offers
      set offer_price = greatest(0, ceil(offer_price))
      where offer_price is not null and offer_price <> trunc(offer_price)
    $sql$;

    execute 'drop trigger if exists trg_offers_final_sale_price on public.offers';
    execute $sql$
      create trigger trg_offers_final_sale_price
      before insert or update of offer_price on public.offers
      for each row execute function private.enforce_offer_final_sale_price()
    $sql$;
  end if;

  if to_regclass('public.web_catalog_products') is not null then
    execute $sql$
      update public.web_catalog_products
      set web_price = greatest(0, ceil(web_price))
      where web_price <> trunc(web_price)
    $sql$;

    execute 'drop trigger if exists trg_web_catalog_final_sale_price on public.web_catalog_products';
    execute $sql$
      create trigger trg_web_catalog_final_sale_price
      before insert or update of web_price on public.web_catalog_products
      for each row execute function private.enforce_web_catalog_final_sale_price()
    $sql$;
  end if;
end;
$$;
