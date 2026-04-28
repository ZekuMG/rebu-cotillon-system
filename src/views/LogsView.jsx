import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import AsyncActionButton from '../components/AsyncActionButton';
import LogsControls from '../components/ActionLogs/LogsControls';
import LogsTable from '../components/ActionLogs/LogsTable';
import { ACTION_GROUPS, normalizeLogAction } from '../components/ActionLogs/logHelpers';
import useDebouncedValue from '../hooks/useDebouncedValue';
import useLogsFeed from '../hooks/useLogsFeed';
import { LOGS_PAGE_SIZE, SESSION_LOG_ACTIONS } from '../utils/cloudSelects';
import { CLOUD_SELECTS } from '../utils/cloudSelects';
import {
  buildRemoteUserFilterValue,
  buildUnifiedUserFilterOptions,
  matchesUnifiedUserFilter,
} from '../utils/userFilters';
import { supabase } from '../supabase/client';
import { mapLogRecords } from '../utils/cloudMappers';
import { runSelectWithSchemaFallback } from '../utils/supabaseSchemaFallback';

const LogDetailModal = lazy(() => import('../components/ActionLogs/LogDetailModal'));

const ALL_LOG_ACTIONS = ACTION_GROUPS.flatMap((group) => group.actions);
const HIDDEN_ACTIONS_IN_GENERAL_LOGS = new Set(
  SESSION_LOG_ACTIONS.map((action) => normalizeLogAction(action))
);
const LOGS_SEARCH_SCAN_PAGES = 2;
const buildUserFilterLabel = (presentation, user, duplicateCount = 1) => {
  if (duplicateCount <= 1) return presentation.displayName;

  const suffixParts = [];
  if (user?.role) suffixParts.push(user.role);
  if (user?.id) suffixParts.push(String(user.id).slice(-4));

  return suffixParts.length > 0
    ? `${presentation.displayName} · ${suffixParts.join(' · ')}`
    : presentation.displayName;
};

