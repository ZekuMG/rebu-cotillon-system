import React, { useState, useMemo } from 'react';
import { useLogsFilter } from '../hooks/useLogsFilter';

// Componentes modulares
import LogsControls from '../components/ActionLogs/LogsControls';
import LogsTable from '../components/ActionLogs/LogsTable';
import LogDetailModal from '../components/ActionLogs/LogDetailModal';

export default function LogsView({ dailyLogs }) {
  
  // ===========================================================================
  // 1. ADAPTADOR DE DATOS (CRÍTICO)
  // Convierte los datos de la nube (texto) en objetos útiles para tu UI
  // ===========================================================================
  const processedLogs = useMemo(() => {
    if (!dailyLogs) return [];

    return dailyLogs.map(log => {
      let finalDetails = log.details;

      // Si Supabase devuelve un string JSON, lo parseamos a Objeto.
      // Esto es vital para que LogsTable pinte las etiquetas de colores.
      if (typeof finalDetails === 'string') {
        try {
          finalDetails = JSON.parse(finalDetails);
        } catch (e) {
          // Si no es JSON válido, lo dejamos como está
        }
      }

      return {
        ...log,
        // IMPORTANTE: Devolvemos el OBJETO, no un string resumen.
        details: finalDetails, 
      };
    });
  }, [dailyLogs]);

  // ===========================================================================
  // 2. HOOK DE LÓGICA (Usando los datos procesados)
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

  // 3. Estados UI Locales
  const [selectedLog, setSelectedLog] = useState(null);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-full flex flex-col">
      {/* 1. CONTROLES Y FILTROS */}
      <LogsControls
        totalLogs={sortedLogs.length}
        uniqueActions={uniqueActions}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearAllFilters}
        filterDateStart={filterDateStart} setFilterDateStart={setFilterDateStart}
        filterDateEnd={filterDateEnd} setFilterDateEnd={setFilterDateEnd}
        filterUser={filterUser} setFilterUser={setFilterUser}
        filterAction={filterAction} setFilterAction={setFilterAction}
        filterSearch={filterSearch} setFilterSearch={setFilterSearch}
      />

      {/* 2. TABLA DE REGISTROS */}
      <LogsTable
        sortedLogs={sortedLogs}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={handleSort}
        onViewDetails={(log) => setSelectedLog(log)}
      />

      {/* 3. MODAL DE DETALLE */}
      <LogDetailModal
        selectedLog={selectedLog}
        onClose={() => setSelectedLog(null)}
      />
    </div>
  );
}