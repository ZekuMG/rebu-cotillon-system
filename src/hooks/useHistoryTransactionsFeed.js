import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../supabase/client';
import { mapLogRecords, mapSaleRecords } from '../utils/cloudMappers';
import {
  CLOUD_SELECTS,
  HISTORY_EVENT_LOG_ACTIONS,
  HISTORY_SNAPSHOT_LOG_ACTIONS,
  LOGS_PAGE_SIZE,
} from '../utils/cloudSelects';
import {
  buildHistoryQueryArgs,
  getHistoryQueryCacheKey,
} from '../utils/historyServerQuery';
import {
  extractSchemaMissingColumn,
  removeColumnFromSelect,
} from '../utils/supabaseSchemaFallback';

/**
 * Feed del Historial de ventas.
 *
 * ANTES (hasta el 1-sep-2026) esto bajaba una VENTANA CRECIENTE: el limite era
 * `(pagina + 1) * 50`, sin `range`, asi que pasar a la pagina 10 volvia a bajar
 * las paginas 1 a 9. Y traia 201 logs completos por vuelta, entre ellos los
 * "Venta Realizada", que son 3.964 filas / 5,8 MB de `details`.
 * Con eso el encabezado sumaba solo lo descargado (mostraba ~$965.454 de un
 * total real de $32,7 M) y la busqueda solo encontraba lo que ya estaba bajado.
 *
 * AHORA cada pagina son tres pedidos chicos:
 *   1. `sales_history_page`  -> totales reales del filtro + los 50 ids de la pagina
 *   2. `sales` .in('id', …)  -> esas 50 filas y nada mas
 *   3. logs de eventos       -> una sola vez por recarga (221 filas acotadas)
 *
 * Los logs "Venta Realizada" ya NO se bajan en bloque: solo se piden los de las
 * ventas que de verdad los necesitan (16 ventas viejas sin `sale_items`) y los
 * de las 15 ventas que ya no tienen fila en `sales`.
 */

const EMPTY_TOTALS = { count: 0, amount: 0, matchCount: 0 };

const runSelectWithSchemaFallback = async (buildQuery, initialSelect) => {
  let safeSelect = initialSelect;

  while (safeSelect) {
    const { data, error } = await buildQuery(safeSelect);
    if (!error) return { data: data || [], error: null };

    const missingColumn = extractSchemaMissingColumn(error);
    if (!missingColumn) return { data: null, error };

    const nextSelect = removeColumnFromSelect(safeSelect, missingColumn);
    if (!nextSelect || nextSelect === safeSelect) return { data: null, error };
    safeSelect = nextSelect;
  }

  return { data: [], error: null };
};

const orderRowsBySaleIds = (rows = [], saleIds = []) => {
  const byId = new Map(rows.map((row) => [String(row.id), row]));
  return saleIds.map((id) => byId.get(String(id))).filter(Boolean);
};

/**
 * Ventas de la pagina a las que les falta el detalle. Son 16 en toda la base
 * (marzo a junio de 2026): filas de `sales` que quedaron sin `sale_items`. Para
 * esas, y solo para esas, se busca el log de creacion que guarda los items.
 */
const findSaleIdsNeedingSnapshot = (rows = []) =>
  rows
    .filter((row) => {
      const hasItems = Array.isArray(row?.sale_items) && row.sale_items.length > 0;
      const hasUser = Boolean(row?.user_name);
      return (!hasItems && Number(row?.total) > 0) || !hasUser;
    })
    .map((row) => String(row.id));

