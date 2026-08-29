const splitSelectColumns = (selectColumns = '') => {
  const tokens = [];
  let current = '';
  let depth = 0;

  for (const char of String(selectColumns || '')) {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);

    if (char === ',' && depth === 0) {
      if (current.trim()) tokens.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim()) tokens.push(current.trim());
  return tokens;
};

const normalizeColumnToken = (token = '') => {
  const cleaned = String(token)
    .trim()
    .replace(/^["`]|["`]$/g, '');

  const withoutTablePrefix = cleaned.includes('.')
    ? cleaned.split('.').pop()
    : cleaned;

  return withoutTablePrefix.toLowerCase();
};

const normalizeIdentifier = (token = '') =>
  String(token)
    .trim()
    .replace(/^["`]|["`]$/g, '')
    .toLowerCase();

const normalizeRelationIdentifier = (token = '') => {
  const cleaned = normalizeIdentifier(token).split('!')[0];
  const withoutAlias = cleaned.includes(':') ? cleaned.split(':').pop() : cleaned;
  return withoutAlias.replace(/_\d+$/g, '');
};

const relationMatches = (left, right) =>
  Boolean(left && right && normalizeRelationIdentifier(left) === normalizeRelationIdentifier(right));

const parseMissingColumnRef = (missingColumn = '') => {
  const parts = String(missingColumn || '')
    .split('.')
    .map(normalizeIdentifier)
    .filter(Boolean);

  if (parts.length <= 1) {
    return {
      relation: null,
      column: normalizeIdentifier(missingColumn),
    };
  }

  return {
    relation: parts[parts.length - 2],
    column: parts[parts.length - 1],
  };
};

export const getSchemaMissingColumnName = (missingColumn = '') =>
  parseMissingColumnRef(missingColumn).column || normalizeColumnToken(missingColumn);

export const SCHEMA_OPTIONAL_COLUMNS = {
  products: new Set([
    'brand',
    'purchaseprice',
    'purchase_price',
    'barcode',
    'image',
    'active_offers',
    'updated_at',
    'image_thumb',
    'product_type',
    'expiration_date',
    'is_active',
    'supplier_links',
  ]),
  clients: new Set(['dni', 'phone', 'email', 'extrainfo', 'extra_info', 'social_connections', 'updated_at', 'is_active']),
  rewards: new Set(['is_active']),
  logs: new Set(['details', 'reason', 'user', 'user_id', 'user_role', 'user_name']),
  expenses: new Set(['expense_date', 'payment_method', 'user_id', 'user_role', 'user_name']),
  cash_closures: new Set([
    'user_id',
    'user_role',
    'user_name',
    'order_id',
    'points_source',
    'payment_methods_summary',
    'items_sold_list',
    'new_clients_list',
    'expenses_snapshot',
    'transactions_snapshot',
  ]),
  sales: new Set([
    'payment_breakdown',
    'cash_received',
    'cash_change',
    'installments',
    'client_id',
    'points_earned',
    'points_spent',
    'status',
    'voided_at',
    'user_id',
    'user_role',
    'user_name',
  ]),
  sale_items: new Set([
    'product_id',
    'cost',
    'subtotal',
    'line_subtotal',
    'product_type',
    'is_reward',
    'is_discount',
    'is_custom',
    'is_combo',
  ]),
  budgets: new Set([
    'payment_method',
    'payment_breakdown',
    'installments',
    'is_active',
  ]),
  orders: new Set([
    'payment_method',
    'payment_breakdown',
    'installments',
    'points_credited',
    'points_accounting_mode',
    'version',
    'is_active',
  ]),
};

export const isOptionalSchemaColumn = (table, missingColumn) => {
  const columnName = getSchemaMissingColumnName(missingColumn);
  if (!columnName) return false;
  const optionalColumns = SCHEMA_OPTIONAL_COLUMNS[normalizeIdentifier(table)];
  return Boolean(optionalColumns?.has(columnName));
};

export const extractSchemaMissingColumn = (error) => {
  const errorText = [error?.message, error?.details, error?.hint].filter(Boolean).join(' ');
  const patterns = [
    /Could not find the '([^']+)' column/i,
    /column ["`]?([a-z0-9_.]+)["`]? does not exist/i,
    /record ["`]?[^"'`]+["`]? has no field ["`]?([a-z0-9_.]+)["`]?/i,
  ];

  for (const pattern of patterns) {
    const match = errorText.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
};

export const removeColumnFromSelect = (selectColumns, missingColumn, currentRelation = null) => {
  const missingRef = parseMissingColumnRef(missingColumn);
  const normalizedMissing = missingRef.column || normalizeColumnToken(missingColumn);
  const targetRelation = missingRef.relation;
  const normalizedCurrentRelation = currentRelation ? normalizeRelationIdentifier(currentRelation) : null;
  const tokens = splitSelectColumns(selectColumns);
  const hasTargetRelationToken = targetRelation
    ? tokens.some((token) => {
        const openIndex = token.indexOf('(');
        if (openIndex === -1) return false;
        return relationMatches(token.slice(0, openIndex), targetRelation);
      })
    : false;

  const nextTokens = tokens
    .map((token) => {
      const openIndex = token.indexOf('(');
      const closeIndex = token.lastIndexOf(')');

      if (openIndex === -1 || closeIndex === -1 || closeIndex < openIndex) {
        if (
          targetRelation &&
          !relationMatches(normalizedCurrentRelation, targetRelation) &&
          (normalizedCurrentRelation || hasTargetRelationToken)
        ) {
          return token;
        }
        return normalizeColumnToken(token) === normalizedMissing ? null : token;
      }

      const relationName = token.slice(0, openIndex).trim();
      const innerSelect = token.slice(openIndex + 1, closeIndex);

      if (!targetRelation && normalizeColumnToken(relationName) === normalizedMissing) {
        return null;
      }

      const nextInner = removeColumnFromSelect(innerSelect, missingColumn, relationName);
      if (!nextInner) return null;

      return `${relationName}(${nextInner})`;
    })
    .filter(Boolean);

  return nextTokens.join(',');
};

export const fetchAllCloudRowsWithSelectFallback = async (
  buildQuery,
  selectColumns,
  batchSize = 200,
  { signal = null } = {},
) => {
  let safeSelect = selectColumns;

  while (safeSelect) {
    const rows = [];
    let from = 0;
    let shouldRetry = false;

    while (true) {
      let query = buildQuery(safeSelect);
      if (signal && typeof query.abortSignal === 'function') {
        query = query.abortSignal(signal);
      }
      const { data, error } = await query.range(from, from + batchSize - 1);

      if (error) {
        const missingColumn = extractSchemaMissingColumn(error);
        const nextSelect = missingColumn ? removeColumnFromSelect(safeSelect, missingColumn) : '';

        if (missingColumn && nextSelect && nextSelect !== safeSelect) {
          safeSelect = nextSelect;
          shouldRetry = true;
          break;
        }

        return { data: null, error, selectColumns: safeSelect };
      }

      const page = Array.isArray(data) ? data : [];
      rows.push(...page);

      // PostgREST can cap the number of returned rows below the requested
      // range size. A short page therefore does not prove that the table is
      // exhausted; only an empty page does.
      if (page.length === 0) {
        return { data: rows, error: null, selectColumns: safeSelect };
      }

      from += page.length;
    }

    if (!shouldRetry) break;
  }

  return {
    data: null,
    error: new Error('No quedaron columnas válidas para consultar en Supabase.'),
    selectColumns: '',
  };
};

const compareCursorValuesDesc = (left, right) => {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return rightNumber - leftNumber;
  }

  return String(right ?? '').localeCompare(String(left ?? ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
};

export const sortCloudRowsNewestFirst = (
  rows = [],
  { createdAtColumn = 'created_at', idColumn = 'id' } = {},
) => [...(Array.isArray(rows) ? rows : [])].sort((left, right) => {
  const leftCreatedAt = Date.parse(left?.[createdAtColumn]);
  const rightCreatedAt = Date.parse(right?.[createdAtColumn]);
  const safeLeftCreatedAt = Number.isFinite(leftCreatedAt) ? leftCreatedAt : 0;
  const safeRightCreatedAt = Number.isFinite(rightCreatedAt) ? rightCreatedAt : 0;

  if (safeLeftCreatedAt !== safeRightCreatedAt) {
    return safeRightCreatedAt - safeLeftCreatedAt;
  }

  return compareCursorValuesDesc(left?.[idColumn], right?.[idColumn]);
});

export const fetchAllCloudRowsByIdCursorWithSelectFallback = async (
  buildQuery,
  selectColumns,
  batchSize = 200,
  { signal = null, idColumn = 'id' } = {},
) => {
  let safeSelect = selectColumns;

  while (safeSelect) {
    const rows = [];
    let cursor = null;
    let shouldRetry = false;

    while (true) {
      let query = buildQuery(safeSelect)
        .order(idColumn, { ascending: false })
        .limit(batchSize);
      if (cursor !== null) query = query.lt(idColumn, cursor);
      if (signal && typeof query.abortSignal === 'function') {
        query = query.abortSignal(signal);
      }

      const { data, error } = await query;
      if (error) {
        const missingColumn = extractSchemaMissingColumn(error);
        const nextSelect = missingColumn ? removeColumnFromSelect(safeSelect, missingColumn) : '';

        if (missingColumn && nextSelect && nextSelect !== safeSelect) {
          safeSelect = nextSelect;
          shouldRetry = true;
          break;
        }

        return { data: null, error, selectColumns: safeSelect };
      }

      const page = Array.isArray(data) ? data : [];
      rows.push(...page);
      if (page.length === 0) {
        return { data: rows, error: null, selectColumns: safeSelect };
      }

      const nextCursor = page[page.length - 1]?.[idColumn];
      if (nextCursor === undefined || nextCursor === null || String(nextCursor) === String(cursor)) {
        return {
          data: null,
          error: new Error(`La paginacion por cursor no pudo avanzar en la columna ${idColumn}.`),
          selectColumns: safeSelect,
        };
      }
      cursor = nextCursor;
    }

    if (!shouldRetry) break;
  }

  return {
    data: null,
    error: new Error('No quedaron columnas validas para consultar en Supabase.'),
    selectColumns: '',
  };
};

export const runSelectWithSchemaFallback = async (
  buildQuery,
  selectColumns,
  { signal = null } = {},
) => {
  let safeSelect = selectColumns;

  while (safeSelect) {
    let query = buildQuery(safeSelect);
    if (signal && typeof query?.abortSignal === 'function') {
      query = query.abortSignal(signal);
    }
    const { data, error } = await query;
    if (!error) {
      return { data, error: null, selectColumns: safeSelect };
    }

    const missingColumn = extractSchemaMissingColumn(error);
    const nextSelect = missingColumn ? removeColumnFromSelect(safeSelect, missingColumn) : '';

    if (!missingColumn || !nextSelect || nextSelect === safeSelect) {
      return { data: null, error, selectColumns: safeSelect };
    }

    safeSelect = nextSelect;
  }

  return {
    data: null,
    error: new Error('No quedaron columnas válidas para consultar en Supabase.'),
    selectColumns: '',
  };
};
