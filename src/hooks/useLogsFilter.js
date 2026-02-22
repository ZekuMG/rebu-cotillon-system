// src/hooks/useLogsFilter.js
import { useState, useMemo } from 'react';

export function useLogsFilter(dailyLogs = []) {
  // 1. Estados de Filtros
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  
  // 2. Estados de Ordenamiento
  const [sortColumn, setSortColumn] = useState('datetime');
  const [sortDirection, setSortDirection] = useState('desc');

  const safeLogs = Array.isArray(dailyLogs) ? dailyLogs : [];

  // =====================================================
  // HELPERS INTERNOS
  // =====================================================
  const normalizeAction = (action) => {
    const actionMap = {
      'Nueva Venta': 'Venta Realizada',
      'Edición Venta': 'Venta Modificada',
      'Venta': 'Venta Realizada',
      'Gasto': 'Nuevo Gasto',
      'Registrar Gasto': 'Nuevo Gasto',
      'Gasto Registrado': 'Nuevo Gasto'
    };
    return actionMap[action] || action;
  };

  const detectActionType = (log) => {
    const action = normalizeAction(log.action);
    const details = log.details;

    const explicitActions = [
      'Venta Realizada', 'Venta Modificada', 'Venta Anulada', 
      'Edición Producto', 'Nuevo Socio', 'Edición de Puntos', 
      'Edición de Socio', 'Baja de Socio', 'Nuevo Gasto'
    ];

    if (explicitActions.includes(action)) return action;
    if (!details || typeof details === 'string') return action;

    // Lógica de detección automática
    if ((typeof details.product === 'string' || details.title || details.name) && !details.transactionId && !details.productChanges && !details.itemsSnapshot && (details.changes || action.includes('Edición'))) return 'Edición Producto';
    if (details.items && details.total !== undefined && !details.changes && !details.itemsSnapshot && !details.productChanges) return 'Venta Realizada';
    if (details.items && (details.originalTotal || details.status === 'voided')) return 'Venta Anulada';
    if (details.transactionId && (details.changes || details.itemsSnapshot || details.productChanges)) return 'Venta Modificada';
    if (details.salesCount !== undefined && details.totalSales !== undefined && details.finalBalance !== undefined) return action.includes('Automático') ? 'Cierre Automático' : 'Cierre de Caja';
    if (details.amount !== undefined && details.scheduledClosingTime !== undefined && details.salesCount === undefined) return 'Apertura de Caja';
    if (details.amount !== undefined && details.category && details.salesCount === undefined) return 'Nuevo Gasto';
    if (details.type && details.name) return 'Categoría';
    if ((details.title || details.name) && details.price !== undefined && (action === 'Alta de Producto' || action === 'Baja Producto')) return action === 'Baja Producto' ? 'Baja Producto' : 'Alta de Producto';
    if (action === 'Edición Masiva Categorías' || (details.count !== undefined && Array.isArray(details.details))) return 'Edición Masiva Categorías';
    
    return action;
  };

  const parseDate = (dateStr) => {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    return new Date(parts[2], parts[1] - 1, parts[0]);
  };

  const parseInputDate = (dateStr) => { 
    if (!dateStr) return null; 
    return new Date(dateStr + 'T00:00:00'); 
  };

  const parseTime = (timeStr) => { 
    if (!timeStr) return 0; 
    const parts = timeStr.split(':'); 
    if (parts.length < 2) return 0; 
    return ((parseInt(parts[0], 10) || 0) * 3600 + (parseInt(parts[1], 10) || 0) * 60 + (parseInt(parts[2], 10) || 0)); 
  };

  const getFullTimestamp = (log) => { 
    const date = parseDate(log.date); 
    if (!date) return 0; 
    return date.getTime() + parseTime(log.timestamp) * 1000; 
  };

  // =====================================================
  // MEMOS (Cálculos pesados)
  // =====================================================
  
  // 1. Normalizar logs
  const normalizedLogs = useMemo(() => {
    return safeLogs.map((log) => ({
      ...log,
      action: detectActionType(log),
      _originalAction: log.action,
    }));
  }, [safeLogs]);

  // 2. Obtener acciones únicas para el select
  const uniqueActions = useMemo(() => {
    return [...new Set(normalizedLogs.map((log) => log.action || 'Desconocido'))].sort();
  }, [normalizedLogs]);

  const hasActiveFilters = filterDateStart || filterDateEnd || filterUser || filterAction || filterSearch;

  // 3. Filtrar
  const filteredLogs = useMemo(() => {
    return normalizedLogs.filter((log) => {
      if (!log) return false;
      const logDate = log.date || '';
      const logUser = log.user || 'Sistema';
      const logAction = log.action || 'Acción';

      if (filterDateStart || filterDateEnd) {
        const logDateParsed = parseDate(logDate);
        if (!logDateParsed) return false;
        if (filterDateStart) { 
          const startDate = parseInputDate(filterDateStart); 
          if (startDate && logDateParsed < startDate) return false; 
        }
        if (filterDateEnd) { 
          const endDate = parseInputDate(filterDateEnd); 
          if (endDate && logDateParsed > endDate) return false; 
        }
      }

      if (filterUser && !logUser.toLowerCase().includes(filterUser.toLowerCase())) return false;
      if (filterAction && logAction !== filterAction) return false;
      if (filterSearch) { 
        const search = filterSearch.toLowerCase(); 
        const rawString = JSON.stringify(log).toLowerCase(); 
        if (!rawString.includes(search)) return false; 
      }
      return true;
    });
  }, [normalizedLogs, filterDateStart, filterDateEnd, filterUser, filterAction, filterSearch]);

  // 4. Ordenar
  const sortedLogs = useMemo(() => {
    if (!sortColumn) return filteredLogs;

    return [...filteredLogs].sort((a, b) => {
      let valA, valB;

      switch (sortColumn) {
        case 'datetime':
          valA = getFullTimestamp(a);
          valB = getFullTimestamp(b);
          break;
        case 'user':
          valA = (a.user || '').toLowerCase();
          valB = (b.user || '').toLowerCase();
          break;
        case 'action':
          valA = (a.action || '').toLowerCase();
          valB = (b.action || '').toLowerCase();
          break;
        default:
          return 0;
      }

      if (typeof valA === 'string' && typeof valB === 'string') {
        const comparison = valA.localeCompare(valB, 'es');
        return sortDirection === 'asc' ? comparison : -comparison;
      }

      if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
      if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [filteredLogs, sortColumn, sortDirection]);

  // =====================================================
  // ACTIONS (Handlers)
  // =====================================================
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const clearAllFilters = () => {
    setFilterDateStart('');
    setFilterDateEnd('');
    setFilterUser('');
    setFilterAction('');
    setFilterSearch('');
  };

  return {
    // Datos
    sortedLogs,
    uniqueActions,
    hasActiveFilters,
    
    // Estados Filtros
    filterDateStart, setFilterDateStart,
    filterDateEnd, setFilterDateEnd,
    filterUser, setFilterUser,
    filterAction, setFilterAction,
    filterSearch, setFilterSearch,
    
    // Estados Orden
    sortColumn,
    sortDirection,
    
    // Acciones
    handleSort,
    clearAllFilters
  };
}