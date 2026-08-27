begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

select has_table('public', 'web_catalog_products', 'Existe la tabla editorial de productos');
select has_table('public', 'web_catalog_categories', 'Existen categorias web independientes');
select has_table('public', 'web_catalog_images', 'Existe la galeria editorial');
select has_table('public', 'web_catalog_events', 'Existe el historial editorial');
select has_view('public', 'web_catalog_public_products', 'Existe la vista publica segura');

select ok(has_column_privilege('anon', 'public.web_catalog_products', 'title', 'select'), 'Anon puede leer el titulo publico');
select ok(not has_column_privilege('anon', 'public.web_catalog_products', 'source_snapshot', 'select'), 'Anon no puede leer snapshots de Rebu');
select ok(not has_table_privilege('anon', 'public.web_catalog_products', 'insert'), 'Anon no puede crear fichas');
select ok(not has_column_privilege('anon', 'public.products', 'purchasePrice', 'select'), 'Anon no puede leer costos del inventario');
select ok(not has_table_privilege('anon', 'public.products', 'insert'), 'Anon no puede escribir el inventario');
select ok(not has_table_privilege('authenticated', 'public.web_catalog_products', 'insert'), 'Las fichas solo se importan mediante el RPC controlado');
select ok(has_function_privilege('authenticated', 'public.import_web_catalog_product(bigint)', 'execute'), 'Usuarios autenticados pueden ejecutar la importacion controlada');

select ok((select relrowsecurity from pg_class where oid = 'public.web_catalog_products'::regclass), 'RLS esta activo en fichas web');
select ok((select relrowsecurity from pg_class where oid = 'public.products'::regclass), 'RLS esta activo en inventario');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'web_catalog_products' and policyname = 'web_catalog_products_public_read' and roles = array['anon']::name[]), 'La lectura publica tiene una politica exclusiva');
select ok(exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'products' and policyname = 'products_public_active_read'), 'El inventario anonimo solo usa la politica activa');

select ok(exists (select 1 from storage.buckets where id = 'catalog-images' and public = true and file_size_limit = 8388608), 'El bucket editorial es publico y limita archivos a 8 MB');
select ok((select count(*) = 4 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'rebu_catalog_images_editor_%'), 'Storage tiene politicas explicitas de lectura y mutacion');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.products'::regclass and tgname = 'trg_web_catalog_source_updated' and not tgisinternal), 'Los cambios del inventario disparan comparacion editorial');
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.web_catalog_products'::regclass and tgname = 'trg_web_catalog_prepare_product' and not tgisinternal), 'La publicacion tiene validacion central en base de datos');

select * from finish();
rollback;
