/**
 * Traduce los filtros de la pantalla de Historial a los argumentos de la
 * funcion `public.sales_history_page` (migracion 20260901200000).
 *
 * POR QUE EXISTE. Hasta el 1-sep-2026 el Historial bajaba una ventana de ventas
 * y filtraba, buscaba y sumaba en el navegador. Con 3.944 ventas en la base eso
 * significaba que el encabezado mostraba el total de ~100 ventas ($965.454 en
 * vez de $32,7 M) y que buscar un producto viejo no lo encontraba, porque la
 * fila nunca se habia descargado. Ahora el filtro entero viaja a Postgres.
 *
 * REGLA. Este modulo es puro y sin dependencias: es el contrato entre la
 * pantalla y la base, y esta cubierto por tests/history-server-query.test.js.
 * La categoria y el vendedor se resuelven ACA (con el inventario y el catalogo
 * que la app ya tiene en memoria) para no duplicar en SQL la logica de
 * `matchesHistoryCategoryFilter` y `matchesUnifiedUserFilter`.
 */

export const UNCATEGORIZED_CATEGORY_LABEL = 'Sin categoria';

const BUENOS_AIRES = 'America/Argentina/Buenos_Aires';

/** Espejo exacto de `public.rebu_fold_text` y de normalizeUserText. */
export const foldHistoryText = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

export const getHistorySearchTokens = (query = '') =>
  foldHistoryText(query).split(/\s+/).filter(Boolean);

/**
 * Escribir "test" en el buscador no es una busqueda: es el modo prueba, que
 * muestra SOLO las ventas de prueba y esconde el resto (y al reves el resto del
 * tiempo). Se decide aca para que la base cuente lo mismo que muestra la lista.
 */
export const isTestModeSearch = (query = '') => foldHistoryText(query) === 'test';

/** Fecha de hoy en Buenos Aires como YYYY-MM-DD. */
export const getTodayInBuenosAires = (now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: BUENOS_AIRES,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

const shiftIsoDate = (isoDate, days) => {
  const [year, month, day] = String(isoDate).split('-').map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + days));
  return moved.toISOString().slice(0, 10);
};

const normalizeIsoDate = (value) => {
  const trimmed = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
};

const laterDate = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
};

const earlierDate = (a, b) => {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
};

/**
 * Cruza el selector "Todas / Solo Hoy / Solo Historial" con el rango de fechas
 * elegido a mano. Gana siempre el mas angosto: "Solo Historial" no puede
 * devolver ventas de hoy aunque el rango llegue hasta hoy.
 */
export const resolveHistoryDateRange = ({
  viewMode = 'all',
  dateStart = '',
  dateEnd = '',
  today = getTodayInBuenosAires(),
} = {}) => {
  let start = normalizeIsoDate(dateStart);
  let end = normalizeIsoDate(dateEnd);

  if (viewMode === 'today') {
    start = laterDate(start, today);
    end = earlierDate(end, today);
    start = today;
    end = today;
  } else if (viewMode === 'history') {
    end = earlierDate(end, shiftIsoDate(today, -1));
  }

  return { start: start || null, end: end || null };
};

const splitCategoryText = (value = '') =>
  String(value || '')
    .split(',')
    .map((category) => category.trim())
    .filter(Boolean);

const getProductCategoryLabels = (product = {}) => {
  const fromArray = Array.isArray(product.categories)
    ? product.categories.map((category) => String(category || '').trim()).filter(Boolean)
    : [];
  if (fromArray.length > 0) return fromArray;

  const fromText = splitCategoryText(product.category);
  return fromText.length > 0 ? fromText : [UNCATEGORIZED_CATEGORY_LABEL];
};

/**
 * Devuelve los ids de producto que caen en una categoria.
 *
 * Devuelve `null` solo cuando no hay filtro. Si la categoria existe pero ningun
 * producto la tiene, devuelve `[]` a proposito: mandar `null` haria que la base
 * ignore el filtro y la pantalla mostraria ventas que no corresponden.
 */