const formatFullDate = (isoString) => {
  if (!isoString) return '--/--/---- --:--';

  try {
    const d = new Date(isoString);
    const datePart = d.toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    });
    const timePart = d.toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${datePart} a las ${timePart} hs`;
  } catch {
    return '--/--/---- --:--';
  }
};

const retrofitLogDetails = (log) => {
  if (log.action !== 'Edición de Socio') return log.details;

  let details = log.details;
  if (!details || typeof details !== 'object') return details;

  if (details.changes && Array.isArray(details.changes) && details.changes.length > 0) {
    return details;
  }

  const changes = [];
  const result = {
    ...details,
  };

  if (details.updates && typeof details.updates === 'object') {
    result.name = result.name || details.updates.name;
    result.memberName = result.memberName || details.updates.memberName;
    result.number = result.number || details.updates.memberNumber || details.updates.number;
    result.memberNumber = result.memberNumber || details.updates.memberNumber;
    result.dni = result.dni || details.updates.dni;
    result.phone = result.phone || details.updates.phone;
    result.email = result.email || details.updates.email;
    result.extraInfo = result.extraInfo || details.updates.extraInfo;
    result.address = result.address || details.updates.address;
    result.oldPoints =
      result.oldPoints !== undefined
        ? result.oldPoints
        : details.updates.oldPoints !== undefined
          ? details.updates.oldPoints
          : undefined;
    result.newPoints =
      result.newPoints !== undefined
        ? result.newPoints
        : details.updates.newPoints !== undefined
          ? details.updates.newPoints
          : undefined;
    result.pointsDelta =
      result.pointsDelta !== undefined ? result.pointsDelta : details.updates.pointsDelta;

    if (!result.changes && details.updates.changes) {
      result.changes = details.updates.changes;
    }
    if (!result.changedFields && details.updates.changedFields) {
      result.changedFields = details.updates.changedFields;
    }
  }

  if (!result.name && (details.member || details.memberName || details.newName)) {
    result.name = details.member || details.memberName || details.newName;
  }
  if (!result.number && (details.memberNumber || details.member_number)) {
    result.number = details.memberNumber || details.member_number;
  }

  const hasOldPoints = result.oldPoints !== undefined && result.oldPoints !== null;
  const hasNewPoints = result.newPoints !== undefined && result.newPoints !== null;
  const pointsChanged =
    hasOldPoints && hasNewPoints && Number(result.oldPoints) !== Number(result.newPoints);

  if (pointsChanged) {
    changes.push({
      field: 'Puntos',
      old: Number(result.oldPoints),
      new: Number(result.newPoints),
      isPrice: false,
    });
  }

  if (details.oldName && details.newName && details.oldName !== details.newName) {
    changes.push({ field: 'Nombre', old: details.oldName, new: details.newName });
  }
  if (details.oldDni && details.newDni && details.oldDni !== details.newDni) {
    changes.push({ field: 'DNI', old: details.oldDni || '--', new: details.newDni || '--' });
  }
  if (details.oldPhone && details.newPhone && details.oldPhone !== details.newPhone) {
    changes.push({ field: 'Teléfono', old: details.oldPhone || '--', new: details.newPhone || '--' });
  }
  if (details.oldEmail && details.newEmail && details.oldEmail !== details.newEmail) {
    changes.push({ field: 'Email', old: details.oldEmail || '--', new: details.newEmail || '--' });
  }

  if (details.changedFields && Array.isArray(details.changedFields) && details.changedFields.length > 0) {
    details.changedFields.forEach((fieldStr) => {
      const match = fieldStr.match(/^(.*?)\s*\(([+-]?\d+)\)$/);
      if (!match) return;

      const fieldName = match[1].trim();
      const delta = Number.parseInt(match[2], 10);

      if (fieldName === 'Puntos' && hasOldPoints && !changes.some((entry) => entry.field === 'Puntos')) {
        const oldPts = Number(result.oldPoints);
        changes.push({
          field: 'Puntos',
          old: oldPts,
          new: oldPts + delta,
          isPrice: false,
        });
      }
    });
  }

  if (
    result.pointsDelta !== undefined &&
    result.pointsDelta !== 0 &&
    hasOldPoints &&
    !changes.some((entry) => entry.field === 'Puntos')
  ) {
    const oldPts = Number(result.oldPoints);
    changes.push({
      field: 'Puntos',
      old: oldPts,
      new: oldPts + Number(result.pointsDelta),
      isPrice: false,
    });
  }

  if (changes.length > 0) {
    result.changes = changes;
  }

  return result;
};

export default function LogsView({
  initialLogs = [],
  onUpdateLogNote,
  onReprintPdf,
  userCatalog,
  isActive = false,
  onSoftReload,
}) {
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [sortColumn, setSortColumn] = useState('datetime');
  const [sortDirection, setSortDirection] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState(null);
  const [isSelectedLogLoading, setIsSelectedLogLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [isManualReloading, setIsManualReloading] = useState(false);
  const [noteOverrides, setNoteOverrides] = useState({});

  const debouncedSearch = useDebouncedValue(filterSearch, 350);
  const hasSearchTerm = debouncedSearch.trim().length > 0;
  const hasUserFilter = Boolean(filterUser);
  const shouldUseWideScan = hasSearchTerm || hasUserFilter;
  const hadRemoteDataRef = React.useRef(false);
  const wasActiveRef = React.useRef(isActive);
  const remoteUserFilterValue = useMemo(
    () => (filterUser ? buildRemoteUserFilterValue(filterUser) : ''),
    [filterUser],
  );

  const {
    logs: remoteLogs,
    isLoading,
    error,
    hasNextPage,
  } = useLogsFeed({
    enabled: isActive,
    page: shouldUseWideScan ? 1 : currentPage,
    pageSize: shouldUseWideScan ? LOGS_PAGE_SIZE * LOGS_SEARCH_SCAN_PAGES : LOGS_PAGE_SIZE,
    sortColumn,
    sortDirection,
    reloadKey,
    filters: {
      dateStart: filterDateStart,
      dateEnd: filterDateEnd,
      user: remoteUserFilterValue,
      action: filterAction,
      search: '',
    },
    includeDetails: false,
    excludeActions: SESSION_LOG_ACTIONS,
  });

  const hasActiveFilters = Boolean(
    filterDateStart || filterDateEnd || filterUser || filterAction || filterSearch
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filterDateStart, filterDateEnd, filterUser, filterAction, debouncedSearch, sortColumn, sortDirection]);

  const fallbackLogs = useMemo(
    () => (Array.isArray(initialLogs) ? initialLogs : []),
    [initialLogs]
  );

  const rawLogs = useMemo(() => remoteLogs, [remoteLogs]);

  const processedLogs = useMemo(() => {
    const safeLogs = Array.isArray(rawLogs) ? rawLogs : [];

    return safeLogs
      .filter((log) => !HIDDEN_ACTIONS_IN_GENERAL_LOGS.has(normalizeLogAction(log?.action)))
      .map((log) => {
      let finalDetails = log.details;
      if (typeof finalDetails === 'string') {
        try {
          finalDetails = JSON.parse(finalDetails);
        } catch {
          finalDetails = log.details;
        }
      }

      const patchedReason = noteOverrides[log.id] ?? log.reason;
      const retrofittedDetails = retrofitLogDetails({ ...log, details: finalDetails });
      const createdAt = log.created_at || log.rawCreatedAt || null;

        return {
          ...log,
          reason: patchedReason,
          details: retrofittedDetails,
          rawCreatedAt: createdAt,
          displayCreatedAt: formatFullDate(createdAt),
        };
      });
  }, [noteOverrides, rawLogs]);

  const searchFilteredLogs = useMemo(() => {
    const normalizedSearch = debouncedSearch.toLowerCase().trim();
    if (!normalizedSearch || normalizedSearch === 'test') {
      return processedLogs;
    }

    return processedLogs.filter((log) => {
      const detailsText =
        typeof log.details === 'string'
          ? log.details
          : JSON.stringify(log.details || {});

      const searchIndex = [
        log.id,
        log.action,
        log.user,
        log.reason,
        log.displayCreatedAt,
        log.created_at,
        detailsText,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchIndex.includes(normalizedSearch);
    });
  }, [debouncedSearch, processedLogs]);

  const userFilterOptions = useMemo(() => {
    return buildUnifiedUserFilterOptions({
      catalogUsers: userCatalog?.all,
      records: processedLogs,
      userCatalog,
    });
  }, [processedLogs, userCatalog]);

  const selectedUserFilter = useMemo(
    () => userFilterOptions.find((option) => option.key === filterUser) || null,
    [filterUser, userFilterOptions],
  );

  const visibleLogs = useMemo(() => {
    const searchingTest = filterSearch.toLowerCase().trim() === 'test';

    return searchFilteredLogs.filter((log) => {
      if (selectedUserFilter && !matchesUnifiedUserFilter(log, selectedUserFilter, userCatalog)) {
        return false;
      }

      const isTestLog =
        log.isTest ||
        (log.details && log.details.isTest) ||
        (log.details && log.details.testMarker === 'test');

      if (isTestLog) return searchingTest;
      return !searchingTest;
    });
  }, [filterSearch, searchFilteredLogs, selectedUserFilter, userCatalog]);

  const paginatedVisibleLogs = useMemo(() => {
    if (!shouldUseWideScan) return visibleLogs;

    const offset = Math.max(0, (currentPage - 1) * LOGS_PAGE_SIZE);
    return visibleLogs.slice(offset, offset + LOGS_PAGE_SIZE);
  }, [currentPage, shouldUseWideScan, visibleLogs]);

  useEffect(() => {
    if (remoteLogs.length > 0) {
      hadRemoteDataRef.current = true;
    }
  }, [remoteLogs]);

  useEffect(() => {
    const wasActive = wasActiveRef.current;
    wasActiveRef.current = isActive;

    if (!isActive || wasActive) return;
    if (!error && hadRemoteDataRef.current) return;

    setReloadKey((prev) => prev + 1);
  }, [error, isActive]);

  const hasRemoteLoadError = Boolean(error);
  const showRemoteLoadingState = isActive && isLoading && remoteLogs.length === 0 && fallbackLogs.length === 0;
  const showEmptyRemoteState =
    isActive &&
    !isLoading &&
    !hasRemoteLoadError &&
    visibleLogs.length === 0 &&
    !hasActiveFilters;
  const canGoNextPage = shouldUseWideScan ? currentPage * LOGS_PAGE_SIZE < visibleLogs.length : hasNextPage;
  const totalKnownPages = shouldUseWideScan ? Math.max(1, Math.ceil(visibleLogs.length / LOGS_PAGE_SIZE)) : null;
  const visiblePageNumbers = useMemo(() => {
    const start = Math.max(1, currentPage - 3);
    const end = totalKnownPages
      ? Math.min(totalKnownPages, currentPage + 3)
      : currentPage + (canGoNextPage ? 3 : 0);

    const pages = [];
    for (let pageNumber = start; pageNumber <= end; pageNumber += 1) {
      pages.push(pageNumber);
    }
    return pages;
  }, [canGoNextPage, currentPage, totalKnownPages]);

  const uniqueActions = useMemo(
    () => [...new Set([...ALL_LOG_ACTIONS, ...visibleLogs.map((log) => log.action).filter(Boolean)])],
    [visibleLogs]
  );

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortColumn(column);
    setSortDirection('desc');
  };

  const clearAllFilters = () => {
    setFilterDateStart('');
    setFilterDateEnd('');
    setFilterUser('');
    setFilterAction('');
    setFilterSearch('');
  };

  const handleSaveNote = async (logId, newNote) => {
    if (!onUpdateLogNote) return;

    await onUpdateLogNote(logId, newNote);
    setNoteOverrides((prev) => ({ ...prev, [logId]: newNote }));
    setSelectedLog((prev) => (prev && prev.id === logId ? { ...prev, reason: newNote } : prev));
  };

  const handleSoftReload = async () => {
    setIsManualReloading(true);
    try {
      if (onSoftReload) {
        await onSoftReload();
      }
      setReloadKey((prev) => prev + 1);
    } finally {
      setIsManualReloading(false);
    }
  };

  const hydrateLogForDetail = async (log) => {
    if (!log?.id || log.details !== undefined) {
      setSelectedLog(log);
      return;
    }

    setSelectedLog(log);
    setIsSelectedLogLoading(true);

    try {
      const result = await runSelectWithSchemaFallback(
        (safeSelect) =>
          supabase
            .from('logs')
            .select(safeSelect)
            .eq('id', log.id)
            .maybeSingle(),
        CLOUD_SELECTS.logs
      );

      if (result?.error || !result?.data) return;

      const mappedLog = mapLogRecords([result.data])[0];
      if (!mappedLog) return;

      const patchedReason = noteOverrides[mappedLog.id] ?? mappedLog.reason;
      const retrofittedDetails = retrofitLogDetails({ ...mappedLog, details: mappedLog.details });
      const createdAt = mappedLog.created_at || mappedLog.rawCreatedAt || null;

      setSelectedLog({
        ...mappedLog,
        reason: patchedReason,
        details: retrofittedDetails,
        rawCreatedAt: createdAt,
        displayCreatedAt: formatFullDate(createdAt),
      });
    } finally {
      setIsSelectedLogLoading(false);
    }
  };

  if (hasRemoteLoadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border border-rose-200 bg-white px-6 text-center shadow-sm">
        <AlertTriangle size={32} className="text-rose-500" />
        <p className="mt-3 text-sm font-black uppercase tracking-[0.18em] text-rose-500">
          Error cargando logs
        </p>
        <p className="mt-2 max-w-md text-sm font-medium text-slate-500">
          No pudimos traer la bitácora desde Supabase. No hay reintentos automáticos activos para evitar loops de tráfico.
        </p>
        <button
          type="button"
          onClick={() => setReloadKey((prev) => prev + 1)}
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-slate-600 transition hover:bg-slate-50"
        >
          <RefreshCw size={13} />
          Reintentar
        </button>
      </div>
    );
  }

  if (showRemoteLoadingState) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-center shadow-sm">
        <RefreshCw size={32} className="animate-spin text-fuchsia-500" />
        <p className="mt-3 text-sm font-black uppercase tracking-[0.18em] text-slate-500">
          Cargando registro...
        </p>
        <p className="mt-2 max-w-md text-sm font-medium text-slate-500">
          Esto puede demorar un poco
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-full flex flex-col">
      <LogsControls
        totalLogs={visibleLogs.length}
        uniqueActions={uniqueActions}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={() => {
          clearAllFilters();
          setCurrentPage(1);
        }}
        filterDateStart={filterDateStart}
        setFilterDateStart={setFilterDateStart}
        filterDateEnd={filterDateEnd}
        setFilterDateEnd={setFilterDateEnd}
        filterUser={filterUser}
        setFilterUser={setFilterUser}
        userFilterOptions={userFilterOptions}
        filterAction={filterAction}
        setFilterAction={setFilterAction}
        filterSearch={filterSearch}
        setFilterSearch={setFilterSearch}
      />

      {hasRemoteLoadError && (
        <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700">
          No pudimos cargar la bitacora completa desde Supabase.
          {fallbackLogs.length > 0
            ? ' Te mostramos actividad reciente local mientras tanto.'
            : ' Reintentá para recuperar el historial completo.'}
        </div>
      )}


      {showEmptyRemoteState && (
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-6 text-center">
          <p className="text-sm font-bold text-slate-600">Supabase respondió sin acciones visibles.</p>
          <p className="mt-1 text-xs font-medium text-slate-500">
            Si sabés que existen logs, podés reintentar la consulta remota.
          </p>
          <button
            type="button"
            onClick={() => setReloadKey((prev) => prev + 1)}
            className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-slate-600 transition hover:bg-slate-50"
          >
            <RefreshCw size={13} />
            Reintentar lectura remota
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center border-t border-slate-100 bg-white px-6 text-center">
          <div>
            <RefreshCw size={36} className="mx-auto animate-spin text-fuchsia-500" />
            <p className="mt-4 text-lg font-black text-slate-700">Cargando registro...</p>
            <p className="mt-2 text-sm font-medium text-slate-500">Esto puede demorar un poco</p>
            {hasSearchTerm ? (
              <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                Busqueda local ampliada
              </p>
            ) : null}
          </div>
        </div>
      ) : (
        <LogsTable
          sortedLogs={paginatedVisibleLogs}
          sortColumn={sortColumn}
          sortDirection={sortDirection}
          onSort={handleSort}
          onViewDetails={hydrateLogForDetail}
          selectedLogId={selectedLog?.id}
          userCatalog={userCatalog}
        />
      )}

      <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between shrink-0">
        <span className="text-[11px] text-slate-500">
          Página <span className="font-bold text-slate-700">{currentPage}</span>
          <span className="ml-2 text-[10px] text-slate-400">
            ({visibleLogs.length} registros en esta página)
          </span>
        </span>

        <div className="flex items-center gap-1">
          <AsyncActionButton
            type="button"
            onAction={() => handleSoftReload()}
            pending={isManualReloading}
            disabled={isManualReloading}
            loadingLabel="Recargando..."
            className="inline-flex h-6 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
            title="Actualizar solo el registro de acciones"
          >
            <RefreshCw size={11} className={isManualReloading ? 'animate-spin' : ''} />
            Soft reload
          </AsyncActionButton>
          <button
            type="button"
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage <= 1}
            className="p-1 rounded-lg border border-slate-200 hover:bg-white hover:border-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Página anterior"
          >
            <ChevronLeft size={13} />
          </button>

          <button
            type="button"
            onClick={() => setReloadKey((prev) => prev + 1)}
            className="hidden px-2 h-6 rounded-lg border border-slate-200 text-[10px] font-bold text-slate-600 hover:bg-white hover:border-slate-300 transition-colors"
            title="Actualizar página actual"
          >
            Actualizar
          </button>

          {visiblePageNumbers.map((pageNumber) => (
            <button
              key={pageNumber}
              type="button"
              onClick={() => setCurrentPage(pageNumber)}
              className={`min-w-[28px] h-6 rounded-lg border px-2 text-[10px] font-bold transition-colors ${
                pageNumber === currentPage
                  ? 'border-fuchsia-200 bg-fuchsia-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
              title={`Ir a la página ${pageNumber}`}
            >
              {pageNumber}
            </button>
          ))}

          <button
            type="button"
            onClick={() => setCurrentPage((prev) => prev + 1)}
            disabled={!canGoNextPage}
            className="p-1 rounded-lg border border-slate-200 hover:bg-white hover:border-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Página siguiente"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      </div>

      {selectedLog ? (
        <Suspense fallback={null}>
          <LogDetailModal
            selectedLog={selectedLog}
            isLoading={isSelectedLogLoading}
            onClose={() => setSelectedLog(null)}
            onUpdateNote={handleSaveNote}
            userCatalog={userCatalog}
            onReprintPdf={onReprintPdf}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
