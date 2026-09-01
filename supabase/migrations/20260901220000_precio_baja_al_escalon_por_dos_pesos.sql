-- El precio de venta deja de subir SIEMPRE al siguiente multiplo de $10.
--
-- Regla nueva (pedida el 1-sep-2026): si el monto esta hasta $2 por encima del
-- escalon, baja a el (3501 y 3502 quedan en 3500); de ahi para arriba sube
-- (3503 va a 3510). Espeja exactamente `normalizeFinalSalePrice` del navegador.
--
-- NO toca los precios ya cargados: solo cambia lo que pasa de aca en adelante.
-- Los costos siguen redondeando hacia arriba al peso entero, sin cambios.

create or replace function private.rebu_precio_comercial(p_monto numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when p_monto is null then null
    when p_monto <= 0 then 0
    when p_monto - (floor(p_monto / 10) * 10) <= 2 then floor(p_monto / 10) * 10
    else (floor(p_monto / 10) * 10) + 10
  end;
$$;

revoke all on function private.rebu_precio_comercial(numeric) from public, anon, authenticated;

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
      then private.rebu_precio_comercial(new.price * 1000) / 1000
    else private.rebu_precio_comercial(new.price)
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
    new.offer_price := private.rebu_precio_comercial(new.offer_price);
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
    new.web_price := private.rebu_precio_comercial(new.web_price);
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_product_final_sale_price() from public, anon, authenticated;
revoke all on function private.enforce_offer_final_sale_price() from public, anon, authenticated;
revoke all on function private.enforce_web_catalog_final_sale_price() from public, anon, authenticated;
