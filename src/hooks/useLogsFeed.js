import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase/client';
import { mapLogRecords } from '../utils/cloudMappers';
import { CLOUD_SELECTS, LOGS_PAGE_SIZE } from '../utils/cloudSelects';
import {
  extractSchemaMissingColumn,
  removeColumnFromSelect,
} from '../utils/supabaseSchemaFallback';

const EMPTY_ARRAY = [];
const DETAILS_SEARCH_BATCH_SIZE = 100;
const DETAILS_SEARCH_MAX_ROWS_WITH_DATE = 20000;
const DETAILS_SEARCH_MAX_ROWS_UNBOUNDED = 3000;

const sanitizeSearchTerm = (value) =>
  String(value || '')
    .trim()
    .replace(/[,%()]/g, ' ')
    .replace(/\s+/g, ' ');

const normalizeSearchAlias = (value) =>
  sanitizeSearchTerm(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const normalizeClientSearchText = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const stringifySearchValue = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const logRowMatchesClientSearch = (row, rawTerm, scope = 'all') => {
  const term = normalizeClientSearchText(rawTerm);
  if (!term) return true;
  if (String(row?.id ?? '') === term) return true;

  const detailsText = stringifySearchValue(row?.details);
  const indexesByScope = {
    id: [detailsText],
    product: [detailsText],
    user: [row?.user, row?.user_name, row?.details?.userName, row?.details?.userRole],
    action: [row?.action, row?.reason],
    all: [row?.action, row?.reason, row?.user, row?.user_name, row?.created_at, detailsText],
  };
  const searchIndex = (indexesByScope[scope] || indexesByScope.all)
    .filter((value) => value !== null && value !== undefined && value !== '')
    .join(' ');

  return normalizeClientSearchText(searchIndex).includes(term);
};

const logRowMatchesProductSearch = (row, rawTerms = []) => {
  const terms = (Array.isArray(rawTerms) ? rawTerms : [rawTerms])
    .map(normalizeClientSearchText)
    .filter(Boolean);
  if (terms.length === 0) return true;

  const detailsText = normalizeClientSearchText(stringifySearchValue(row?.details));
  return terms.some((term) => detailsText.includes(term));
};

const _expandLegacyUserSearchTerms = (term) => {
  const normalized = normalizeSearchAlias(term);
  const terms = new Set([term]);

  if (['dueno', 'duenio', 'dueño', 'owner'].includes(normalized)) {
    ['Dueño', 'Dueno', 'DueÃ±o', 'DueÃƒÂ±o', 'owner'].forEach((value) => terms.add(value));
  }

  if (['caja', 'vendedor', 'seller'].includes(normalized)) {
    ['Caja', 'Vendedor', 'seller'].forEach((value) => terms.add(value));
  }

  if (['sistema', 'system', 'admin'].includes(normalized)) {
    ['Sistema', 'system', 'admin'].forEach((value) => terms.add(value));
  }

  return [...terms].map((value) => sanitizeSearchTerm(value)).filter(Boolean);
};

const expandLogSearchTerms = (term) => {
  const normalized = normalizeSearchAlias(term);
  const terms = new Set([term]);

  if (['dueno', 'duenio', 'owner'].includes(normalized)) {
    ['Due\u00f1o', 'Dueno', 'Duenio', 'owner'].forEach((value) => terms.add(value));
  }

  if (['caja', 'vendedor', 'seller'].includes(normalized)) {
    ['Caja', 'Vendedor', 'seller'].forEach((value) => terms.add(value));
  }

  if (['sistema', 'system', 'admin'].includes(normalized)) {
    ['Sistema', 'system', 'admin'].forEach((value) => terms.add(value));
  }

  return [...terms].map((value) => sanitizeSearchTerm(value)).filter(Boolean);
};

const buildDayStartIso = (value) => `${value}T00:00:00.000Z`;
const buildDayEndIso = (value) => `${value}T23:59:59.999Z`;
const normalizeActionName = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const buildNotInFilterValue = (values = []) => {
  const safeValues = values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map((value) => `"${value.replace(/"/g, '\\"')}"`);

  return safeValues.length > 0 ? `(${safeValues.join(',')})` : '';
};

const applyLogSearch = (query, rawTerm, scope = 'all') => {
  const term = sanitizeSearchTerm(rawTerm);
  if (!term) return query;

  const numericId = Number(term);
  const expandedTerms = expandLogSearchTerms(term);
  const searchFilters = expandedTerms.flatMap((searchTerm) => {
    if (scope === 'user') return [`user.ilike.%${searchTerm}%`];
    if (scope === 'action') return [`action.ilike.%${searchTerm}%`, `reason.ilike.%${searchTerm}%`];
    return [
      `action.ilike.%${searchTerm}%`,
      `reason.ilike.%${searchTerm}%`,
      `user.ilike.%${searchTerm}%`,
    ];
  });

  if (Number.isFinite(numericId) && String(numericId) === term) {
    searchFilters.unshift(`id.eq.${numericId}`);
  }

  return query.or(searchFilters.join(','));
};

const applyLogActionFilter = (query, action) => {
  if (!action) return query;

  if (action === 'Venta Modificada') {
    return query.in('action', ['Venta Modificada', 'Modificación Pedido', 'Modificacion Pedido']);
  }

  return query.eq('action', action);
};

const applyLogUserFilter = (query, rawUserFilter) => {
  const filterValue = String(rawUserFilter || '').trim();
  if (!filterValue) return query;

  if (filterValue.startsWith('id:')) {
    const [idPart] = filterValue.split('|');
    const userId = idPart.slice(3).trim();
    return userId ? query.eq('user_id', userId) : query;
  }

  const normalizedNames = (filterValue.startsWith('name:') ? filterValue.slice(5) : filterValue)
    .split('|')
    .map((value) => sanitizeSearchTerm(value))
    .filter(Boolean);

  if (normalizedNames.length === 0) return query;
  if (normalizedNames.length === 1) {
    return query.ilike('user', `%${normalizedNames[0]}%`);
  }

  return query.or(normalizedNames.map((term) => `user.ilike.%${term}%`).join(','));
};

const isSearchLogsRpcUnavailable = (error) => {
  const errorText = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code,
  ].filter(Boolean).join(' ');

  return /search_logs|function .* does not exist|schema cache|PGRST202|permission denied|42501/i.test(errorText);
};

