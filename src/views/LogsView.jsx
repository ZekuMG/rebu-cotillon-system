// src/views/LogsView.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLogsFilter } from '../hooks/useLogsFilter';
import { normalizeUserText } from '../utils/appUsers';
import { resolveUserPresentation } from '../utils/userPresentation';

// Componentes modulares
import LogsControls from '../components/ActionLogs/LogsControls';
import LogsTable from '../components/ActionLogs/LogsTable';
import LogDetailModal from '../components/ActionLogs/LogDetailModal';

const LOGS_PER_PAGE = 50;

// âœ¨ NUEVO: Agregamos onReprintPdf en los props
export default function LogsView({ dailyLogs, onUpdateLogNote, onReprintPdf, userCatalog, isLoading = false, emptyStateMessage = '' }) {
  
  const formatFullDate = (isoString) => {
    if (!isoString) return '--/--/---- --:--';
    try {
      const d = new Date(isoString);
      const datePart = d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
      const timePart = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
      return `${datePart} a las ${timePart} hs`;
    } catch {
      return '--/--/---- --:--';
    }
  };

  // ===========================================================================
  // 1. ADAPTADOR DE DATOS CON MAPEO RETROACTIVO
  // ===========================================================================
  
  // ðŸ”„ Función retroactiva MEJORADA: Transforma logs antiguos a nueva estructura
  const retrofitLogDetails = (log) => {
    if (log.action !== 'Edición de Socio') return log.details;
    
    let details = log.details;
    if (!details || typeof details !== 'object') return details;
    
    // âœ… Si ya tiene la estructura nueva, retornar como está
    if (details.changes && Array.isArray(details.changes) && details.changes.length > 0) {
      return details;
    }
    
    // ðŸ”§ MAPEO RETROACTIVO: Reconstruir `changes` preservando TODO
    const changes = [];
    
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // PASO 0: PRESERVAR ABSOLUTAMENTE TODO del objeto original
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    const result = {
      ...details // Copia de todos los campos
    };
    
    // ðŸ” NUEVO: Si los datos están dentro de "updates", fusionarlos
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
      
      // ðŸ” IMPORTANTE: Buscar tambiÃ©n oldPoints/newPoints dentro de updates
      result.oldPoints = result.oldPoints !== undefined ? result.oldPoints : (details.updates.oldPoints !== undefined ? details.updates.oldPoints : undefined);
      result.newPoints = result.newPoints !== undefined ? result.newPoints : (details.updates.newPoints !== undefined ? details.updates.newPoints : undefined);
      result.pointsDelta = result.pointsDelta !== undefined ? result.pointsDelta : details.updates.pointsDelta;
      
      // ðŸ” Y tambiÃ©n extraer cambios si estaban en updates
      if (!result.changes && details.updates.changes) {
        result.changes = details.updates.changes;
      }
      if (!result.changedFields && details.updates.changedFields) {
        result.changedFields = details.updates.changedFields;
      }
    }
    
    // Normalizar campos de identidad (intentar rellenar desde mÃºltiples fuentes)
    if (!result.name && (details.member || details.memberName || details.newName)) {
      result.name = details.member || details.memberName || details.newName;
    }
    if (!result.number && (details.memberNumber || details.member_number)) {
      result.number = details.memberNumber || details.member_number;
    }
    
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // PASO 1: DETECTAR CAMBIOS EN PUNTOS
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    const hasOldPoints = result.oldPoints !== undefined && result.oldPoints !== null;
    const hasNewPoints = result.newPoints !== undefined && result.newPoints !== null;
    const pointsChanged = hasOldPoints && hasNewPoints && Number(result.oldPoints) !== Number(result.newPoints);
    
    if (pointsChanged) {
      changes.push({
        field: 'Puntos',
        old: Number(result.oldPoints),
        new: Number(result.newPoints),
        isPrice: false
      });
    }
    
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // PASO 2: DETECTAR CAMBIOS EN OTROS CAMPOS
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    if (details.oldName && details.newName && details.oldName !== details.newName) {
      changes.push({ field: 'Nombre', old: details.oldName, new: details.newName });
    }
    if (details.oldDni && details.newDni && details.oldDni !== details.newDni) {
      changes.push({ field: 'DNI', old: details.oldDni || '--', new: details.newDni || '--' });
    }
    if (details.oldPhone && details.newPhone && details.oldPhone !== details.newPhone) {
      changes.push({ field: 'TelÃ©fono', old: details.oldPhone || '--', new: details.newPhone || '--' });
    }
    if (details.oldEmail && details.newEmail && details.oldEmail !== details.newEmail) {
      changes.push({ field: 'Email', old: details.oldEmail || '--', new: details.newEmail || '--' });
    }
    
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // PASO 3: DETECTAR DESDE changedFields (formato muy antiguo)
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    if (details.changedFields && Array.isArray(details.changedFields) && details.changedFields.length > 0) {
      details.changedFields.forEach(fieldStr => {
        const match = fieldStr.match(/^(.*?)\s*\(([+-]?\d+)\)$/);
        if (match) {
          const fieldName = match[1].trim();
          const delta = parseInt(match[2]);
          
          if (fieldName === 'Puntos' && hasOldPoints && !changes.some(c => c.field === 'Puntos')) {
            const oldPts = Number(result.oldPoints);
            const newPts = oldPts + delta;
            changes.push({
              field: 'Puntos',
              old: oldPts,
              new: newPts,
              isPrice: false
            });
          }
        }
      });
    }
    
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // PASO 4: DETECTAR DESDE pointsDelta
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    if (
      result.pointsDelta !== undefined && 
      result.pointsDelta !== 0 &&
      hasOldPoints &&
      !changes.some(c => c.field === 'Puntos')
    ) {
      const oldPts = Number(result.oldPoints);
      const newPts = oldPts + Number(result.pointsDelta);
      changes.push({
        field: 'Puntos',
        old: oldPts,
        new: newPts,
        isPrice: false
      });
    }
    
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    // PASO 5: AGREGAR CHANGES SI EXISTEN
    // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    if (changes.length > 0) {
      result.changes = changes;
    }
    
    return result;
  };

  const processedLogs = useMemo(() => {
    if (!dailyLogs) return [];
    return dailyLogs.map(log => {
      let finalDetails = log.details;
      const rawSupabaseDetails = log.details; // ðŸ” Guardar original de Supabase
      
      // âœ… Parsear details si viene como JSON string
      if (typeof finalDetails === 'string') {
        try { 
          finalDetails = JSON.parse(finalDetails); 
        } catch { 
          finalDetails = log.details; 
        }
      }
      
      // ðŸ”„ Aplicar mapeo retroactivo para logs antiguos
      finalDetails = retrofitLogDetails({ ...log, details: finalDetails });
      
      const realDate = log.created_at || log.createdAt || new Date().toISOString();

      return { 
        ...log, 
        details: finalDetails,
        _rawSupabaseDetails: rawSupabaseDetails, // ðŸ” Para debug
        rawCreatedAt: realDate,
        displayCreatedAt: formatFullDate(realDate)
      };
    });
  }, [dailyLogs]);

  // ===========================================================================
  // 2. HOOK DE LÃ“GICA
  // ===========================================================================
  const {
    sortedLogs: rawSortedLogs,
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

  // MAGIA ANTI-TEST: Filtramos los tests DESPUÃ‰S del hook
  const sortedLogs = useMemo(() => {
    const isSearchingTest = filterSearch.toLowerCase().trim() === 'test';
    
    return rawSortedLogs.filter(log => {
       const isTestLog = log.isTest || (log.details && log.details.isTest) || (log.details && log.details.testMarker === 'test');
       
       if (isTestLog) {
           return isSearchingTest; 
       } else {
           return !isSearchingTest; 
       }
    });
  }, [rawSortedLogs, filterSearch]);

  const userFilterOptions = useMemo(() => {
    const entries = [];
    const seen = new Set();
    const catalogUsers = Array.isArray(userCatalog?.all) ? userCatalog.all : [];

    const pushOption = (user) => {
      const presentation = resolveUserPresentation(user, userCatalog);
      const key = normalizeUserText(presentation.displayName);
      if (!key || seen.has(key)) return;
      seen.add(key);
      entries.push({
        key,
        value: presentation.displayName,
        displayName: presentation.displayName,
        color: presentation.nameColor,
      });
    };

    catalogUsers.forEach((user) => pushOption(user));
    processedLogs.forEach((log) => pushOption({ id: log.userId, role: log.userRole, name: log.user }));

    return entries;
  }, [processedLogs, userCatalog]);

  const [currentPage, setCurrentPage] = useState(1);
  
  useEffect(() => {
    setCurrentPage(1);
  }, [filterDateStart, filterDateEnd, filterUser, filterAction, filterSearch, sortColumn, sortDirection]);

  const totalLogs = sortedLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalLogs / LOGS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * LOGS_PER_PAGE;
  const endIndex = Math.min(startIndex + LOGS_PER_PAGE, totalLogs);

  const paginatedLogs = useMemo(() => {
    return sortedLogs.slice(startIndex, endIndex);
  }, [sortedLogs, startIndex, endIndex]);

  // 4. Estado UI Local
  const [selectedLog, setSelectedLog] = useState(null);

  // Función puente: Guarda en BD y actualiza el modal abierto al mismo tiempo
  const handleSaveNote = async (logId, newNote) => {
    if (onUpdateLogNote) {
      await onUpdateLogNote(logId, newNote);
      // Refrescamos el log que está actualmente abierto en el modal
      setSelectedLog(prev => prev && prev.id === logId ? { ...prev, reason: newNote } : prev);
    }
  };

  if (isLoading && (!dailyLogs || dailyLogs.length === 0)) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="text-center">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Cargando acciones</p>
          <p className="mt-2 text-sm font-medium text-slate-500">Estamos trayendo el registro sin bloquear el resto de la app.</p>
        </div>
      </div>
    );
  }

  if (emptyStateMessage && (!dailyLogs || dailyLogs.length === 0)) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="max-w-md text-center">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Registro no disponible</p>
          <p className="mt-2 text-sm font-medium text-slate-500">{emptyStateMessage}</p>
        </div>
      </div>
    );
  }

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
        userFilterOptions={userFilterOptions}
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
        selectedLogId={selectedLog?.id}
        userCatalog={userCatalog}
      />

      {/* 3. BARRA DE PAGINACIÃ“N */}
      <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 flex items-center justify-between shrink-0">
        <span className="text-[11px] text-slate-500">
          Acciones registradas: <span className="font-bold text-slate-700">{totalLogs}</span>
          {totalLogs > 0 && (
            <span className="ml-2 text-[10px] text-slate-400">
              (mostrando {startIndex + 1}–{endIndex})
            </span>
          )}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="p-1 rounded-lg border border-slate-200 hover:bg-white hover:border-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Página anterior"
            >
              <ChevronLeft size={13} />
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter(page => {
                if (page === 1 || page === totalPages) return true;
                if (Math.abs(page - safePage) <= 1) return true;
                return false;
              })
              .reduce((acc, page, i, arr) => {
                if (i > 0 && page - arr[i - 1] > 1) {
                  acc.push('...' + page);
                }
                acc.push(page);
                return acc;
              }, [])
              .map((item) => {
                if (typeof item === 'string') {
                  return <span key={item} className="px-1 text-[10px] text-slate-400">...</span>;
                }
                return (
                  <button
                    key={item}
                    onClick={() => setCurrentPage(item)}
                    className={`min-w-[26px] h-6 rounded-lg text-[10px] font-bold transition-colors ${
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
              className="p-1 rounded-lg border border-slate-200 hover:bg-white hover:border-slate-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Página siguiente"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>

      {/* 4. MODAL DE DETALLE */}
      <LogDetailModal
        selectedLog={selectedLog}
        onClose={() => setSelectedLog(null)}
        onUpdateNote={handleSaveNote}
        userCatalog={userCatalog}
        onReprintPdf={onReprintPdf} /* âœ¨ NUEVO: Pasamos la orden al modal */
      />
    </div>
  );
}
