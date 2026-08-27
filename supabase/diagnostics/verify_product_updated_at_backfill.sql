do $$
declare
  missing_count bigint;
  mismatched_catalog_sources bigint;
  updated_at_not_null boolean;
  updated_at_default text;
  trigger_name text;
  trigger_enabled "char";
begin
  select count(*) into missing_count
  from public.products where updated_at is null;
  if missing_count <> 0 then
    raise exception 'Products still contain % null updated_at values', missing_count;
  end if;

  select attribute.attnotnull, pg_get_expr(default_value.adbin, default_value.adrelid)
  into updated_at_not_null, updated_at_default
  from pg_catalog.pg_attribute as attribute
  left join pg_catalog.pg_attrdef as default_value
    on default_value.adrelid = attribute.attrelid
    and default_value.adnum = attribute.attnum
  where attribute.attrelid = 'public.products'::regclass
    and attribute.attname = 'updated_at';

  if not updated_at_not_null or updated_at_default is distinct from 'now()' then
    raise exception 'Products updated_at constraint/default is invalid: not_null=%, default=%',
      updated_at_not_null, updated_at_default;
  end if;

  select count(*) into mismatched_catalog_sources
  from public.web_catalog_products as catalog_product
  join public.products as product on product.id = catalog_product.source_product_id
  where catalog_product.source_fingerprint
    is distinct from private.web_catalog_source_fingerprint(product);
  if mismatched_catalog_sources <> 0 then
    raise exception 'Catalog contains % stale source fingerprints', mismatched_catalog_sources;
  end if;

  for trigger_name in
    values
      ('trg_products_updated_at'),
      ('trg_web_catalog_source_updated'),
      ('trg_web_catalog_prepare_product'),
      ('trg_web_catalog_audit_product')
  loop
    select trigger.tgenabled into trigger_enabled
    from pg_catalog.pg_trigger as trigger
    where trigger.tgname = trigger_name
      and not trigger.tgisinternal;
    if trigger_enabled is distinct from 'O' then
      raise exception 'Trigger % is not enabled: %', trigger_name, trigger_enabled;
    end if;
  end loop;

  raise notice 'Product updated_at backfill verified; constraints, catalog fingerprints and triggers are correct';
end;
$$;
