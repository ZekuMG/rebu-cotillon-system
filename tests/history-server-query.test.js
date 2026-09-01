import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHistoryQueryArgs,
  foldHistoryText,
  getHistorySearchTokens,
  isTestModeSearch,
  resolveCategoryProductIds,
  resolveHistoryDateRange,
  selectPageWindowExtras,
} from '../src/utils/historyServerQuery.js';

// El encabezado del Historial sumaba en el navegador solo las ventas que
// alcanzaba a descargar, y la busqueda miraba esa misma ventana. Ahora el filtro
// entero viaja a Postgres, asi que estos argumentos son el contrato entre la
// pantalla y `public.sales_history_page`. Si se desalinean, la lista y el total
// vuelven a contar cosas distintas.

const HOY = '2026-09-01';

// --- Texto ----------------------------------------------------------------

test('el plegado de texto es el mismo que usa la base', () => {
  // Espejo de public.rebu_fold_text: minusculas, sin acentos, sin bordes.
  assert.equal(foldHistoryText('  Peluché ÑOÑO Cañón ÁGUILA  '), 'peluche nono canon aguila');
  assert.equal(foldHistoryText(null), '');
  assert.equal(foldHistoryText(1234), '1234');
});

test('la busqueda se parte en palabras y todas tienen que estar', () => {
  assert.deepEqual(getHistorySearchTokens('  Globo   Corazón '), ['globo', 'corazon']);
  assert.deepEqual(getHistorySearchTokens('   '), []);
});

test('buscar "test" es el modo prueba, no una busqueda comun', () => {
  assert.equal(isTestModeSearch('test'), true);
  assert.equal(isTestModeSearch('  TEST  '), true);
  assert.equal(isTestModeSearch('testigo'), false);
  assert.equal(isTestModeSearch(''), false);
});

// --- Fechas ---------------------------------------------------------------

test('"Solo Hoy" pide un unico dia', () => {
  assert.deepEqual(
    resolveHistoryDateRange({ viewMode: 'today', today: HOY }),
    { start: HOY, end: HOY },
  );
});

test('"Solo Historial" corta el dia de hoy', () => {
  assert.deepEqual(
    resolveHistoryDateRange({ viewMode: 'history', today: HOY }),
    { start: null, end: '2026-08-31' },
  );
});

test('sin modo especial manda el rango tal cual', () => {
  assert.deepEqual(
    resolveHistoryDateRange({ viewMode: 'all', dateStart: '2026-08-01', dateEnd: '2026-08-31', today: HOY }),
    { start: '2026-08-01', end: '2026-08-31' },
  );
});

test('el rango elegido a mano y el modo se cruzan: gana el mas angosto', () => {
  // "Solo Historial" + un rango que llega hasta hoy no puede devolver hoy.
  assert.deepEqual(
    resolveHistoryDateRange({ viewMode: 'history', dateStart: '2026-08-20', dateEnd: HOY, today: HOY }),
    { start: '2026-08-20', end: '2026-08-31' },
  );
  assert.deepEqual(
    resolveHistoryDateRange({ viewMode: 'today', dateStart: '2026-08-01', today: HOY }),
    { start: HOY, end: HOY },
  );
});

// --- Categoria ------------------------------------------------------------

const INVENTARIO = [
  { id: 1, title: 'Globo Corazon', category: 'Globos, Decoración' },
  { id: 2, title: 'Plato', category: 'Descartables' },
  { id: 3, title: 'Vela', categories: ['Velas y Bengalas', 'Globos'] },
  { id: 4, title: 'Sin rubro', category: '' },
];

test('la categoria viaja como ids de producto, no como texto', () => {
  // La app ya tiene el inventario en memoria: resolver aca evita duplicar en
  // SQL la logica de matchesHistoryCategoryFilter.
  assert.deepEqual(resolveCategoryProductIds(INVENTARIO, 'Globos'), [1, 3]);
  assert.deepEqual(resolveCategoryProductIds(INVENTARIO, 'Decoracion'), [1]);
  assert.deepEqual(resolveCategoryProductIds(INVENTARIO, 'Descartables'), [2]);
});

test('"Sin categoria" son los productos que no tienen ninguna', () => {
  assert.deepEqual(resolveCategoryProductIds(INVENTARIO, 'Sin categoria'), [4]);
});