export default function useHistoryTransactionsFeed({
  enabled = true,
  page = 1,
  pageSize = LOGS_PAGE_SIZE,
  sortOrder = 'desc',
  viewMode = 'all',
  filterDateStart = '',
  filterDateEnd = '',
  filterPayment = '',
  filterCategory = '',
  searchQuery = '',
  selectedUserFilter = null,
  inventory = null,
  reloadKey = 0,
  pageReloadKey = 0,
}) {
  // Se guardan las filas CRUDAS, no el resultado de mapearlas. Los logs de
  // contexto llegan por su propio camino y pueden aterrizar despues que la
  // pagina: si se mapeara al vuelo, una venta anulada podria quedar dibujada
  // como normal hasta el proximo cambio de pagina.
  const [pageData, setPageData] = useState({ rows: [], snapshotLogs: [] });
  const [totals, setTotals] = useState(EMPTY_TOTALS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const [contextLogs, setContextLogs] = useState([]);
  const [orphanLogIds, setOrphanLogIds] = useState(() => new Set());
  const [isLoadingContext, setIsLoadingContext] = useState(false);

  const pageRequestRef = useRef(0);
  const pageCacheRef = useRef(new Map());

  const queryArgs = useMemo(
    () =>
      buildHistoryQueryArgs({
        viewMode,
        filterDateStart,
        filterDateEnd,
        filterPayment,
        filterCategory,
        searchQuery,
        sortOrder,
        selectedUserFilter,
        inventory: inventory || [],
        page,
        pageSize,
      }),
    [
      filterCategory,
      filterDateEnd,
      filterDateStart,
      filterPayment,
      inventory,
      page,
      pageSize,
      searchQuery,
      selectedUserFilter,
      sortOrder,
      viewMode,
    ],
  );

  const cacheKey = useMemo(() => getHistoryQueryCacheKey(queryArgs), [queryArgs]);

  // El efecto de abajo depende SOLO de `cacheKey` (un string) y lee los
  // argumentos de este ref. Si dependiera del objeto `queryArgs`, bastaria con
  // que la pantalla pasara un filtro sin memoizar para que cada render lo viera
  // como nuevo y disparara otra consulta a Supabase.
  const queryArgsRef = useRef(queryArgs);
  queryArgsRef.current = queryArgs;

  useEffect(() => {
    pageCacheRef.current.clear();
  }, [pageReloadKey, reloadKey]);

  // ---------------------------------------------------------------------
  // Logs de contexto: anulaciones, borrados, modificaciones y las ventas que
  // ya no tienen fila en `sales`. Es un conjunto ACOTADO (221 + 15 filas
  // medidas en prod) y no cambia al pasar de pagina, asi que se pide una sola
  // vez por recarga en vez de una vez por pagina.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!enabled) {
      setContextLogs([]);
      setOrphanLogIds(new Set());
      return undefined;
    }

    let cancelled = false;

    const run = async () => {
      setIsLoadingContext(true);
      try {
        const eventsResult = await runSelectWithSchemaFallback(
          (safeSelect) =>
            supabase
              .from('logs')
              .select(safeSelect)
              .in('action', HISTORY_EVENT_LOG_ACTIONS)
              .order('created_at', { ascending: false })
              .order('id', { ascending: false })
              .limit(2000),
          CLOUD_SELECTS.logs,
        );

        if (cancelled) return;
        if (eventsResult.error) throw eventsResult.error;

        // Las ventas borradas de la tabla se reconstruyen desde su log de
        // creacion. La funcion devuelve solo los ids de esos logs, para no
        // bajar los 3.964 "Venta Realizada" buscando los 15 que sirven.
        let orphanRows = [];
        const { data: orphanIds, error: orphanError } = await supabase.rpc(
          'sales_history_orphan_log_ids',
        );

        if (!orphanError && Array.isArray(orphanIds) && orphanIds.length > 0) {
          const orphanResult = await runSelectWithSchemaFallback(
            (safeSelect) => supabase.from('logs').select(safeSelect).in('id', orphanIds),
            CLOUD_SELECTS.logs,
          );
          if (!orphanResult.error) orphanRows = orphanResult.data || [];
        } else if (orphanError) {
          console.warn('[REBU][historial] no se pudieron ubicar las ventas sin fila:', orphanError);
        }

        if (cancelled) return;
        setContextLogs(mapLogRecords([...(eventsResult.data || []), ...orphanRows]));
        setOrphanLogIds(new Set(orphanRows.map((row) => String(row.id))));
      } catch (nextError) {
        if (cancelled) return;
        console.warn('[REBU][historial] no se pudieron cargar los logs de contexto:', nextError);
        setContextLogs([]);
        setOrphanLogIds(new Set());
      } finally {
        if (!cancelled) setIsLoadingContext(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [enabled, reloadKey]);

  // ---------------------------------------------------------------------
  // La pagina en si
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!enabled) return undefined;

    const cached = pageCacheRef.current.get(cacheKey);
    if (cached) {
      setPageData(cached.page);
      setTotals(cached.totals);
      setError(null);
      setIsLoading(false);
      return undefined;
    }

    const requestId = pageRequestRef.current + 1;
    pageRequestRef.current = requestId;
    let cancelled = false;
    const isStale = () => cancelled || pageRequestRef.current !== requestId;

    const run = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { data: summary, error: rpcError } = await supabase.rpc(
          'sales_history_page',
          queryArgsRef.current,
        );
        if (isStale()) return;
        if (rpcError) throw rpcError;

        const saleIds = Array.isArray(summary?.sale_ids) ? summary.sale_ids : [];
        const nextTotals = {
          count: Number(summary?.total_count || 0),
          amount: Number(summary?.total_amount || 0),
          matchCount: Number(summary?.match_count || 0),
        };

        if (saleIds.length === 0) {
          const emptyPage = { rows: [], snapshotLogs: [] };
          pageCacheRef.current.set(cacheKey, { page: emptyPage, totals: nextTotals });
          setPageData(emptyPage);
          setTotals(nextTotals);
          return;
        }

        const salesResult = await runSelectWithSchemaFallback(
          (safeSelect) => supabase.from('sales').select(safeSelect).in('id', saleIds),
          CLOUD_SELECTS.salesHistorySummary,
        );
        if (isStale()) return;
        if (salesResult.error) throw salesResult.error;

        const rows = orderRowsBySaleIds(salesResult.data || [], saleIds);

        // Solo si esta pagina toca una de las ventas viejas sin detalle se
        // pide su log de creacion. En una pagina normal esto no dispara nada.
        let snapshotLogs = [];
        const idsNeedingSnapshot = findSaleIdsNeedingSnapshot(rows);
        if (idsNeedingSnapshot.length > 0) {
          const snapshotResult = await runSelectWithSchemaFallback(
            (safeSelect) =>
              supabase
                .from('logs')
                .select(safeSelect)
                .in('action', HISTORY_SNAPSHOT_LOG_ACTIONS)
                .in('details->>transactionId', idsNeedingSnapshot),
            CLOUD_SELECTS.logs,
          );
          if (!snapshotResult.error) {
            snapshotLogs = mapLogRecords(snapshotResult.data || []);
          } else {
            console.warn(
              '[REBU][historial] no se pudo recuperar el detalle de ventas viejas:',
              snapshotResult.error,
            );
          }
        }

        if (isStale()) return;

        const nextPage = { rows, snapshotLogs };
        pageCacheRef.current.set(cacheKey, { page: nextPage, totals: nextTotals });
        setPageData(nextPage);
        setTotals(nextTotals);
      } catch (nextError) {
        if (isStale()) return;
        setPageData({ rows: [], snapshotLogs: [] });
        setTotals(EMPTY_TOTALS);
        setError(nextError);
      } finally {
        if (!isStale()) setIsLoading(false);
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
    // `pageReloadKey` refresca SOLO la pagina (una consulta de ~30 kB). Los logs
    // de contexto pesan 220 kB y no cambian al pasar de pagina: esos se rehacen
    // con `reloadKey`, o sea con el boton de recargar.
  }, [cacheKey, enabled, pageReloadKey, reloadKey]);

  // Mapear es barato (50 filas) y aca si depende de los logs: cuando llegan,
  // las ventas anuladas y modificadas se redibujan solas, sin volver a pedir
  // nada a Supabase.
  const transactions = useMemo(
    () => mapSaleRecords(pageData.rows, [...contextLogs, ...pageData.snapshotLogs]),
    [contextLogs, pageData],
  );

  const invalidate = useCallback(() => {
    pageCacheRef.current.clear();
  }, []);

  return {
    transactions,
    logs: contextLogs,
    // Ids de los logs de venta que ya no tienen fila en `sales`. La pantalla
    // reconstruye SOLO esos desde el log: cualquier otro log de creacion
    // duplicaria una venta que ya viene paginada del servidor.
    orphanLogIds,
    totals,
    isLoading: isLoading || isLoadingContext,
    error,
    invalidate,
  };
}
