import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLogsFilter } from '../hooks/useLogsFilter';

// Componentes modulares
import LogsControls from '../components/ActionLogs/LogsControls';
import LogsTable from '../components/ActionLogs/LogsTable';
import LogDetailModal from '../components/ActionLogs/LogDetailModal';

const LOGS_PER_PAGE = 50;

export default function LogsView({ dailyLogs }) {
  
  // ===========================================================================
  // 1. ADAPTADOR DE DATOS
  // ===========================================================================
  const processedLogs = useMemo(() => {
    if (!dailyLogs) return [];
    return dailyLogs.map(log => {
      let finalDetails = log.details;
      if (typeof finalDetails === 'string') {
        try { finalDetails = JSON.parse(finalDetails); } catch (e) {}
      }
      return { ...log, details: finalDetails };
    });
  }, [dailyLogs]);

  // ===========================================================================
  // 2. HOOK DE LÓGICA
  // ===========================================================================
  const {
    sortedLogs,
    uniqueActions,
    hasActiveFilters,
    filterDateStart, setFilterDateStart,
    filterDateEnd, setFilterDateEnd,
    filterUser, setFilterUser,
    filterAction, setFilterAction,
    filterSearch, setFilterSearch,
    sortColumn,
    sortDirection,
    handleSort,
    clearAllFilters
  } = useLogsFilter(processedLogs);

  // ===========================================================================
  // 3. PAGINACIÓN
  // ===========================================================================
  const [currentPage, setCurrentPage] = useState(1);

  // Resetear a página 1 cuando cambian los filtros
  useEffect(() => {
    setCurrentPage(1);
  }, [filterDateStart, filterDateEnd, filterUser, filterAction, filterSearch, sortColumn, sortDirection]);

  const totalLogs = sortedLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalLogs / LOGS_PER_PAGE));

  // Asegurar que currentPage no exceda totalPages
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * LOGS_PER_PAGE;
  const endIndex = Math.min(startIndex + LOGS_PER_PAGE, totalLogs);

  const paginatedLogs = useMemo(() => {
    return sortedLogs.slice(startIndex, endIndex);
  }, [sortedLogs, startIndex, endIndex]);

  // 4. Estado UI Local
  const [selectedLog, setSelectedLog] = useState(null);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-full flex flex-col">
      {/* 1. CONTROLES Y FILTROS */}
      <LogsControls
        totalLogs={totalLogs}
        uniqueActions={uniqueActions}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={() => { clearAllFilters(); setCurrentPage(1); }}
        filterDateStart={filterDateStart} setFilterDateStart={setFilterDateStart}
        filterDateEnd={filterDateEnd} setFilterDateEnd={setFilterDateEnd}
        filterUser={filterUser} setFilterUser={setFilterUser}
        filterAction={filterAction} setFilterAction={setFilterAction}
        filterSearch={filterSearch} setFilterSearch={setFilterSearch}
      />

      {/* 2. TABLA DE REGISTROS (paginados) */}
      <LogsTable
        sortedLogs={paginatedLogs}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={handleSort}
        onViewDetails={(log) => setSelectedLog(log)}
      />

      {/* 3. BARRA DE PAGINACIÓN */}
      <div className="border-t border-slate-200 bg-slate-50 px-4 py-2.5 flex items-center justify-between shrink-0">
        {/* Contador */}
        <span className="text-xs text-slate-500">
          Acciones registradas: <span className="font-bold text-slate-700">{totalLogs}</span>
          {totalLogs > 0 && (
            <span className="ml-2 text-slate-400">
              (mostrando {startIndex + 1}–{endIndex})
            </span>
          )}
        </span>

        {/* Controles de paginación */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-white hover:border-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Página anterior"
            >
              <ChevronLeft size={14} />
            </button>

            {/* Botones de página */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(page => {
                // Mostrar: primera, última, actual, y ±1 alrededor de actual
                if (page === 1 || page === totalPages) return true;
                if (Math.abs(page - safePage) <= 1) return true;
                return false;
              })
              .reduce((acc, page, i, arr) => {
                // Insertar "..." entre gaps
                if (i > 0 && page - arr[i - 1] > 1) {
                  acc.push('...' + page);
                }
                acc.push(page);
                return acc;
              }, [])
              .map((item) => {
                if (typeof item === 'string') {
                  return (
                    <span key={item} className="px-1 text-xs text-slate-400">
                      ...
                    </span>
                  );
                }
                return (
                  <button
                    key={item}
                    onClick={() => setCurrentPage(item)}
                    className={`min-w-[28px] h-7 rounded-lg text-xs font-bold transition-colors ${
                      item === safePage
                        ? 'bg-fuchsia-600 text-white shadow-sm'
                        : 'border border-slate-200 text-slate-600 hover:bg-white hover:border-slate-300'
                    }`}
                  >
                    {item}
                  </button>
                );
              })}

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="p-1.5 rounded-lg border border-slate-200 hover:bg-white hover:border-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Página siguiente"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* 4. MODAL DE DETALLE */}
      <LogDetailModal
        selectedLog={selectedLog}
        onClose={() => setSelectedLog(null)}
      />
    </div>
  );
}