export const resolveCategoryProductIds = (inventory = [], category = '') => {
  const target = foldHistoryText(category);
  if (!target) return null;

  return (Array.isArray(inventory) ? inventory : [])
    .filter((product) =>
      getProductCategoryLabels(product).some((label) => foldHistoryText(label) === target),
    )
    .map((product) => Number(product?.id))
    .filter((id) => Number.isFinite(id));
};

const nonEmptyArray = (values) => {
  const list = (Array.isArray(values) ? values : []).map(String).filter(Boolean);
  return list.length > 0 ? list : null;
};

/**
 * Arma el objeto de argumentos de `public.sales_history_page`.
 *
 * Las claves salen siempre en el mismo orden y con los mismos tipos: el feed usa
 * su JSON como clave de cache, asi que un objeto inestable dispararia una
 * consulta nueva a Supabase en cada render.
 */
export const buildHistoryQueryArgs = ({
  viewMode = 'all',
  filterDateStart = '',
  filterDateEnd = '',
  filterPayment = '',
  filterCategory = '',
  searchQuery = '',
  sortOrder = 'desc',
  selectedUserFilter = null,
  inventory = [],
  page = 1,
  pageSize = 50,
  today = getTodayInBuenosAires(),
} = {}) => {
  const onlyTest = isTestModeSearch(searchQuery);
  const tokens = getHistorySearchTokens(searchQuery);
  const { start, end } = resolveHistoryDateRange({
    viewMode,
    dateStart: filterDateStart,
    dateEnd: filterDateEnd,
    today,
  });

  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Number(pageSize) || 50);
  const legacyGroup = selectedUserFilter?.bucket === 'legacy_user_group';

  return {
    p_tokens: tokens.length > 0 ? tokens : null,
    p_date_start: start,
    p_date_end: end,
    p_payment: String(filterPayment || '').trim() || null,
    p_user_ids: legacyGroup ? null : nonEmptyArray(selectedUserFilter?.userIds),
    p_user_names: legacyGroup
      ? null
      : nonEmptyArray([
          ...(selectedUserFilter?.aliases || []),
          ...(selectedUserFilter?.remoteAliases || []),
        ]),
    p_user_legacy: legacyGroup,
    p_product_ids: resolveCategoryProductIds(inventory, filterCategory),
    p_only_test: onlyTest,
    p_ascending: sortOrder === 'asc',
    p_limit: safePageSize,
    p_offset: (safePage - 1) * safePageSize,
  };
};

/** Clave estable de cache para un conjunto de argumentos. */
export const getHistoryQueryCacheKey = (args) => JSON.stringify(args);

/**
 * Ubica en la pagina correcta las ventas que la base no conoce.
 *
 * Son las 15 ventas que ya no tienen fila en `sales` y se reconstruyen desde su
 * log (todas de marzo y abril de 2026). Como no entran en el `offset` que
 * calcula Postgres, se insertan en la pagina cuyo rango de fechas las contiene:
 * la primera pagina no tiene techo y la ultima no tiene piso, asi que ninguna
 * se pierde ni aparece repetida en dos paginas.
 */
export const selectPageWindowExtras = ({
  extras = [],
  pageRows = [],
  sortOrder = 'desc',
  isFirstPage = true,
  isLastPage = true,
} = {}) => {
  const list = Array.isArray(extras) ? extras : [];
  if (list.length === 0) return [];
  if (pageRows.length === 0) return isFirstPage && isLastPage ? list : [];

  const times = pageRows
    .map((row) => row?.sortDate?.getTime?.())
    .filter((time) => Number.isFinite(time));
  if (times.length === 0) return isFirstPage && isLastPage ? list : [];

  const newest = Math.max(...times);
  const oldest = Math.min(...times);
  const ascending = sortOrder === 'asc';
  // El borde "abierto" depende del orden: en descendente la primera pagina es
  // la de las ventas mas nuevas; en ascendente, la de las mas viejas.
  const openTop = ascending ? isLastPage : isFirstPage;
  const openBottom = ascending ? isFirstPage : isLastPage;

  return list.filter((tx) => {
    const time = tx?.sortDate?.getTime?.();
    if (!Number.isFinite(time)) return false;
    if (!openTop && time > newest) return false;
    if (!openBottom && time < oldest) return false;
    return true;
  });
};
