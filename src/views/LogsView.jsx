import React, { useState, useMemo } from 'react';
import {
  FileText,
  Clock,
  User,
  Search,
  Eye,
  X,
  Calendar,
  ArrowRight,
  Package,
  List,
  DollarSign,
  Trash2,
  XCircle,
  Tag,
  ShoppingCart,
  Edit,
  PlusCircle,
  MinusCircle,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  Power,
  AlertTriangle,
  FilterX,
  Wand2,
} from 'lucide-react';

export default function LogsView({ dailyLogs, setDailyLogs, inventory }) {
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [selectedLog, setSelectedLog] = useState(null);
  const [sortColumn, setSortColumn] = useState('datetime');
  const [sortDirection, setSortDirection] = useState('desc');

  // Modales de generación
  const [showGeneratorModal, setShowGeneratorModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [generatorConfig, setGeneratorConfig] = useState({
    count: 30,
    dateStart: '',
    dateEnd: '',
    includeVentas: true,
    includeCaja: true,
    includeProductos: true,
    includeCategorias: true,
  });

  const safeLogs = Array.isArray(dailyLogs) ? dailyLogs : [];

  // =====================================================
  // NORMALIZACIÓN DE ACCIONES - Unifica nombres duplicados
  // =====================================================
  const normalizeAction = (action) => {
    const actionMap = {
      'Nueva Venta': 'Venta Realizada',
      'Edición Venta': 'Modificación Pedido',
    };
    return actionMap[action] || action;
  };

  // =====================================================
  // DETECCIÓN DE TIPO POR ESTRUCTURA DE DATOS
  // Detecta el tipo real basándose en los campos presentes
  // IMPORTANTE: El orden y especificidad de las condiciones importa
  // =====================================================
  const detectActionType = (log) => {
    const action = normalizeAction(log.action);
    const details = log.details;

    // Si no hay detalles o es string, confiar en la acción normalizada
    if (!details || typeof details === 'string') return action;

    // 1. EDICIÓN PRODUCTO - Tiene 'product' (nombre del producto) y NO tiene transactionId/productChanges
    //    La clave es que 'product' es un STRING con el nombre, no un objeto
    if (
      typeof details.product === 'string' &&
      !details.transactionId &&
      !details.productChanges &&
      !details.itemsSnapshot
    ) {
      return 'Edición Producto';
    }

    // 2. VENTA REALIZADA - Tiene items, total, payment, pero NO tiene changes ni productChanges
    if (
      details.items &&
      details.total !== undefined &&
      details.payment &&
      !details.changes &&
      !details.productChanges
    ) {
      return 'Venta Realizada';
    }

    // 3. VENTA ANULADA - Detectar por estructura específica
    if (
      action === 'Venta Anulada' ||
      (details.items && (details.originalTotal || details.status === 'voided'))
    ) {
      return 'Venta Anulada';
    }

    // 4. MODIFICACIÓN PEDIDO - Tiene transactionId Y (changes o productChanges o itemsSnapshot)
    if (
      details.transactionId ||
      details.productChanges ||
      details.itemsSnapshot
    ) {
      return 'Modificación Pedido';
    }

    // 5. CIERRE DE CAJA - Tiene salesCount, totalSales, finalBalance
    if (
      details.salesCount !== undefined &&
      details.totalSales !== undefined &&
      details.finalBalance !== undefined
    ) {
      return action.includes('Automático')
        ? 'Cierre Automático'
        : 'Cierre de Caja';
    }

    // 6. APERTURA DE CAJA - Tiene amount y scheduledClosingTime, NO tiene salesCount
    if (
      details.amount !== undefined &&
      details.scheduledClosingTime !== undefined &&
      details.salesCount === undefined
    ) {
      return 'Apertura de Caja';
    }

    // 7. CATEGORÍA - Tiene type y name
    if (details.type && details.name) {
      return 'Categoría';
    }

    // 8. ALTA/BAJA DE PRODUCTO - Tiene title, price, stock, NO tiene 'product'
    if (
      details.title &&
      details.price !== undefined &&
      details.stock !== undefined &&
      !details.product
    ) {
      if (action === 'Baja Producto') return 'Baja Producto';
      return 'Alta de Producto';
    }

    return action;
  };

  // =====================================================
  // HELPER: Obtener Transaction ID de cualquier estructura
  // =====================================================
  const getTransactionId = (details) => {
    if (!details || typeof details === 'string') return null;
    const id = details.transactionId || details.id;
    if (!id) return null;
    // Si es string con formato TRX-XXXX, extraer el número
    if (typeof id === 'string' && id.includes('TRX-')) {
      return id.replace('TRX-', '');
    }
    return id;
  };

  // =====================================================
  // LOGS NORMALIZADOS con detección de tipo
  // =====================================================
  const normalizedLogs = useMemo(() => {
    return safeLogs.map((log) => ({
      ...log,
      action: detectActionType(log),
      _originalAction: log.action,
    }));
  }, [safeLogs]);

  const uniqueActions = [
    ...new Set(normalizedLogs.map((log) => log.action || 'Desconocido')),
  ].sort();
  const hasActiveFilters =
    filterDateStart ||
    filterDateEnd ||
    filterUser ||
    filterAction ||
    filterSearch;

  const clearAllFilters = () => {
    setFilterDateStart('');
    setFilterDateEnd('');
    setFilterUser('');
    setFilterAction('');
    setFilterSearch('');
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
    return (
      (parseInt(parts[0], 10) || 0) * 3600 +
      (parseInt(parts[1], 10) || 0) * 60 +
      (parseInt(parts[2], 10) || 0)
    );
  };

  const getFullTimestamp = (log) => {
    const date = parseDate(log.date);
    if (!date) return 0;
    return date.getTime() + parseTime(log.timestamp) * 1000;
  };

  const filteredLogs = normalizedLogs.filter((log) => {
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

    if (filterUser && !logUser.toLowerCase().includes(filterUser.toLowerCase()))
      return false;
    if (filterAction && logAction !== filterAction) return false;
    if (filterSearch) {
      const search = filterSearch.toLowerCase();
      const rawString = JSON.stringify(log).toLowerCase();
      if (!rawString.includes(search)) return false;
    }
    return true;
  });

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

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ column }) => {
    if (sortColumn !== column)
      return <ChevronsUpDown size={14} className="text-slate-300" />;
    return sortDirection === 'asc' ? (
      <ChevronUp size={14} className="text-amber-600" />
    ) : (
      <ChevronDown size={14} className="text-amber-600" />
    );
  };

  // =====================================================
  // RESUMEN - Detecta tipo y genera resumen apropiado
  // =====================================================
  const getSummary = (log) => {
    const action = log.action;
    const details = log.details;
    const reason = log.reason;

    if (!details)
      return <span className="text-slate-400 italic">Sin detalles</span>;
    if (typeof details === 'string')
      return <span className="text-slate-600 text-[10px]">{details}</span>;

    switch (action) {
      case 'Venta Realizada': {
        const txId = getTransactionId(details);
        const items = details.items || [];
        const totalQty = items.reduce(
          (sum, i) => sum + (i.qty || i.quantity || 0),
          0
        );
        const total = details.total || 0;
        const payment = details.payment || 'N/A';

        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
              <ShoppingCart size={10} /> #{txId}
            </span>
            <span className="bg-fuchsia-100 text-fuchsia-700 px-2 py-0.5 rounded text-[10px] font-bold">
              ${total.toLocaleString()}
            </span>
            <span className="text-slate-500 text-[10px]">
              {totalQty} uds ({items.length} items)
            </span>
            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px]">
              {payment}
            </span>
          </div>
        );
      }

      case 'Venta Anulada': {
        const txId = getTransactionId(details);
        const total = details.originalTotal || details.total || 0;

        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
              <XCircle size={10} /> #{txId}
            </span>
            <span className="text-red-500 text-[10px] line-through">
              ${total.toLocaleString()}
            </span>
            {reason && (
              <span className="text-amber-600 text-[10px] italic truncate max-w-[150px]">
                "{reason}"
              </span>
            )}
          </div>
        );
      }

      case 'Modificación Pedido': {
        const txId = getTransactionId(details);
        const changes = details.changes || {};
        const productChanges = details.productChanges || [];
        const hasProductChanges =
          productChanges.filter((c) => c.diff !== 0).length > 0;

        return (
          <div className="flex items-center gap-2 flex-wrap">
            {txId && (
              <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                <Edit size={10} /> #{txId}
              </span>
            )}
            {changes.total && (
              <span className="text-[10px] flex items-center gap-1">
                <span className="text-red-400 line-through">
                  ${Number(changes.total.old).toLocaleString()}
                </span>
                <ArrowRight size={10} className="text-slate-400" />
                <span className="text-green-600 font-bold">
                  ${Number(changes.total.new).toLocaleString()}
                </span>
              </span>
            )}
            {changes.payment && (
              <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px]">
                {changes.payment.old} → {changes.payment.new}
              </span>
            )}
            {hasProductChanges && (
              <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-[10px]">
                {productChanges.filter((c) => c.diff !== 0).length} productos
                modificados
              </span>
            )}
            {!txId &&
              !changes.total &&
              !changes.payment &&
              !hasProductChanges && (
                <span className="text-slate-400 text-[10px] italic">
                  Sin cambios registrados
                </span>
              )}
          </div>
        );
      }

      case 'Edición Producto': {
        const changes = details.changes || {};
        const productName = details.product || details.title || 'Producto';
        const productId = details.id || details.productId;

        // Generar badges para cada tipo de cambio
        const changeBadges = [];
        if (changes.price) {
          changeBadges.push(
            <span
              key="price"
              className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded text-[10px]"
            >
              ${changes.price.old} → ${changes.price.new}
            </span>
          );
        }
        if (changes.stock) {
          const diff = changes.stock.new - changes.stock.old;
          changeBadges.push(
            <span
              key="stock"
              className={`px-1.5 py-0.5 rounded text-[10px] ${
                diff > 0
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              Stock: {diff > 0 ? '+' : ''}
              {diff}
            </span>
          );
        }
        if (changes.purchasePrice) {
          changeBadges.push(
            <span
              key="cost"
              className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded text-[10px]"
            >
              Costo: ${changes.purchasePrice.old} → ${changes.purchasePrice.new}
            </span>
          );
        }
        if (changes.category) {
          changeBadges.push(
            <span
              key="cat"
              className="bg-fuchsia-100 text-fuchsia-700 px-1.5 py-0.5 rounded text-[10px]"
            >
              {changes.category.old} → {changes.category.new}
            </span>
          );
        }

        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
              <Package size={10} /> {productId ? `#${productId}` : ''}{' '}
              {productName}
            </span>
            {changeBadges.length > 0 ? (
              changeBadges
            ) : (
              <span className="text-slate-400 text-[10px] italic">
                Sin cambios detallados
              </span>
            )}
          </div>
        );
      }

      case 'Alta de Producto': {
        const productId = details.id || details.productId;
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
              <PlusCircle size={10} /> {productId ? `#${productId}` : 'Nuevo'}
            </span>
            <span className="font-medium text-slate-700 text-[10px] truncate max-w-[150px]">
              {details.title}
            </span>
            <span className="text-fuchsia-600 text-[10px] font-bold">
              ${(details.price || 0).toLocaleString()}
            </span>
            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px]">
              Stock: {details.stock}
            </span>
          </div>
        );
      }

      case 'Baja Producto': {
        const productId = details.id || details.productId;
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
              <MinusCircle size={10} />{' '}
              {productId ? `#${productId}` : 'Eliminado'}
            </span>
            <span className="font-medium text-slate-700 text-[10px] truncate max-w-[150px]">
              {details.title}
            </span>
            <span className="text-red-500 text-[10px]">
              Stock perdido: {details.stock}
            </span>
          </div>
        );
      }

      case 'Apertura de Caja': {
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
              <DollarSign size={10} /> Apertura
            </span>
            <span className="text-green-700 font-bold text-[10px]">
              ${(details.amount || 0).toLocaleString()}
            </span>
            {details.scheduledClosingTime && (
              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] flex items-center gap-1">
                <Clock size={10} /> Cierre: {details.scheduledClosingTime}
              </span>
            )}
          </div>
        );
      }

      case 'Cierre de Caja':
      case 'Cierre Automático': {
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                action === 'Cierre Automático'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-800 text-white'
              }`}
            >
              <DollarSign size={10} />{' '}
              {action === 'Cierre Automático' ? 'Auto' : 'Cierre'}
            </span>
            <span className="text-green-600 font-bold text-[10px]">
              +${(details.totalSales || 0).toLocaleString()}
            </span>
            <span className="text-slate-700 font-bold text-[10px]">
              Final: ${(details.finalBalance || 0).toLocaleString()}
            </span>
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px]">
              {details.salesCount || 0} ventas
            </span>
          </div>
        );
      }

      case 'Categoría': {
        const catType =
          details.type === 'create'
            ? 'Nueva'
            : details.type === 'delete'
            ? 'Eliminada'
            : 'Renombrada';
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                details.type === 'create'
                  ? 'bg-green-100 text-green-700'
                  : details.type === 'delete'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-blue-100 text-blue-700'
              }`}
            >
              <Tag size={10} /> {catType}
            </span>
            {details.type === 'edit' && details.oldName ? (
              <span className="text-[10px] flex items-center gap-1">
                <span className="text-red-400 line-through">
                  {details.oldName}
                </span>
                <ArrowRight size={10} className="text-slate-400" />
                <span className="font-bold text-slate-700">{details.name}</span>
              </span>
            ) : (
              <span className="font-medium text-slate-700 text-[10px]">
                {details.name}
              </span>
            )}
          </div>
        );
      }

      case 'Horario Modificado': {
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
              <Clock size={10} /> Horario
            </span>
            <span className="text-slate-600 text-[10px]">
              {typeof details === 'string' ? details : 'Ajuste de horario'}
            </span>
          </div>
        );
      }

      case 'Sistema Iniciado': {
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
              <Power size={10} /> Sistema
            </span>
            <span className="text-slate-500 text-[10px]">Inicio de sesión</span>
          </div>
        );
      }

      case 'Borrado Permanente': {
        return (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
              <Trash2 size={10} /> Eliminado
            </span>
            <span className="text-slate-500 text-[10px]">
              {typeof details === 'string' ? details : 'Transacción eliminada'}
            </span>
          </div>
        );
      }

      default: {
        // Intentar detectar por estructura
        if (details.items && details.total) {
          const txId = getTransactionId(details);
          return (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                <ShoppingCart size={10} /> #{txId}
              </span>
              <span className="bg-fuchsia-100 text-fuchsia-700 px-2 py-0.5 rounded text-[10px] font-bold">
                ${(details.total || 0).toLocaleString()}
              </span>
            </div>
          );
        }
        if (details.changes || details.productChanges) {
          const txId = getTransactionId(details);
          return (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1">
                <Edit size={10} /> #{txId}
              </span>
              <span className="text-slate-500 text-[10px]">
                Pedido modificado
              </span>
            </div>
          );
        }
        const txId = getTransactionId(details);
        if (txId)
          return (
            <span className="text-slate-500 text-[10px]">
              Transacción #{txId}
            </span>
          );
        if (details.title)
          return (
            <span className="text-slate-500 text-[10px]">{details.title}</span>
          );
        if (details.amount)
          return (
            <span className="text-slate-500 text-[10px]">
              ${details.amount.toLocaleString()}
            </span>
          );
        return (
          <span className="text-slate-400 text-[10px]">Ver detalles...</span>
        );
      }
    }
  };

  // =====================================================
  // RENDER DETAIL CONTENT - Detalles completos del modal
  // =====================================================
  const RenderDetailContent = ({ log }) => {
    const action = log.action;
    const details = log.details;

    if (!details)
      return <p className="text-slate-400 italic">Sin detalles registrados.</p>;
    if (typeof details === 'string') {
      return (
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
          <p className="text-sm text-slate-700 font-medium">{details}</p>
        </div>
      );
    }

    switch (action) {
      case 'Venta Realizada': {
        const txId = getTransactionId(details);
        const items = details.items || [];
        const total = details.total || 0;
        const payment = details.payment || 'N/A';

        return (
          <div className="space-y-3">
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-green-50 p-3 flex justify-between items-center border-b border-green-100">
                <span className="font-bold text-green-800 text-sm">
                  Venta #{txId}
                </span>
                <span className="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                  ${total.toLocaleString()}
                </span>
              </div>
              <div className="p-3 bg-white">
                <div className="flex items-center gap-4 mb-3 pb-2 border-b">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-bold">
                      Método de Pago
                    </p>
                    <p className="text-sm font-bold text-slate-700">
                      {payment}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-bold">
                      Productos
                    </p>
                    <p className="text-sm font-bold text-slate-700">
                      {items.length} items
                    </p>
                  </div>
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">
                  Detalle de productos
                </p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {items.map((item, idx) => (
                    <div
                      key={idx}
                      className="text-xs flex justify-between items-center text-slate-600 bg-slate-50 p-2 rounded"
                    >
                      <span className="flex items-center gap-2">
                        <span className="bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[10px] font-bold">
                          {item.qty || item.quantity}x
                        </span>
                        {item.title}
                      </span>
                      <span className="font-bold text-slate-800">
                        $
                        {(
                          (item.price || 0) * (item.qty || item.quantity || 0)
                        ).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      }

      case 'Venta Anulada': {
        const txId = getTransactionId(details);
        const itemsToShow = details.itemsReturned || details.items || [];
        const total = details.originalTotal || details.total || 0;

        return (
          <div className="space-y-3">
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-red-50 p-3 flex justify-between items-center border-b border-red-100">
                <span className="font-bold text-red-800 text-sm flex items-center gap-2">
                  <XCircle size={16} /> Venta Anulada #{txId}
                </span>
                <span className="bg-red-100 px-3 py-1 rounded-full text-sm font-bold text-red-700 line-through">
                  ${total.toLocaleString()}
                </span>
              </div>
              <div className="p-3 bg-white">
                <p className="text-[10px] font-bold text-green-600 uppercase mb-2 flex items-center gap-1">
                  <Package size={12} /> Productos devueltos al stock
                </p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {itemsToShow.map((item, idx) => (
                    <div
                      key={idx}
                      className="text-xs flex justify-between items-center text-slate-600 bg-green-50 p-2 rounded border border-green-100"
                    >
                      <span className="flex items-center gap-2">
                        <span className="bg-green-500 text-white px-2 py-0.5 rounded text-[10px] font-bold">
                          +{item.qty || item.quantity}
                        </span>
                        {item.title}
                      </span>
                      <span className="text-green-600 font-bold">
                        Restaurado
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-xs text-amber-700">
              <span className="font-bold">Nota:</span> El stock fue restaurado
              automáticamente.
            </div>
          </div>
        );
      }

      case 'Modificación Pedido': {
        const txId = getTransactionId(details);
        const changes = details.changes || {};
        const productChanges = details.productChanges || [];
        const itemsSnapshot = details.itemsSnapshot || [];

        return (
          <div className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 flex items-center justify-between">
              <span className="text-xs font-bold text-blue-700">
                Pedido Modificado
              </span>
              <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                #{txId}
              </span>
            </div>

            {Object.keys(changes).length > 0 && (
              <div className="border rounded overflow-hidden">
                <div className="bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-700 uppercase border-b">
                  Cambios Realizados
                </div>
                <table className="w-full text-xs">
                  <tbody className="divide-y">
                    {Object.entries(changes).map(([key, val]) => (
                      <tr key={key}>
                        <td className="px-3 py-2 font-bold text-slate-600 capitalize w-1/3">
                          {key === 'total'
                            ? 'Monto Total'
                            : key === 'payment'
                            ? 'Método de Pago'
                            : key}
                        </td>
                        <td className="px-3 py-2 text-red-500 line-through text-center bg-red-50">
                          {key === 'total'
                            ? `$${Number(val.old).toLocaleString()}`
                            : val.old}
                        </td>
                        <td className="px-3 py-2 text-center w-8 text-slate-300">
                          →
                        </td>
                        <td className="px-3 py-2 text-green-600 font-bold text-center bg-green-50">
                          {key === 'total'
                            ? `$${Number(val.new).toLocaleString()}`
                            : val.new}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {productChanges.filter((c) => c.diff !== 0).length > 0 && (
              <div className="border rounded overflow-hidden">
                <div className="bg-purple-50 px-3 py-2 text-[10px] font-bold text-purple-700 uppercase border-b flex items-center gap-1">
                  <Package size={12} /> Cambios en Productos
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-500">
                      <th className="px-3 py-2 text-left">Producto</th>
                      <th className="px-3 py-2 text-center w-20">Antes</th>
                      <th className="px-3 py-2 text-center w-8"></th>
                      <th className="px-3 py-2 text-center w-20">Después</th>
                      <th className="px-3 py-2 text-center w-20">Cambio</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {productChanges
                      .filter((c) => c.diff !== 0)
                      .map((change, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 font-bold text-slate-700">
                            {change.title}
                          </td>
                          <td className="px-3 py-2 text-center text-red-500 bg-red-50">
                            {change.oldQty === 0 ? (
                              <span className="text-slate-400 italic text-[10px]">
                                —
                              </span>
                            ) : (
                              <span className="line-through">
                                {change.oldQty}x
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center text-slate-300">
                            <ArrowRight size={14} />
                          </td>
                          <td className="px-3 py-2 text-center text-green-600 bg-green-50 font-bold">
                            {change.newQty === 0 ? (
                              <span className="text-red-500 text-[10px]">
                                Eliminado
                              </span>
                            ) : (
                              `${change.newQty}x`
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                change.diff > 0
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                              }`}
                            >
                              {change.diff > 0
                                ? `+${change.diff}`
                                : change.diff}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}

            {itemsSnapshot.length > 0 && (
              <div className="border rounded bg-slate-50 p-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-2 flex items-center gap-1">
                  <List size={12} /> Estado Final del Pedido
                </p>
                <div className="space-y-1">
                  {itemsSnapshot.map((item, idx) => (
                    <div
                      key={idx}
                      className="text-xs flex justify-between bg-white p-2 border rounded shadow-sm"
                    >
                      <span className="font-bold text-slate-700">
                        {item.qty}x {item.title}
                      </span>
                      <span className="text-slate-500">
                        $
                        {(
                          (Number(item.price) || 0) * (Number(item.qty) || 0)
                        ).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      }

      case 'Edición Producto': {
        const changes = details.changes || {};
        const productName = details.product || details.title || 'Producto';

        return (
          <div className="space-y-3">
            <div className="bg-blue-50 p-3 rounded border border-blue-100 flex items-center gap-2">
              <Package size={16} className="text-blue-600" />
              <span className="font-bold text-blue-800 text-sm">
                {productName}
              </span>
            </div>
            {Object.keys(changes).length > 0 ? (
              <table className="w-full text-xs border-collapse border rounded overflow-hidden">
                <thead>
                  <tr className="bg-slate-100 text-slate-500">
                    <th className="px-3 py-2 text-left w-1/3">Campo</th>
                    <th className="px-3 py-2 text-center">Antes</th>
                    <th className="px-3 py-2 text-center w-8"></th>
                    <th className="px-3 py-2 text-center">Después</th>
                  </tr>
                </thead>
                <tbody className="divide-y border">
                  {Object.entries(changes).map(([key, val]) => (
                    <tr key={key}>
                      <td className="px-3 py-2 font-bold capitalize text-slate-700">
                        {key === 'title'
                          ? 'Nombre'
                          : key === 'purchasePrice'
                          ? 'Costo'
                          : key === 'price'
                          ? 'Precio'
                          : key === 'stock'
                          ? 'Stock'
                          : key === 'category'
                          ? 'Categoría'
                          : key}
                      </td>
                      <td className="px-3 py-2 text-center text-red-500 bg-red-50 line-through">
                        {key.toLowerCase().includes('price')
                          ? `$${val.old}`
                          : val.old}
                      </td>
                      <td className="px-3 py-2 text-center text-slate-300">
                        <ArrowRight size={14} />
                      </td>
                      <td className="px-3 py-2 text-center text-green-600 bg-green-50 font-bold">
                        {key.toLowerCase().includes('price')
                          ? `$${val.new}`
                          : val.new}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-slate-400 italic text-sm">
                Sin cambios detallados registrados.
              </p>
            )}
          </div>
        );
      }

      case 'Cierre de Caja':
      case 'Cierre Automático': {
        return (
          <div className="space-y-3">
            {action === 'Cierre Automático' && (
              <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-600" />
                <span className="text-xs font-bold text-amber-700">
                  Cierre automático por el sistema
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-slate-50 p-3 rounded-lg border">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Caja Inicial
                </p>
                <p className="text-lg font-bold text-slate-700">
                  ${(details.openingBalance || 0).toLocaleString()}
                </p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                <p className="text-[10px] font-bold text-green-600 uppercase mb-1">
                  Ventas del Día
                </p>
                <p className="text-lg font-bold text-green-700">
                  +${(details.totalSales || 0).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="bg-slate-800 p-4 rounded-lg text-white">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">
                    Total al Cierre
                  </p>
                  <p className="text-2xl font-bold">
                    ${(details.finalBalance || 0).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">
                    Hora
                  </p>
                  <p className="text-lg font-mono">
                    {details.closingTime || '-'}
                  </p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 flex items-center justify-between">
                <span className="text-xs font-bold text-blue-700">
                  Operaciones
                </span>
                <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                  {details.salesCount || 0}
                </span>
              </div>
              {details.scheduledClosingTime && (
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-700">
                    Programado
                  </span>
                  <span className="bg-amber-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                    {details.scheduledClosingTime}
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      }

      case 'Apertura de Caja': {
        return (
          <div className="space-y-3">
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
                  <DollarSign size={24} className="text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-green-600 uppercase">
                    Monto Inicial
                  </p>
                  <p className="text-2xl font-bold text-green-800">
                    ${(details.amount || 0).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
            {details.scheduledClosingTime && (
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-blue-600" />
                  <span className="text-xs font-bold text-blue-700">
                    Cierre Programado
                  </span>
                </div>
                <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                  {details.scheduledClosingTime}
                </span>
              </div>
            )}
          </div>
        );
      }

      case 'Categoría': {
        const isCreate = details.type === 'create';
        const isDelete = details.type === 'delete';
        const isEdit = details.type === 'edit';

        return (
          <div className="space-y-3">
            <div
              className={`p-4 rounded-lg border flex items-center gap-3 ${
                isCreate
                  ? 'bg-green-50 border-green-200'
                  : isDelete
                  ? 'bg-red-50 border-red-200'
                  : 'bg-blue-50 border-blue-200'
              }`}
            >
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  isCreate
                    ? 'bg-green-500'
                    : isDelete
                    ? 'bg-red-500'
                    : 'bg-blue-500'
                }`}
              >
                <Tag size={24} className="text-white" />
              </div>
              <div>
                <p
                  className={`text-[10px] font-bold uppercase ${
                    isCreate
                      ? 'text-green-600'
                      : isDelete
                      ? 'text-red-600'
                      : 'text-blue-600'
                  }`}
                >
                  {isCreate
                    ? 'Categoría Creada'
                    : isDelete
                    ? 'Categoría Eliminada'
                    : 'Categoría Renombrada'}
                </p>
                {isEdit && details.oldName ? (
                  <div className="flex items-center gap-2">
                    <span className="text-lg text-red-400 line-through">
                      {details.oldName}
                    </span>
                    <ArrowRight size={18} className="text-slate-400" />
                    <span className="text-xl font-bold text-slate-800">
                      {details.name}
                    </span>
                  </div>
                ) : (
                  <p className="text-xl font-bold text-slate-800">
                    {details.name}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      }

      case 'Alta de Producto': {
        return (
          <div className="space-y-3">
            <div className="bg-green-50 p-3 rounded-lg border border-green-200 flex items-center gap-2">
              <Package size={18} className="text-green-600" />
              <span className="font-bold text-green-800 text-sm">
                Nuevo Producto Registrado
              </span>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <tbody className="divide-y">
                  <tr className="bg-slate-50">
                    <td className="px-3 py-2 font-bold text-slate-500 w-1/3">
                      Nombre
                    </td>
                    <td className="px-3 py-2 font-bold text-slate-800">
                      {details.title || '-'}
                    </td>
                  </tr>
                  {details.brand && (
                    <tr>
                      <td className="px-3 py-2 font-bold text-slate-500">
                        Marca
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {details.brand}
                      </td>
                    </tr>
                  )}
                  <tr className="bg-slate-50">
                    <td className="px-3 py-2 font-bold text-slate-500">
                      Categoría
                    </td>
                    <td className="px-3 py-2">
                      <span className="bg-fuchsia-100 text-fuchsia-700 px-2 py-0.5 rounded text-[10px] font-bold">
                        {details.category || 'Sin categoría'}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-bold text-slate-500">
                      Precio Costo
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      ${(details.purchasePrice || 0).toLocaleString()}
                    </td>
                  </tr>
                  <tr className="bg-slate-50">
                    <td className="px-3 py-2 font-bold text-slate-500">
                      Precio Venta
                    </td>
                    <td className="px-3 py-2 font-bold text-green-600">
                      ${(details.price || 0).toLocaleString()}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-bold text-slate-500">
                      Stock Inicial
                    </td>
                    <td className="px-3 py-2">
                      <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold">
                        {details.stock || 0} unidades
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      case 'Baja Producto': {
        return (
          <div className="space-y-3">
            <div className="bg-red-50 p-3 rounded-lg border border-red-200 flex items-center gap-2">
              <Trash2 size={18} className="text-red-600" />
              <span className="font-bold text-red-800 text-sm">
                Producto Eliminado
              </span>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <tbody className="divide-y">
                  <tr className="bg-slate-50">
                    <td className="px-3 py-2 font-bold text-slate-500 w-1/3">
                      Nombre
                    </td>
                    <td className="px-3 py-2 font-bold text-slate-800">
                      {details.title || '-'}
                    </td>
                  </tr>
                  {details.brand && (
                    <tr>
                      <td className="px-3 py-2 font-bold text-slate-500">
                        Marca
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {details.brand}
                      </td>
                    </tr>
                  )}
                  <tr className="bg-slate-50">
                    <td className="px-3 py-2 font-bold text-slate-500">
                      Categoría
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {details.category || '-'}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 font-bold text-slate-500">
                      Precio
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      ${(details.price || 0).toLocaleString()}
                    </td>
                  </tr>
                  <tr className="bg-red-50">
                    <td className="px-3 py-2 font-bold text-red-500">
                      Stock al eliminar
                    </td>
                    <td className="px-3 py-2 font-bold text-red-600">
                      {details.stock || 0} unidades
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      case 'Horario Modificado': {
        return (
          <div className="bg-amber-50 p-4 rounded-lg border border-amber-200 flex items-center gap-3">
            <div className="w-12 h-12 bg-amber-600 rounded-full flex items-center justify-center">
              <Clock size={24} className="text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-amber-600 uppercase">
                Nuevo Horario
              </p>
              <p className="text-lg font-bold text-slate-800">
                {typeof details === 'string' ? details : 'Horario actualizado'}
              </p>
            </div>
          </div>
        );
      }

      case 'Sistema Iniciado': {
        return (
          <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 flex items-center gap-3">
            <div className="w-12 h-12 bg-slate-600 rounded-full flex items-center justify-center">
              <Power size={24} className="text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-500 uppercase">
                Estado
              </p>
              <p className="text-lg font-bold text-slate-800">
                Sistema inicializado correctamente
              </p>
            </div>
          </div>
        );
      }

      case 'Borrado Permanente': {
        return (
          <div className="bg-red-50 p-4 rounded-lg border border-red-200 flex items-center gap-3">
            <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center">
              <Trash2 size={24} className="text-white" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-red-600 uppercase">
                Registro Eliminado
              </p>
              <p className="text-lg font-bold text-slate-800">
                {typeof details === 'string'
                  ? details
                  : `ID: ${getTransactionId(details) || 'N/A'}`}
              </p>
            </div>
          </div>
        );
      }

      default: {
        // Intentar detectar por estructura antes de mostrar JSON
        if (details.items && details.total && details.payment) {
          // Parece una venta
          const txId = getTransactionId(details);
          const items = details.items || [];
          return (
            <div className="space-y-3">
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-green-50 p-3 flex justify-between items-center border-b border-green-100">
                  <span className="font-bold text-green-800 text-sm">
                    Venta #{txId}
                  </span>
                  <span className="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                    ${(details.total || 0).toLocaleString()}
                  </span>
                </div>
                <div className="p-3 bg-white">
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {items.map((item, idx) => (
                      <div
                        key={idx}
                        className="text-xs flex justify-between items-center text-slate-600 bg-slate-50 p-2 rounded"
                      >
                        <span>
                          {item.qty || item.quantity}x {item.title}
                        </span>
                        <span className="font-bold">
                          $
                          {(
                            (item.price || 0) * (item.qty || item.quantity || 0)
                          ).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        }

        if (details.changes || details.productChanges) {
          // Parece una modificación
          const txId = getTransactionId(details);
          return (
            <div className="space-y-4">
              <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 flex items-center justify-between">
                <span className="text-xs font-bold text-blue-700">
                  Pedido Modificado
                </span>
                <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-bold">
                  #{txId}
                </span>
              </div>
              {details.itemsSnapshot && details.itemsSnapshot.length > 0 && (
                <div className="border rounded bg-slate-50 p-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">
                    Estado Final
                  </p>
                  <div className="space-y-1">
                    {details.itemsSnapshot.map((item, idx) => (
                      <div
                        key={idx}
                        className="text-xs flex justify-between bg-white p-2 border rounded"
                      >
                        <span>
                          {item.qty}x {item.title}
                        </span>
                        <span>
                          $
                          {(
                            (Number(item.price) || 0) * (Number(item.qty) || 0)
                          ).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        }

        // Último recurso: mostrar JSON
        return (
          <div className="bg-slate-900 rounded-lg p-3 overflow-x-auto">
            <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap">
              {JSON.stringify(details, null, 2)}
            </pre>
          </div>
        );
      }
    }
  };

  const getDetailTitle = (action) => {
    const titles = {
      'Venta Realizada': 'Detalles de la Venta',
      'Venta Anulada': 'Detalles de la Anulación',
      'Apertura de Caja': 'Detalles de Caja',
      'Cierre de Caja': 'Detalles de Caja',
      'Cierre Automático': 'Detalles de Caja',
      'Edición Producto': 'Cambios en el Producto',
      'Modificación Pedido': 'Cambios en el Pedido',
      'Alta de Producto': 'Datos del Producto',
      'Baja Producto': 'Producto Eliminado',
      Categoría: 'Detalles de la Categoría',
      'Horario Modificado': 'Cambio de Horario',
      'Sistema Iniciado': 'Información del Sistema',
      'Borrado Permanente': 'Registro Eliminado',
    };
    return titles[action] || 'Detalles';
  };

  // =====================================================
  // RENDER PRINCIPAL
  // =====================================================

  // Generador de acciones aleatorias
  const generateRandomActions = () => {
    const {
      count,
      dateStart,
      dateEnd,
      includeVentas,
      includeCaja,
      includeProductos,
      includeCategorias,
    } = generatorConfig;

    const products = inventory || [];
    const payments = ['Efectivo', 'MercadoPago', 'Debito', 'Credito'];
    const users = ['Dueño', 'Vendedor'];
    const categories = [
      'Globos',
      'Descartables',
      'Disfraces',
      'Decoración',
      'Luminoso',
    ];

    const end = dateEnd ? new Date(dateEnd + 'T23:59:59') : new Date();
    const start = dateStart
      ? new Date(dateStart + 'T00:00:00')
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const newLogs = [];
    const actionTypes = [];

    if (includeVentas) actionTypes.push('venta', 'venta_anulada');
    if (includeCaja) actionTypes.push('apertura', 'cierre');
    if (includeProductos && products.length > 0)
      actionTypes.push('edicion_producto', 'alta_producto');
    if (includeCategorias) actionTypes.push('categoria');

    if (actionTypes.length === 0) {
      alert('Selecciona al menos un tipo de acción');
      return;
    }

    for (let i = 0; i < count; i++) {
      const randomTime =
        start.getTime() + Math.random() * (end.getTime() - start.getTime());
      const randomDate = new Date(randomTime);

      let randomHour = 9 + Math.floor(Math.random() * 12);
      if (randomHour >= 14 && randomHour < 16) randomHour = 16;
      const randomMinute = Math.floor(Math.random() * 60);

      const day = randomDate.getDate().toString().padStart(2, '0');
      const month = (randomDate.getMonth() + 1).toString().padStart(2, '0');
      const year = randomDate.getFullYear();
      const dateStr = `${day}/${month}/${year}`;
      const timeStr = `${randomHour.toString().padStart(2, '0')}:${randomMinute
        .toString()
        .padStart(2, '0')}`;

      const actionType =
        actionTypes[Math.floor(Math.random() * actionTypes.length)];
      const user = users[Math.floor(Math.random() * users.length)];

      let log = {
        id: Date.now() + i + Math.random(),
        timestamp: timeStr,
        date: dateStr,
        user: user,
      };

      switch (actionType) {
        case 'venta': {
          const numProducts = 1 + Math.floor(Math.random() * 4);
          const selectedProducts = [];
          for (let j = 0; j < numProducts && products.length > 0; j++) {
            const product =
              products[Math.floor(Math.random() * products.length)];
            selectedProducts.push({
              title: product.title,
              price: product.price,
              qty: 1 + Math.floor(Math.random() * 3),
            });
          }
          const total = selectedProducts.reduce(
            (sum, p) => sum + p.price * p.qty,
            0
          );
          log.action = 'Venta Realizada';
          log.details = {
            transactionId: 1000 + Math.floor(Math.random() * 9000),
            items: selectedProducts,
            total: total,
            payment: payments[Math.floor(Math.random() * payments.length)],
          };
          break;
        }
        case 'venta_anulada': {
          log.action = 'Venta Anulada';
          log.details = {
            transactionId: 1000 + Math.floor(Math.random() * 9000),
            originalTotal: 5000 + Math.floor(Math.random() * 50000),
          };
          log.reason = 'Cliente solicitó anulación';
          break;
        }
        case 'apertura': {
          log.action = 'Apertura de Caja';
          log.user = 'Dueño';
          log.details = {
            amount: 10000 + Math.floor(Math.random() * 40000),
            scheduledClosingTime: '21:00',
          };
          break;
        }
        case 'cierre': {
          log.action = 'Cierre de Caja';
          log.user = 'Dueño';
          log.details = {
            salesCount: 5 + Math.floor(Math.random() * 30),
            totalSales: 20000 + Math.floor(Math.random() * 200000),
            finalBalance: 30000 + Math.floor(Math.random() * 250000),
            closingTime: timeStr,
          };
          break;
        }
        case 'edicion_producto': {
          const product = products[Math.floor(Math.random() * products.length)];
          log.action = 'Edición Producto';
          log.details = {
            product: product.title,
            productId: product.id,
            changes: {
              price: { from: product.price - 500, to: product.price },
            },
          };
          break;
        }
        case 'alta_producto': {
          log.action = 'Alta de Producto';
          log.details = {
            title: 'Producto de Prueba ' + Math.floor(Math.random() * 100),
            price: 1000 + Math.floor(Math.random() * 10000),
            stock: 10 + Math.floor(Math.random() * 50),
            category: categories[Math.floor(Math.random() * categories.length)],
          };
          break;
        }
        case 'categoria': {
          const catName =
            categories[Math.floor(Math.random() * categories.length)];
          log.action = 'Categoría';
          log.details = {
            type: Math.random() > 0.5 ? 'create' : 'delete',
            name: catName,
          };
          break;
        }
      }

      newLogs.push(log);
    }

    if (newLogs.length > 0 && setDailyLogs) {
      setDailyLogs((prev) => [...newLogs, ...(prev || [])]);
    }

    setShowGeneratorModal(false);
    alert(`✅ Se generaron ${newLogs.length} acciones exitosamente`);
  };

  const clearAllLogs = () => {
    if (setDailyLogs) setDailyLogs([]);
    setShowDeleteModal(false);
    alert('✅ Registro de acciones eliminado');
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden h-full flex flex-col">
      <div className="p-3 border-b bg-slate-50 shrink-0">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
            <FileText size={16} className="text-amber-600" /> Registro de
            Acciones
          </h3>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
              >
                <FilterX size={12} /> Limpiar
              </button>
            )}
            <span className="text-xs bg-slate-200 px-2 py-0.5 rounded text-slate-600 font-bold">
              {sortedLogs.length}
            </span>
          </div>
        </div>

        {/* Botones de acción */}
        {setDailyLogs && (
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setShowGeneratorModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 transition"
            >
              <Wand2 size={14} /> Generar Acciones de Prueba
            </button>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-bold hover:bg-red-600 transition"
            >
              <Trash2 size={14} /> Limpiar Registro
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-2 items-end">
          {/* Fecha Desde */}
          <div className="min-w-[120px]">
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
              Desde
            </label>
            <div className="relative">
              <Calendar
                size={12}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="date"
                className="w-full pl-7 pr-1 py-1.5 text-xs border rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                value={filterDateStart}
                onChange={(e) => setFilterDateStart(e.target.value)}
              />
            </div>
          </div>

          {/* Fecha Hasta */}
          <div className="min-w-[120px]">
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
              Hasta
            </label>
            <div className="relative">
              <Calendar
                size={12}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="date"
                className="w-full pl-7 pr-1 py-1.5 text-xs border rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                value={filterDateEnd}
                onChange={(e) => setFilterDateEnd(e.target.value)}
              />
            </div>
          </div>

          {/* Usuario */}
          <div className="min-w-[100px]">
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
              Usuario
            </label>
            <div className="relative">
              <User
                size={12}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <select
                className="w-full pl-7 pr-6 py-1.5 text-xs border rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white appearance-none cursor-pointer"
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
              >
                <option value="">Todos</option>
                <option value="Dueño">Dueño</option>
                <option value="Vendedor">Vendedor</option>
                <option value="Sistema">Sistema</option>
              </select>
              <ChevronDown
                size={12}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
            </div>
          </div>

          {/* Acción */}
          <div className="min-w-[130px]">
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
              Acción
            </label>
            <div className="relative">
              <FileText
                size={12}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <select
                className="w-full pl-7 pr-6 py-1.5 text-xs border rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white appearance-none cursor-pointer"
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
              >
                <option value="">Todas</option>
                {uniqueActions.map((act) => (
                  <option key={act} value={act}>
                    {act}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={12}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
            </div>
          </div>

          {/* Buscar */}
          <div className="flex-1 min-w-[150px]">
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1 block">
              Buscar
            </label>
            <div className="relative">
              <Search
                size={12}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
              />
              <input
                type="text"
                placeholder="Producto, ID, monto..."
                className="w-full pl-7 pr-2 py-1.5 text-xs border rounded-md focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none bg-white"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-100 text-slate-500 font-medium sticky top-0 shadow-sm z-10">
            <tr>
              <th
                className="px-4 py-3 w-36 cursor-pointer hover:bg-slate-200 transition-colors select-none"
                onClick={() => handleSort('datetime')}
              >
                <div className="flex items-center gap-1">
                  <Calendar size={12} className="text-slate-400" />
                  Fecha / Hora
                  <SortIcon column="datetime" />
                </div>
              </th>
              <th
                className="px-4 py-3 w-24 cursor-pointer hover:bg-slate-200 transition-colors select-none"
                onClick={() => handleSort('user')}
              >
                <div className="flex items-center gap-1">
                  Usuario
                  <SortIcon column="user" />
                </div>
              </th>
              <th
                className="px-4 py-3 w-40 cursor-pointer hover:bg-slate-200 transition-colors select-none"
                onClick={() => handleSort('action')}
              >
                <div className="flex items-center gap-1">
                  Acción
                  <SortIcon column="action" />
                </div>
              </th>
              <th className="px-4 py-3">Resumen</th>
              <th className="px-4 py-3 w-12 text-center">Info</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortedLogs.map((log) => (
              <tr key={log.id} className="hover:bg-amber-50 transition-colors">
                <td className="px-4 py-2">
                  <div className="flex flex-col">
                    <span className="text-slate-700 font-medium">
                      {log.date || '-'}
                    </span>
                    <span className="text-slate-400 font-mono text-[10px]">
                      {log.timestamp}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                      log.user === 'Dueño'
                        ? 'bg-blue-100 text-blue-700'
                        : log.user === 'Sistema'
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {log.user}
                  </span>
                </td>
                <td className="px-4 py-2 font-bold text-slate-700 text-[11px]">
                  {log.action}
                </td>
                <td className="px-4 py-2">{getSummary(log)}</td>
                <td className="px-4 py-2 text-center">
                  <button
                    onClick={() => setSelectedLog(log)}
                    className="text-amber-600 hover:bg-amber-100 p-1.5 rounded transition-colors"
                  >
                    <Eye size={16} />
                  </button>
                </td>
              </tr>
            ))}
            {sortedLogs.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-10 text-slate-400">
                  No se encontraron registros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedLog && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b bg-amber-50 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-slate-800 text-lg">
                  Detalle de Registro
                </h3>
                <p className="text-xs text-slate-500">ID: {selectedLog.id}</p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">
                    Usuario
                  </p>
                  <p className="font-medium text-slate-800">
                    {selectedLog.user}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">
                    Fecha
                  </p>
                  <p className="font-medium text-slate-800">
                    {selectedLog.date} {selectedLog.timestamp}
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">
                    Acción
                  </p>
                  <p className="font-bold text-amber-700">
                    {selectedLog.action}
                  </p>
                </div>
              </div>
              {selectedLog.reason ? (
                <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg">
                  <p className="text-[10px] font-bold text-yellow-600 uppercase mb-1 flex items-center gap-1">
                    <FileText size={12} /> Nota
                  </p>
                  <p className="text-sm text-slate-800 italic">
                    "{selectedLog.reason}"
                  </p>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-100 p-2 rounded-lg text-center">
                  <p className="text-[10px] text-slate-400 italic">
                    Sin nota adicional
                  </p>
                </div>
              )}
              <div className="border-t pt-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase mb-2">
                  {getDetailTitle(selectedLog.action)}
                </p>
                <RenderDetailContent log={selectedLog} />
              </div>
            </div>
            <div className="p-4 border-t bg-slate-50 text-right shrink-0">
              <button
                onClick={() => setSelectedLog(null)}
                className="bg-slate-800 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-slate-700"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Generador */}
      {showGeneratorModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-4 border-b flex justify-between items-center bg-amber-500">
              <h4 className="font-bold text-white flex items-center gap-2">
                <Wand2 size={18} /> Generar Acciones de Prueba
              </h4>
              <button
                onClick={() => setShowGeneratorModal(false)}
                className="text-white/80 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                  Cantidad
                </label>
                <input
                  type="number"
                  min="1"
                  max="200"
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                  value={generatorConfig.count}
                  onChange={(e) =>
                    setGeneratorConfig({
                      ...generatorConfig,
                      count: parseInt(e.target.value) || 1,
                    })
                  }
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                    Desde
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    value={generatorConfig.dateStart}
                    onChange={(e) =>
                      setGeneratorConfig({
                        ...generatorConfig,
                        dateStart: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                    Hasta
                  </label>
                  <input
                    type="date"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    value={generatorConfig.dateEnd}
                    onChange={(e) =>
                      setGeneratorConfig({
                        ...generatorConfig,
                        dateEnd: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">
                  Tipos de acciones a generar
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={generatorConfig.includeVentas}
                      onChange={(e) =>
                        setGeneratorConfig({
                          ...generatorConfig,
                          includeVentas: e.target.checked,
                        })
                      }
                      className="rounded"
                    />
                    <span>Ventas y Anulaciones</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={generatorConfig.includeCaja}
                      onChange={(e) =>
                        setGeneratorConfig({
                          ...generatorConfig,
                          includeCaja: e.target.checked,
                        })
                      }
                      className="rounded"
                    />
                    <span>Apertura/Cierre de Caja</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={generatorConfig.includeProductos}
                      onChange={(e) =>
                        setGeneratorConfig({
                          ...generatorConfig,
                          includeProductos: e.target.checked,
                        })
                      }
                      className="rounded"
                    />
                    <span>Edición/Alta de Productos</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={generatorConfig.includeCategorias}
                      onChange={(e) =>
                        setGeneratorConfig({
                          ...generatorConfig,
                          includeCategorias: e.target.checked,
                        })
                      }
                      className="rounded"
                    />
                    <span>Categorías</span>
                  </label>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                <p>
                  ⚡ Se generarán acciones variadas aleatorias basadas en los
                  tipos seleccionados.
                </p>
              </div>
            </div>
            <div className="p-4 border-t flex gap-2 justify-end">
              <button
                onClick={() => setShowGeneratorModal(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                onClick={generateRandomActions}
                className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg font-bold hover:bg-amber-600 transition"
              >
                Generar {generatorConfig.count} Acciones
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Eliminar */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full">
            <div className="p-4 border-b flex justify-between items-center bg-red-500">
              <h4 className="font-bold text-white flex items-center gap-2">
                <AlertTriangle size={18} /> Eliminar Registro
              </h4>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="text-white/80 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4">
              <p className="text-sm text-slate-600 mb-4">
                Esta acción eliminará{' '}
                <strong>todos los registros de acciones</strong>. No se puede
                deshacer.
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                <p className="font-bold">Se eliminarán:</p>
                <p>• {safeLogs.length} registros de acciones</p>
              </div>
            </div>
            <div className="p-4 border-t flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                onClick={clearAllLogs}
                className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg font-bold hover:bg-red-600 transition"
              >
                Eliminar Todo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