test('una categoria sin productos devuelve lista vacia, no "todos"', () => {
  // Devolver null aca haria que el filtro se ignore y la pantalla muestre
  // ventas que no corresponden.
  assert.deepEqual(resolveCategoryProductIds(INVENTARIO, 'Disfraces'), []);
  assert.equal(resolveCategoryProductIds(INVENTARIO, ''), null);
});

// --- Argumentos completos -------------------------------------------------

const base = { today: HOY, inventory: INVENTARIO, pageSize: 50 };

test('sin filtros no manda ninguna condicion y pide la primera pagina', () => {
  const args = buildHistoryQueryArgs({ ...base, page: 1 });

  assert.deepEqual(args, {
    p_tokens: null,
    p_date_start: null,
    p_date_end: null,
    p_payment: null,
    p_user_ids: null,
    p_user_names: null,
    p_user_legacy: false,
    p_product_ids: null,
    p_only_test: false,
    p_ascending: false,
    p_limit: 50,
    p_offset: 0,
  });
});

test('la pagina 3 pide desde la fila 100, no vuelve a bajar las anteriores', () => {
  // Este es el arreglo de fondo: el feed viejo usaba un limit creciente y
  // rebajaba la ventana entera en cada pagina.
  assert.equal(buildHistoryQueryArgs({ ...base, page: 3 }).p_offset, 100);
  assert.equal(buildHistoryQueryArgs({ ...base, page: 3 }).p_limit, 50);
  assert.equal(buildHistoryQueryArgs({ ...base, page: 0 }).p_offset, 0);
});

test('la busqueda viaja plegada al servidor', () => {
  const args = buildHistoryQueryArgs({ ...base, searchQuery: 'Globo Corazón' });
  assert.deepEqual(args.p_tokens, ['globo', 'corazon']);
  assert.equal(args.p_only_test, false);
});

test('el modo prueba se pide explicito', () => {
  const args = buildHistoryQueryArgs({ ...base, searchQuery: 'test' });
  assert.equal(args.p_only_test, true);
  assert.deepEqual(args.p_tokens, ['test']);
});

test('el orden ascendente se lo resuelve la base', () => {
  assert.equal(buildHistoryQueryArgs({ ...base, sortOrder: 'asc' }).p_ascending, true);
  assert.equal(buildHistoryQueryArgs({ ...base, sortOrder: 'desc' }).p_ascending, false);
});

test('un vendedor con cuenta se filtra por id', () => {
  const args = buildHistoryQueryArgs({
    ...base,
    selectedUserFilter: { key: 'user:sol', bucket: 'real_user', userIds: ['abc-123'], aliases: ['sol'] },
  });

  assert.deepEqual(args.p_user_ids, ['abc-123']);
  assert.deepEqual(args.p_user_names, ['sol']);
  assert.equal(args.p_user_legacy, false);
});

test('los usuarios viejos sin cuenta se filtran por nombre', () => {
  const args = buildHistoryQueryArgs({
    ...base,
    selectedUserFilter: { key: 'legacy_user:dueno', bucket: 'legacy_user', userIds: [], aliases: ['dueno', 'duenio', 'owner'] },
  });

  assert.equal(args.p_user_ids, null);
  assert.deepEqual(args.p_user_names, ['dueno', 'duenio', 'owner']);
  assert.equal(args.p_user_legacy, false);
});

test('el grupo Dueño/Vendedor/Caja son todas las ventas sin cuenta', () => {
  const args = buildHistoryQueryArgs({
    ...base,
    selectedUserFilter: { key: 'bucket:legacy_human_caja', bucket: 'legacy_user_group', userIds: [], aliases: ['dueno', 'caja'] },
  });

  assert.equal(args.p_user_legacy, true);
});

test('categoria y metodo de pago llegan juntos sin pisarse', () => {
  const args = buildHistoryQueryArgs({
    ...base,
    filterPayment: 'MercadoPago',
    filterCategory: 'Globos',
    filterDateStart: '2026-08-01',
    filterDateEnd: '2026-08-31',
  });

  assert.equal(args.p_payment, 'MercadoPago');
  assert.deepEqual(args.p_product_ids, [1, 3]);
  assert.equal(args.p_date_start, '2026-08-01');
  assert.equal(args.p_date_end, '2026-08-31');
});

