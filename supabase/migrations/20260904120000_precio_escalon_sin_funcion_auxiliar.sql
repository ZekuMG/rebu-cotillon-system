-- ARREGLO URGENTE de 20260901220000.
--
-- Esa migracion puso la regla del escalon en una funcion auxiliar
-- `private.rebu_precio_comercial` y la llamo desde los triggers. Los triggers NO
-- son security definer: corren como quien guarda (la app trabaja como `anon`),
-- y `anon` no tiene USAGE sobre el esquema `private`. Resultado:
--
--   permission denied for schema private
--   PL/pgSQL function private.enforce_product_final_sale_price() line 7
--
-- o sea que **cualquier intento de guardar un precio fallaba** ("Fallo al
-- guardar"). Las versiones anteriores andaban porque hacian la cuenta adentro,
-- sin llamar a nada.
--
-- Aca la regla vuelve a estar inline (misma regla: hasta $2 por encima del
-- escalon baja, de ahi para arriba sube) y se borra la funcion auxiliar para no
-- volver a caer en la trampa.

create or replace function private.enforce_product_final_sale_price()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  monto numeric;
  escalon numeric;
  es_peso boolean;
begin
  if new.price is null then
    return new;
  end if;

  es_peso := coalesce(new.product_type, 'quantity') = 'weight';
  monto := case when es_peso then new.price * 1000 else new.price end;

  if monto <= 0 then
    new.price := 0;
    return new;
  end if;

  escalon := floor(monto / 10) * 10;
  monto := case when monto - escalon <= 2 then escalon else escalon + 10 end;
  new.price := case when es_peso then monto / 1000 else monto end;
  return new;
end;
$$;

create or replace function private.enforce_offer_final_sale_price()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  escalon numeric;
begin
  if new.offer_price is null then
    return new;
  end if;
  if new.offer_price <= 0 then
    new.offer_price := 0;
    return new;
  end if;

  escalon := floor(new.offer_price / 10) * 10;
  new.offer_price := case when new.offer_price - escalon <= 2 then escalon else escalon + 10 end;
  return new;
end;
$$;

create or replace function private.enforce_web_catalog_final_sale_price()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  escalon numeric;
begin
  if new.web_price is null then
    return new;
  end if;
  if new.web_price <= 0 then
    new.web_price := 0;
    return new;
  end if;

  escalon := floor(new.web_price / 10) * 10;
  new.web_price := case when new.web_price - escalon <= 2 then escalon else escalon + 10 end;
  return new;
end;
$$;

drop function if exists private.rebu_precio_comercial(numeric);
