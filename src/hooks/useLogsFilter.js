import { useDeferredValue, useMemo, useState } from 'react';

const normalizeAction = (action) => {
  const actionMap = {
    'Nueva Venta': 'Venta Realizada',
    'Edición Venta': 'Venta Modificada',
    Venta: 'Venta Realizada',
    Gasto: 'Nuevo Gasto',
    'Registrar Gasto': 'Nuevo Gasto',
    'Gasto Registrado': 'Nuevo Gasto',
  };

  return actionMap[action] || action;
};

const detectActionType = (log) => {
  const action = normalizeAction(log.action);
  const details = log.details;

  const explicitActions = [
    'Venta Realizada',
    'Venta Modificada',
    'Venta Anulada',
    'Edición Producto',
    'Venta Eliminada',
    'Venta Restaurada',
    'Nuevo Socio',
    'Edición de Puntos',
    'Edición de Socio',
    'Baja de Socio',
    'Nuevo Gasto',
    'Cierre de Caja',
    'Cierre Automático',
  ];

  if (explicitActions.includes(action)) return action;
  if (!details || typeof details === 'string') return action;

  if (
    (typeof details.product === 'string' || details.title || details.name) &&
    !details.transactionId &&
    !details.productChanges &&
    !details.itemsSnapshot &&
    (details.changes || action.includes('Edición'))
  ) {
    return 'Edición Producto';
  }

  if (details.items && details.total !== undefined && !details.changes && !details.itemsSnapshot && !details.productChanges) {
    return 'Venta Realizada';
  }

  if (details.items && (details.originalTotal || details.status === 'voided')) {
    return 'Venta Anulada';
  }

  if (details.transactionId && (details.changes || details.itemsSnapshot || details.productChanges)) {
    return 'Venta Modificada';
  }

  if (details.salesCount !== undefined && details.totalSales !== undefined && details.finalBalance !== undefined) {
    return action.includes('Automático') ? 'Cierre Automático' : 'Cierre de Caja';
  }

  if (details.amount !== undefined && details.scheduledClosingTime !== undefined && details.salesCount === undefined) {
    return 'Apertura de Caja';
  }

  if (details.amount !== undefined && details.category && details.salesCount === undefined) {
    return 'Nuevo Gasto';
  }

  if (details.type && details.name) return 'Categoría';

  if ((details.title || details.name) && details.price !== undefined && (action === 'Alta de Producto' || action === 'Baja Producto')) {
    return action === 'Baja Producto' ? 'Baja Producto' : 'Alta de Producto';
  }

  if (action === 'Edición Masiva Categorías' || (details.count !== undefined && Array.isArray(details.details))) {
    return 'Edición Masiva Categorías';
  }

  return action;
};

const getLogDateNumber = (dateStr) => {
  if (!dateStr) return 0;
  const parts = dateStr.split('/');
  if (parts.length !== 3) return 0;

  let year = parseInt(parts[2], 10);
  if (year < 100) year += 2000;

  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[0], 10);
  return year * 10000 + month * 100 + day;
};

const getInputDateNumber = (dateStr) => {
  if (!dateStr) return 0;
  const parts = dateStr.split('-');
  if (parts.length !== 3) return 0;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  return year * 10000 + month * 100 + day;
};

const parseTime = (timeStr) => {
  if (!timeStr) return 0;
  const parts = timeStr.split(':');
  if (parts.length < 2) return 0;

  return (
    (parseInt(parts[0], 10) || 0) * 3600 +
    (parseInt(parts[1], 10) || 0) * 60 +
    (parseInt(parts[2], 10) || 0)
  );
};

const getFullTimestamp = (log) => {
  if (!log.date) return 0;
  const parts = log.date.split('/');
  if (parts.length !== 3) return 0;

  let year = parseInt(parts[2], 10);
  if (year < 100) year += 2000;

  const date = new Date(year, parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
  return date.getTime() + parseTime(log.timestamp) * 1000;
};

const buildSearchIndex = (log, normalizedAction) => {
  const detailsText =
    typeof log.details === 'string'
      ? log.details
      : JSON.stringify(log.details || {});

  return [
    normalizedAction,
    log.user || 'Sistema',
    log.reason || '',
    log.date || '',
    log.timestamp || '',
    detailsText,
  ]
    .join(' ')
    .toLowerCase();
};

export function useLogsFilter(dailyLogs = []) {
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [sortColumn, setSortColumn] = useState('datetime');
  const [sortDirection, setSortDirection] = useState('desc');

  const deferredFilterSearch = useDeferredValue(filterSearch);

  const normalizedLogs = useMemo(
    () => {
      const safeLogs = Array.isArray(dailyLogs) ? dailyLogs : [];

      return safeLogs.map((log) => {
        const action = detectActionType(log);

        return {
          ...log,
          action,
          _originalAction: log.action,
          _dateNumber: getLogDateNumber(log.date || ''),
          _fullTimestamp: getFullTimestamp(log),
          _searchIndex: buildSearchIndex(log, action),
        };
      });
    },
    [dailyLogs]
  );

  const uniqueActions = useMemo(() => {
    const validLogsForSelect = normalizedLogs.filter((log) => !log.isTest);
    return [...new Set(validLogsForSelect.map((log) => log.action || 'Desconocido'))].sort();
  }, [normalizedLogs]);

  const hasActiveFilters = filterDateStart || filterDateEnd || filterUser || filterAction || filterSearch;

  const filteredLogs = useMemo(() => {
    const normalizedSearch = deferredFilterSearch.toLowerCase().trim();
    const isSearchingTest = normalizedSearch === 'test';

    return normalizedLogs.filter((log) => {
      if (!log) return false;

      if (log.isTest) {
        if (!isSearchingTest) return false;
      } else if (isSearchingTest) {
        return false;
      }

      if (filterDateStart) {
        const startNum = getInputDateNumber(filterDateStart);
        if (startNum > 0 && log._dateNumber < startNum) return false;
      }

      if (filterDateEnd) {
        const endNum = getInputDateNumber(filterDateEnd);
        if (endNum > 0 && log._dateNumber > endNum) return false;
      }

      if (filterUser && !(log.user || 'Sistema').toLowerCase().includes(filterUser.toLowerCase())) {
        return false;
      }

      if (filterAction && log.action !== filterAction && !(filterAction === 'Venta Modificada' && log.action === 'Modificación Pedido')) {
        return false;
      }

      if (normalizedSearch && !isSearchingTest && !log._searchIndex.includes(normalizedSearch)) {
        return false;
      }

      return true;
    });
  }, [normalizedLogs, filterDateStart, filterDateEnd, filterUser, filterAction, deferredFilterSearch]);

  const sortedLogs = useMemo(() => {
    if (!sortColumn) return filteredLogs;

    return [...filteredLogs].sort((a, b) => {
      let valA;
      let valB;

      switch (sortColumn) {
        case 'datetime':
          valA = a._fullTimestamp;
          valB = b._fullTimestamp;
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

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
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
    sortedLogs,
    uniqueActions,
    hasActiveFilters,
    filterDateStart,
    setFilterDateStart,
    filterDateEnd,
    setFilterDateEnd,
    filterUser,
    setFilterUser,
    filterAction,
    setFilterAction,
    filterSearch,
    setFilterSearch,
    sortColumn,
    sortDirection,
    handleSort,
    clearAllFilters,
  };
}