test('los mismos filtros producen los mismos argumentos', () => {
  // La clave de cache del feed se arma con esto: si el objeto no es estable,
  // cada render dispara una consulta nueva contra Supabase.
  const input = { ...base, searchQuery: 'globo', filterCategory: 'Globos', page: 2 };
  assert.deepEqual(buildHistoryQueryArgs(input), buildHistoryQueryArgs(input));
  assert.equal(
    JSON.stringify(buildHistoryQueryArgs(input)),
    JSON.stringify(buildHistoryQueryArgs({ ...input })),
  );
});

// --- Ventas que solo viven en los logs ------------------------------------

const enFecha = (iso) => ({ id: iso, sortDate: new Date(iso) });

const PAGINA = [enFecha('2026-05-10T12:00:00Z'), enFecha('2026-04-10T12:00:00Z')];
const RECONSTRUIDAS = [
  enFecha('2026-06-01T12:00:00Z'), // mas nueva que la pagina
  enFecha('2026-04-20T12:00:00Z'), // dentro de la pagina
  enFecha('2026-03-01T12:00:00Z'), // mas vieja que la pagina
];

test('en una pagina del medio solo entran las ventas de ese tramo', () => {
  const r = selectPageWindowExtras({
    extras: RECONSTRUIDAS, pageRows: PAGINA, sortOrder: 'desc',
    isFirstPage: false, isLastPage: false,
  });
  assert.deepEqual(r.map((tx) => tx.id), ['2026-04-20T12:00:00Z']);
});

test('la primera pagina no tiene techo y la ultima no tiene piso', () => {
  const primera = selectPageWindowExtras({
    extras: RECONSTRUIDAS, pageRows: PAGINA, sortOrder: 'desc',
    isFirstPage: true, isLastPage: false,
  });
  assert.deepEqual(primera.map((tx) => tx.id), ['2026-06-01T12:00:00Z', '2026-04-20T12:00:00Z']);

  const ultima = selectPageWindowExtras({
    extras: RECONSTRUIDAS, pageRows: PAGINA, sortOrder: 'desc',
    isFirstPage: false, isLastPage: true,
  });
  assert.deepEqual(ultima.map((tx) => tx.id), ['2026-04-20T12:00:00Z', '2026-03-01T12:00:00Z']);
});

test('en orden ascendente los bordes abiertos se dan vuelta', () => {
  const primera = selectPageWindowExtras({
    extras: RECONSTRUIDAS, pageRows: PAGINA, sortOrder: 'asc',
    isFirstPage: true, isLastPage: false,
  });
  assert.deepEqual(primera.map((tx) => tx.id), ['2026-04-20T12:00:00Z', '2026-03-01T12:00:00Z']);
});

test('ninguna venta reconstruida se pierde ni se repite entre paginas', () => {
  // Recorriendo las 3 paginas, cada reconstruida tiene que aparecer una sola vez.
  const paginas = [
    { rows: [enFecha('2026-07-01T12:00:00Z'), enFecha('2026-05-10T12:00:00Z')], first: true, last: false },
    { rows: [enFecha('2026-05-09T12:00:00Z'), enFecha('2026-04-10T12:00:00Z')], first: false, last: false },
    { rows: [enFecha('2026-04-09T12:00:00Z'), enFecha('2026-02-01T12:00:00Z')], first: false, last: true },
  ];
  const vistas = paginas.flatMap((p) =>
    selectPageWindowExtras({
      extras: RECONSTRUIDAS, pageRows: p.rows, sortOrder: 'desc',
      isFirstPage: p.first, isLastPage: p.last,
    }).map((tx) => tx.id),
  );

  assert.deepEqual(vistas.sort(), RECONSTRUIDAS.map((tx) => tx.id).sort());
});

test('sin ventas en la pagina no se inventa ubicacion', () => {
  assert.deepEqual(
    selectPageWindowExtras({ extras: RECONSTRUIDAS, pageRows: [], isFirstPage: false, isLastPage: false }),
    [],
  );
  assert.equal(
    selectPageWindowExtras({ extras: RECONSTRUIDAS, pageRows: [], isFirstPage: true, isLastPage: true }).length,
    3,
  );
});