export default function useLogsFeed({
  page = 1,
  pageSize = LOGS_PAGE_SIZE,
  sortColumn = 'datetime',
  sortDirection = 'desc',
  filters = {},
  enabled = true,
  reloadKey = 0,
  includeDetails = false,
  excludeActions,
}) {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const requestIdRef = useRef(0);
  const pageCacheRef = useRef(new Map());
  const excludeActionsSource = useMemo(
    () => (Array.isArray(excludeActions) ? excludeActions : EMPTY_ARRAY),
    [excludeActions],
  );
  const rawActions = useMemo(
    () => (Array.isArray(filters.actions) ? filters.actions.filter(Boolean) : []),
    [filters.actions],
  );
  const rawProductSearchTerms = useMemo(
    () => (Array.isArray(filters.productSearchTerms) ? filters.productSearchTerms.filter(Boolean) : []),
    [filters.productSearchTerms],
  );
  const normalizedExcludedActions = useMemo(
    () => new Set(excludeActionsSource.map(normalizeActionName)),
    [excludeActionsSource],
  );
  const rawExcludedActions = useMemo(
    () => excludeActionsSource.filter(Boolean),
    [excludeActionsSource],
  );
  const excludedActionsFilterValue = useMemo(
    () => buildNotInFilterValue(rawExcludedActions),
    [rawExcludedActions],
  );

  const normalizedFilters = useMemo(
    () => ({
      dateStart: String(filters.dateStart || '').trim(),
      dateEnd: String(filters.dateEnd || '').trim(),
      user: String(filters.user || '').trim(),
      action: String(filters.action || '').trim(),
      search: String(filters.search || '').trim(),
      searchScope: String(filters.searchScope || 'all').trim() || 'all',
      productSearch: String(filters.productSearch || '').trim(),
      productSearchTerms: rawProductSearchTerms,
      actions: rawActions,
    }),
    [
      filters.action,
      filters.dateEnd,
      filters.dateStart,
      filters.productSearch,
      filters.search,
      filters.searchScope,
      filters.user,
      rawActions,
      rawProductSearchTerms,
    ]
  );
  const cacheKey = useMemo(
    () =>
      JSON.stringify({
        page,
        pageSize,
        sortColumn,
        sortDirection,
        includeDetails,
        excludedActions: rawExcludedActions,
        filters: normalizedFilters,
      }),
    [
      includeDetails,
      normalizedFilters,
      page,
      pageSize,
      rawExcludedActions,
      sortColumn,
      sortDirection,
    ],
  );

  useEffect(() => {
    pageCacheRef.current.clear();
  }, [reloadKey]);

  useEffect(() => {
    if (!enabled) return undefined;

    const cachedPage = pageCacheRef.current.get(cacheKey);
    if (cachedPage) {
      setLogs(cachedPage.logs);
      setHasNextPage(cachedPage.hasNextPage);
      setError(null);
      setIsLoading(false);
      return undefined;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const abortController = new AbortController();

    const run = async () => {
      setIsLoading(true);
      setError(null);
      setLogs([]);
      setHasNextPage(false);

      try {
        const offset = Math.max(0, (Number(page) - 1) * pageSize);
        const fetchLimit = pageSize + 1;
        const orderColumn =
          sortColumn === 'user' ? 'user_name' : sortColumn === 'action' ? 'action' : 'created_at';
        const ascending = sortDirection === 'asc';
        const requiresClientSearch = Boolean(
          normalizedFilters.productSearch ||
          (
            normalizedFilters.search &&
            !['user', 'action'].includes(normalizedFilters.searchScope)
          )
        );

        let safeSelect =
          includeDetails || normalizedFilters.search || normalizedFilters.productSearch
            ? CLOUD_SELECTS.logs
            : CLOUD_SELECTS.logsSummary;
        let safeOrderColumn = orderColumn;
        let safeUserFilter = normalizedFilters.user;
        let data = null;

        const applyBaseFilters = (baseQuery, userFilterValue) => {
          let nextQuery = baseQuery;

          if (normalizedFilters.actions.length > 0) {
            nextQuery = nextQuery.in('action', normalizedFilters.actions);
          }

          if (excludedActionsFilterValue) {
            nextQuery = nextQuery.not('action', 'in', excludedActionsFilterValue);
          }

          nextQuery = applyLogActionFilter(nextQuery, normalizedFilters.action);
          nextQuery = applyLogUserFilter(nextQuery, userFilterValue);

          if (normalizedFilters.dateStart) {
            nextQuery = nextQuery.gte('created_at', buildDayStartIso(normalizedFilters.dateStart));
          }

          if (normalizedFilters.dateEnd) {
            nextQuery = nextQuery.lte('created_at', buildDayEndIso(normalizedFilters.dateEnd));
          }

          return nextQuery;
        };

        const fetchServerSearchRows = async () => {
          const rpcSortColumn =
            orderColumn === 'user_name' ? 'user' : orderColumn === 'action' ? 'action' : 'created_at';
          const rpcParams = {
            p_search: normalizedFilters.search || '',
            p_search_scope: normalizedFilters.searchScope || 'all',
            p_product_terms: normalizedFilters.productSearch ? normalizedFilters.productSearchTerms : [],
            p_actions: normalizedFilters.actions,
            p_excluded_actions: rawExcludedActions,
            p_action: normalizedFilters.action || '',
            p_user_filter: normalizedFilters.user || '',
            p_date_start: normalizedFilters.dateStart ? buildDayStartIso(normalizedFilters.dateStart) : null,
            p_date_end: normalizedFilters.dateEnd ? buildDayEndIso(normalizedFilters.dateEnd) : null,
            p_sort_column: rpcSortColumn,
            p_ascending: ascending,
            p_offset: offset,
            p_limit: fetchLimit,
          };

          // Prefer the summary RPC so a search page does not download every JSON
          // detail. Older databases transparently fall back to the legacy RPC.
          const summaryResult = await supabase.rpc('search_logs_summary', rpcParams);
          if (!summaryResult.error) {
            return Array.isArray(summaryResult.data) ? summaryResult.data : [];
          }

          if (!isSearchLogsRpcUnavailable(summaryResult.error)) {
            throw summaryResult.error;
          }

          const { data: rpcData, error: rpcError } = await supabase.rpc('search_logs', rpcParams);

          if (rpcError) {
            if (isSearchLogsRpcUnavailable(rpcError)) return null;
            throw rpcError;
          }

          return Array.isArray(rpcData) ? rpcData : [];
        };

        const fetchClientSearchRows = async () => {
          let scanSelect = CLOUD_SELECTS.logs;
          let scanOrderColumn = orderColumn;
          let scanUserFilter = normalizedFilters.user;
          const matches = [];
          const requiredMatches = offset + fetchLimit;
          let scanOffset = 0;
          const scanMaxRows =
            normalizedFilters.dateStart || normalizedFilters.dateEnd
              ? DETAILS_SEARCH_MAX_ROWS_WITH_DATE
              : DETAILS_SEARCH_MAX_ROWS_UNBOUNDED;

          while (scanSelect && scanOffset < scanMaxRows && matches.length < requiredMatches) {
            let query = supabase
              .from('logs')
              .select(scanSelect)
              .abortSignal(abortController.signal);

            query = applyBaseFilters(query, scanUserFilter);
            query = query.order(scanOrderColumn, { ascending });
            if (scanOrderColumn !== 'created_at') {
              query = query.order('created_at', { ascending: false });
            }
            query = query
              .order('id', { ascending: false })
              .range(scanOffset, scanOffset + DETAILS_SEARCH_BATCH_SIZE - 1);

            const { data: batchData, error: scanError } = await query;

            if (scanError) {
              if (scanUserFilter.startsWith('id:')) {
                const fallbackName = scanUserFilter.split('|name:')[1]?.trim() || '';
                if (fallbackName) {
                  scanUserFilter = `name:${fallbackName}`;
                  scanOffset = 0;
                  matches.length = 0;
                  continue;
                }
              }

              const missingColumn = extractSchemaMissingColumn(scanError);
              if (!missingColumn) throw scanError;

              const normalizedMissingColumn = String(missingColumn).trim().toLowerCase();
              if (normalizedMissingColumn === String(scanOrderColumn).trim().toLowerCase()) {
                scanOrderColumn = 'created_at';
                scanOffset = 0;
                matches.length = 0;
                continue;
              }

              const nextSelect = removeColumnFromSelect(scanSelect, missingColumn);
              if (!nextSelect || nextSelect === scanSelect) throw scanError;
              scanSelect = nextSelect;
              scanOffset = 0;
              matches.length = 0;
              continue;
            }

            const batchRows = Array.isArray(batchData) ? batchData : [];
            batchRows.forEach((row) => {
              const matchesTextSearch = normalizedFilters.search
                ? logRowMatchesClientSearch(row, normalizedFilters.search, normalizedFilters.searchScope)
                : true;
              const matchesProductSearch = normalizedFilters.productSearch
                ? logRowMatchesProductSearch(row, normalizedFilters.productSearchTerms)
                : true;

              if (matchesTextSearch && matchesProductSearch) {
                matches.push(row);
              }
            });

            if (batchRows.length < DETAILS_SEARCH_BATCH_SIZE) {
              break;
            }

            scanOffset += DETAILS_SEARCH_BATCH_SIZE;
          }

          return matches.slice(offset, offset + fetchLimit);
        };

        if (requiresClientSearch) {
          data = await fetchServerSearchRows();
          if (!data) {
            data = await fetchClientSearchRows();
          }
        } else {
        while (safeSelect) {
          let query = supabase
            .from('logs')
            .select(safeSelect)
            .abortSignal(abortController.signal);

          query = applyBaseFilters(query, safeUserFilter);
          query = applyLogSearch(query, normalizedFilters.search, normalizedFilters.searchScope);

          query = query.order(safeOrderColumn, { ascending });
          if (safeOrderColumn !== 'created_at') {
            query = query.order('created_at', { ascending: false });
          }
          query = query.order('id', { ascending: false }).range(offset, offset + fetchLimit - 1);

          const { data: nextData, error: queryError } = await query;
          if (!queryError) {
            data = nextData;
            break;
          }

          if (safeUserFilter.startsWith('id:')) {
            const fallbackName = safeUserFilter.split('|name:')[1]?.trim() || '';
            if (fallbackName) {
              safeUserFilter = `name:${fallbackName}`;
              continue;
            }
          }

          const missingColumn = extractSchemaMissingColumn(queryError);
          if (!missingColumn) throw queryError;

          const normalizedMissingColumn = String(missingColumn).trim().toLowerCase();
          if (normalizedMissingColumn === String(safeOrderColumn).trim().toLowerCase()) {
            safeOrderColumn = 'created_at';
            continue;
          }

          const nextSelect = removeColumnFromSelect(safeSelect, missingColumn);
          if (!nextSelect || nextSelect === safeSelect) throw queryError;
          safeSelect = nextSelect;
        }
        }

        if (abortController.signal.aborted || requestIdRef.current !== requestId) return;

        const pageRows = Array.isArray(data) ? data : [];
        const currentRows = pageRows.slice(0, pageSize);

        // Details remain lazy and are fetched only when the user opens a row.
        const mappedRows = mapLogRecords(currentRows).filter(
          (log) => !normalizedExcludedActions.has(normalizeActionName(log?.action)),
        );

        const nextHasNextPage = pageRows.length > pageSize;
        pageCacheRef.current.set(cacheKey, {
          logs: mappedRows,
          hasNextPage: nextHasNextPage,
        });
        setHasNextPage(nextHasNextPage);
        setLogs(mappedRows);
      } catch (nextError) {
        if (abortController.signal.aborted) return;
        if (requestIdRef.current !== requestId) return;
        setLogs([]);
        setHasNextPage(false);
        setError(nextError);
      } finally {
        if (!abortController.signal.aborted && requestIdRef.current === requestId) {
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      abortController.abort();
    };
  }, [
    enabled,
    normalizedFilters,
    page,
    pageSize,
    reloadKey,
    sortColumn,
    sortDirection,
    includeDetails,
    excludedActionsFilterValue,
    normalizedExcludedActions,
    rawExcludedActions,
    cacheKey,
  ]);

  return {
    logs,
    isLoading,
    error,
    hasNextPage,
  };
}
