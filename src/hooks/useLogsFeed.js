import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase/client';
import { mapLogRecords } from '../utils/cloudMappers';
import { CLOUD_SELECTS, LOGS_PAGE_SIZE } from '../utils/cloudSelects';
import {
  extractSchemaMissingColumn,
  removeColumnFromSelect,
  runSelectWithSchemaFallback,
} from '../utils/supabaseSchemaFallback';

const EMPTY_ARRAY = [];

const sanitizeSearchTerm = (value) =>
  String(value || '')
    .trim()
    .replace(/[,%()]/g, ' ')
    .replace(/\s+/g, ' ');

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

const applyLogSearch = (query, rawTerm) => {
  const term = sanitizeSearchTerm(rawTerm);
  if (!term) return query;

  const numericId = Number(term);
  const searchFilters = [
    `action.ilike.%${term}%`,
    `reason.ilike.%${term}%`,
    `user.ilike.%${term}%`,
  ];

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
  const excludeActionsSource = Array.isArray(excludeActions) ? excludeActions : EMPTY_ARRAY;
  const rawActions = Array.isArray(filters.actions) ? filters.actions.filter(Boolean) : [];
  const actionsKey = rawActions.join('|');
  const excludedActionsKey = excludeActionsSource
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join('|');
  const normalizedExcludedActions = useMemo(
    () => new Set(excludeActionsSource.map(normalizeActionName)),
    [excludedActionsKey],
  );
  const rawExcludedActions = useMemo(
    () => excludeActionsSource.filter(Boolean),
    [excludedActionsKey],
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
      actions: rawActions,
    }),
    [actionsKey, filters.action, filters.dateEnd, filters.dateStart, filters.search, filters.user]
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

        let safeSelect =
          includeDetails || normalizedFilters.search
            ? CLOUD_SELECTS.logs
            : CLOUD_SELECTS.logsSummary;
        let safeOrderColumn = orderColumn;
        let safeUserFilter = normalizedFilters.user;
        let data = null;

        while (safeSelect) {
          let query = supabase
            .from('logs')
            .select(safeSelect)
            .abortSignal(abortController.signal);

          if (normalizedFilters.actions.length > 0) {
            query = query.in('action', normalizedFilters.actions);
          }

          if (excludedActionsFilterValue) {
            query = query.not('action', 'in', excludedActionsFilterValue);
          }

          query = applyLogActionFilter(query, normalizedFilters.action);
          query = applyLogSearch(query, normalizedFilters.search);

          query = applyLogUserFilter(query, safeUserFilter);

          if (normalizedFilters.dateStart) {
            query = query.gte('created_at', buildDayStartIso(normalizedFilters.dateStart));
          }

          if (normalizedFilters.dateEnd) {
            query = query.lte('created_at', buildDayEndIso(normalizedFilters.dateEnd));
          }

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

        if (abortController.signal.aborted || requestIdRef.current !== requestId) return;

        const pageRows = Array.isArray(data) ? data : [];
        const currentRows = pageRows.slice(0, pageSize);
        let finalRows = currentRows;

        if (!includeDetails && !normalizedFilters.search) {
          const rowIds = currentRows.map((row) => row?.id).filter(Boolean);

          if (rowIds.length > 0) {
            const detailResult = await runSelectWithSchemaFallback(
              (detailSelect) =>
                supabase
                  .from('logs')
                  .select(detailSelect)
                  .in('id', rowIds)
                  .abortSignal(abortController.signal),
              CLOUD_SELECTS.logs
            );

            if (!detailResult?.error && Array.isArray(detailResult?.data)) {
              const detailMap = new Map(
                detailResult.data.map((row) => [String(row?.id), row])
              );

              finalRows = currentRows.map((row) => detailMap.get(String(row?.id)) || row);
            }
          }
        }

        const mappedRows = mapLogRecords(finalRows).filter(
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
    actionsKey,
    enabled,
    normalizedFilters.action,
    normalizedFilters.dateEnd,
    normalizedFilters.dateStart,
    normalizedFilters.search,
    normalizedFilters.user,
    page,
    pageSize,
    reloadKey,
    sortColumn,
    sortDirection,
    includeDetails,
    excludedActionsFilterValue,
    normalizedExcludedActions,
    cacheKey,
  ]);

  return {
    logs,
    isLoading,
    error,
    hasNextPage,
  };
}
