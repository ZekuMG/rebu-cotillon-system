-- El precio elegido en inventario se guarda tal cual. El escalon comercial
-- sigue disponible como recomendacion en el cliente, no como regla de datos.
-- No se modifican precios existentes ni las reglas de ofertas y catalogo web.

create or replace function private.enforce_product_final_sale_price()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.price is not null then
    new.price := greatest(0, new.price);
  end if;
  return new;
end;
$$;
