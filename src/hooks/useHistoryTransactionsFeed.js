import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase/client';
import { mapLogRecords, mapSaleRecords } from '../utils/cloudMappers';
import { CLOUD_SELECTS, HISTORY_LOG_ACTIONS, LOGS_PAGE_SIZE } from '../utils/cloudSelects';
import {
  extractSchemaMissingColumn,
  removeColumnFromSelect,
} from '../utils/supabaseSchemaFallback';

const buildDayStartIso = (value) => `${value}T00:00:00.000Z`;
const buildDayEndIso = (value) => `${value}T23:59:59.999Z`;

export default function useHistoryTransactionsFeed({
  enabled = true,
  page = 1,
  pageSize = LOGS_PAGE_SIZE,
  sortDirection = 'desc',
  filters = {},
  reloadKey = 0,
}) {
  const [transactions, setTransactions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const requestIdRef = useRef(0);
  const pageCacheRef = useRef(new Map());

  const normalizedFilters = useMemo(
    () => ({
      dateStart: String(filters.dateStart || '').trim(),
      dateEnd: String(filters.dateEnd || '').trim(),
      hasWideScan: Boolean(filters.hasWideScan),
    }),
    [filters.dateEnd, filters.dateStart, filters.hasWideScan],
  );

  const extraWindowPages = normalizedFilters.hasWideScan ? 2 : 1;
  const windowPageCount = Math.max(1, Number(page) || 1) + extraWindowPages;
  const fetchLimit = Math.max(pageSize, windowPageCount * pageSize);
  const ascending = sortDirection === 'asc';

  const cacheKey = useMemo(
    () =>
      JSON.stringify({
        fetchLimit,
        sortDirection,
        filters: normalizedFilters,
      }),
    [fetchLimit, normalizedFilters, sortDirection],
  );

  useEffect(() => {
    pageCacheRef.current.clear();
  }, [reloadKey]);

  useEffect(() => {
    if (!enabled) return undefined;

    const cachedWindow = pageCacheRef.current.get(cacheKey);
    if (cachedWindow) {
      setTransactions(cachedWindow.transactions);
      setLogs(cachedWindow.logs || []);
      setHasMore(cachedWindow.hasMore);
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

      try {
        let safeSelect = CLOUD_SELECTS.salesHistorySummary;
        let data = null;
        let logsData = null;

        while (safeSelect) {
          let query = supabase
            .from('sales')
            .select(safeSelect)
            .abortSignal(abortController.signal);

          if (normalizedFilters.dateStart) {
            query = query.gte('created_at', buildDayStartIso(normalizedFilters.dateStart));
          }

          if (normalizedFilters.dateEnd) {
            query = query.lte('created_at', buildDayEndIso(normalizedFilters.dateEnd));
          }

          query = query
            .order('created_at', { ascending })
            .order('id', { ascending })
            .limit(fetchLimit + 1);

          const { data: nextData, error: queryError } = await query;
          if (!queryError) {
            data = nextData;
            break;
          }

          const missingColumn = extractSchemaMissingColumn(queryError);
          if (!missingColumn) throw queryError;

          const nextSelect = removeColumnFromSelect(safeSelect, missingColumn);
          if (!nextSelect || nextSelect === safeSelect) throw queryError;
          safeSelect = nextSelect;
        }

        let safeLogsSelect = CLOUD_SELECTS.logs;
        while (safeLogsSelect) {
          let logsQuery = supabase
            .from('logs')
            .select(safeLogsSelect)
            .in('action', HISTORY_LOG_ACTIONS)
            .abortSignal(abortController.signal);

          if (normalizedFilters.dateStart) {
            logsQuery = logsQuery.gte('created_at', buildDayStartIso(normalizedFilters.dateStart));
          }

          if (normalizedFilters.dateEnd) {
            logsQuery = logsQuery.lte('created_at', buildDayEndIso(normalizedFilters.dateEnd));
          }

          logsQuery = logsQuery
            .order('created_at', { ascending })
            .order('id', { ascending })
            .limit(fetchLimit * 2 + 1);

          const { data: nextLogsData, error: logsError } = await logsQuery;
          if (!logsError) {
            logsData = nextLogsData;
            break;
          }

          const missingColumn = extractSchemaMissingColumn(logsError);
          if (!missingColumn) throw logsError;

          const nextLogsSelect = removeColumnFromSelect(safeLogsSelect, missingColumn);
          if (!nextLogsSelect || nextLogsSelect === safeLogsSelect) throw logsError;
          safeLogsSelect = nextLogsSelect;
        }

        if (abortController.signal.aborted || requestIdRef.current !== requestId) return;

        const rows = Array.isArray(data) ? data : [];
        const logsRows = Array.isArray(logsData) ? logsData : [];
        const trimmedRows = rows.slice(0, fetchLimit);
        const mappedLogs = mapLogRecords(logsRows);
        const mappedTransactions = mapSaleRecords(trimmedRows, mappedLogs);
        const nextHasMore = rows.length > fetchLimit;

        pageCacheRef.current.set(cacheKey, {
          transactions: mappedTransactions,
          logs: mappedLogs,
          hasMore: nextHasMore,
        });

        setTransactions(mappedTransactions);
        setLogs(mappedLogs);
        setHasMore(nextHasMore);
      } catch (nextError) {
        if (abortController.signal.aborted || requestIdRef.current !== requestId) return;
        setTransactions([]);
        setLogs([]);
        setHasMore(false);
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
  }, [ascending, cacheKey, enabled, fetchLimit, normalizedFilters]);

  return {
    transactions,
    logs,
    isLoading,
    error,
    hasMore,
  };
}
