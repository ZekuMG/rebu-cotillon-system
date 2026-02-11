// ♻️ REFACTOR: Helpers movidos a utils/helpers.js, generador a utils/devGenerator.js,
//              modales a components/modals/HistoryModals.jsx

import React, { useState, useMemo } from 'react';
import {
  History,
  Trash2,
  Edit2,
  XCircle,
  Eye,
  X,
  Search,
  Wand2,
  ArrowUpDown,
  FileText,
} from 'lucide-react';
import { PAYMENT_METHODS } from '../data';
import { normalizeDate, isVentaLog, getVentaTotal } from '../utils/helpers';
import { generateRandomTransactions } from '../utils/devGenerator';
import {
  TransactionDetailModal,
  GeneratorModal,
  DeleteHistoryModal,
} from '../components/modals/HistoryModals';

// --- HELPER LOCAL PARA FORMATO VISUAL ---
const formatDisplayDate = (dateString) => {
  if (!dateString) return '';
  const parts = dateString.split('/');
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
  }
  return dateString;
};

export default function HistoryView({
  transactions,
  dailyLogs,
  inventory,
  currentUser,
  onDeleteTransaction,
  onEditTransaction,
  setTransactions,
  setDailyLogs,
  showNotification,
  onViewTicket,
}) {
  // Estados de filtros
  const [viewMode, setViewMode] = useState('all');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterProduct, setFilterProduct] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');

  // Modal de detalle
  const [selectedTx, setSelectedTx] = useState(null);

  // Modal generador y borrar
  const [showGeneratorModal, setShowGeneratorModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [generatorConfig, setGeneratorConfig] = useState({
    count: 30,
    dateStart: '',
    dateEnd: '',
    timeStart: '09',
    timeEnd: '21',
  });

  // =====================================================
  // TRANSACCIONES HISTÓRICAS (desde logs)
  // =====================================================
  const historicTransactions = useMemo(() => {
    const txList = [];
    const activeIds = new Set((transactions || []).map(t => t.id));

    (dailyLogs || []).forEach((log) => {
      if (isVentaLog(log) && log.details) {
        const txId = log.details.transactionId || log.id;
        // Evitar duplicados si ya está en activas
        if (activeIds.has(txId)) return;

        const logDate = normalizeDate(log.date);
        if (logDate) {
            // CORRECCIÓN PRECIOS: Priorizamos el total explícito en details, luego el helper
            const safeTotal = Number(log.details.total) || getVentaTotal(log.details) || 0;

            txList.push({
                id: txId,
                date: log.date,
                timestamp: log.timestamp,
                fullDate: `${log.date}, ${log.timestamp || '00:00'}:00`,
                user: log.user, // En logs antiguos, este es el usuario confiable
                items: log.details.items || [],
                payment: log.details.payment || 'N/A',
                installments: log.details.installments || 0,
                total: safeTotal,
                status: 'completed',
                isHistoric: true,
                sortDate: new Date(logDate.year, logDate.month - 1, logDate.day),
            });
        }
      }
    });
    return txList;
  }, [dailyLogs, transactions]);

  // =====================================================
  // TRANSACCIONES ACTIVAS (con correlación de Logs)
  // =====================================================
  const activeTransactions = useMemo(() => {
    return (transactions || []).map((tx) => {
      const logDate = normalizeDate(tx.date);
      
      // CORRELACIÓN DE LOGS: 
      // Si el usuario es 'Desconocido' o nulo, buscamos en el historial de logs (dailyLogs)
      // quién generó esta venta para mostrar el nombre correcto.
      let resolvedUser = tx.user;
      if (!resolvedUser || resolvedUser === 'Desconocido') {
          const creationLog = (dailyLogs || []).find(log => 
              (log.action === 'Venta Realizada' && String(log.details?.transactionId) === String(tx.id))
          );
          if (creationLog) {
              resolvedUser = creationLog.user;
          }
      }

      return {
        ...tx,
        user: resolvedUser || 'Desconocido', // Usuario correlacionado
        isHistoric: false,
        sortDate: logDate
          ? new Date(logDate.year, logDate.month - 1, logDate.day)
          : new Date(),
      };
    });
  }, [transactions, dailyLogs]); // Dependencia agregada: dailyLogs

  // =====================================================
  // COMBINAR Y FILTRAR
  // =====================================================
  const filteredTransactions = useMemo(() => {
    let txList = [];

    if (viewMode === 'today') {
      const today = new Date();
      today.setHours(0,0,0,0);
      txList = [...activeTransactions, ...historicTransactions].filter(tx => {
         const txDate = new Date(tx.sortDate);
         txDate.setHours(0,0,0,0);
         return txDate.getTime() === today.getTime();
      });
    } else if (viewMode === 'history') {
      txList = historicTransactions;
    } else {
      txList = [...activeTransactions, ...historicTransactions];
    }

    if (filterDateStart) {
      const startDate = new Date(filterDateStart);
      txList = txList.filter((tx) => tx.sortDate >= startDate);
    }
    if (filterDateEnd) {
      const endDate = new Date(filterDateEnd);
      endDate.setHours(23, 59, 59);
      txList = txList.filter((tx) => tx.sortDate <= endDate);
    }

    if (filterPayment) {
      txList = txList.filter((tx) => tx.payment === filterPayment);
    }
    if (filterUser) {
      txList = txList.filter((tx) => tx.user === filterUser);
    }
    if (filterProduct) {
      txList = txList.filter((tx) =>
        (tx.items || []).some((item) =>
          item.title?.toLowerCase().includes(filterProduct.toLowerCase())
        )
      );
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      txList = txList.filter((tx) => {
        const idMatch = String(tx.id).includes(query);
        const userMatch = tx.user?.toLowerCase().includes(query);
        const paymentMatch = tx.payment?.toLowerCase().includes(query);
        const dateMatch = tx.date?.toLowerCase().includes(query);
        const itemsMatch = (tx.items || []).some((item) =>
          item.title?.toLowerCase().includes(query)
        );
        const totalMatch = String(tx.total).includes(query);
        return idMatch || userMatch || paymentMatch || dateMatch || itemsMatch || totalMatch;
      });
    }

    txList.sort((a, b) => {
      const dateA = a.sortDate?.getTime() || 0;
      const dateB = b.sortDate?.getTime() || 0;
      if (dateA !== dateB) {
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      }
      return sortOrder === 'desc' ? b.id - a.id : a.id - b.id;
    });

    return txList;
  }, [
    viewMode, activeTransactions, historicTransactions,
    filterDateStart, filterDateEnd, filterPayment,
    filterUser, filterProduct, searchQuery, sortOrder,
  ]);

  const stats = useMemo(() => {
    const validTx = filteredTransactions.filter((tx) => tx.status !== 'voided');
    return {
      count: validTx.length,
      total: validTx.reduce((sum, tx) => sum + (Number(tx.total) || 0), 0),
    };
  }, [filteredTransactions]);

  const productsList = useMemo(() => {
    const products = new Set();
    [...(transactions || []), ...historicTransactions].forEach((tx) => {
      (tx.items || []).forEach((item) => {
        if (item.title) products.add(item.title);
      });
    });
    return Array.from(products).sort();
  }, [transactions, historicTransactions]);

  const clearFilters = () => {
    setFilterDateStart('');
    setFilterDateEnd('');
    setFilterPayment('');
    setFilterUser('');
    setFilterProduct('');
    setSearchQuery('');
  };

  const hasActiveFilters =
    filterDateStart || filterDateEnd || filterPayment ||
    filterUser || filterProduct || searchQuery;

  // =====================================================
  // ACCIONES DEL GENERADOR (delega a devGenerator.js)
  // =====================================================
  const handleGenerate = () => {
    const result = generateRandomTransactions(generatorConfig, inventory);

    if (result.error) {
      if (showNotification) showNotification('warning', 'Sin productos', result.error);
      else alert(result.error);
      return;
    }

    if (result.logs.length > 0 && setDailyLogs) {
      setDailyLogs((prev) => [...result.logs, ...(prev || [])]);
    }
    if (result.transactions.length > 0 && setTransactions) {
      setTransactions((prev) => [...result.transactions, ...(prev || [])]);
    }

    setShowGeneratorModal(false);

    if (showNotification) showNotification('success', 'Generación Exitosa', `Se generaron ${result.transactions.length} pedidos editables.`);
    else alert(`✅ Se generaron ${result.transactions.length} pedidos editables.`);
  };

  const clearAllTransactions = () => {
    if (setTransactions) setTransactions([]);
    if (setDailyLogs) {
      setDailyLogs((prev) => (prev || []).filter((log) => !isVentaLog(log)));
    }
    setShowDeleteModal(false);

    if (showNotification) showNotification('success', 'Historial Limpio', 'Se han eliminado todas las transacciones.');
    else alert('✅ Historial de transacciones eliminado');
  };

  // =====================================================
  // RENDER
  // =====================================================
  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden h-full flex flex-col">
      {/* Header Compacto */}
      <div className="p-3 border-b bg-slate-50 shrink-0 space-y-3">
        {/* Fila 1: Título, Stats y Botones Admin */}
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
              <History size={16} className="text-blue-600" /> Historial
            </h3>
            <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">
              {stats.count} ventas • ${stats.total.toLocaleString()}
            </span>
          </div>

          {currentUser.role === 'admin' && (
            <div className="flex gap-2">
              <button
                onClick={() => setShowGeneratorModal(true)}
                className="flex items-center gap-1 px-2 py-1 bg-fuchsia-100 text-fuchsia-700 rounded border border-fuchsia-200 text-[10px] font-bold hover:bg-fuchsia-200 transition"
              >
                <Wand2 size={12} /> Generar
              </button>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded border border-red-200 text-[10px] font-bold hover:bg-red-200 transition"
              >
                <Trash2 size={12} /> Limpiar
              </button>
            </div>
          )}
        </div>

        {/* Fila 2: Filtros Compactos */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {/* Buscador */}
          <div className="relative min-w-[140px]">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar..."
              className="w-full pl-7 pr-2 py-1 text-xs border rounded focus:outline-none focus:border-blue-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Selector Vista */}
          <select
            className="px-2 py-1 text-xs border rounded bg-white focus:outline-none min-w-[80px]"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value)}
          >
            <option value="all">Todo</option>
            <option value="today">Hoy</option>
            <option value="history">Historial</option>
          </select>

          {/* Fechas */}
          <div className="flex items-center gap-1 bg-white border rounded px-1 py-0.5">
            <input
              type="date"
              className="text-[10px] bg-transparent outline-none w-20"
              value={filterDateStart}
              onChange={(e) => setFilterDateStart(e.target.value)}
            />
            <span className="text-[10px] text-slate-400">-</span>
            <input
              type="date"
              className="text-[10px] bg-transparent outline-none w-20"
              value={filterDateEnd}
              onChange={(e) => setFilterDateEnd(e.target.value)}
            />
          </div>

          {/* Pago */}
          <select
            className="px-2 py-1 text-xs border rounded bg-white focus:outline-none max-w-[145px]"
            value={filterPayment}
            onChange={(e) => setFilterPayment(e.target.value)}
          >
            <option value="">Metodo de Pago</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>

          {/* Usuario */}
          <select
            className="px-2 py-1 text-xs border rounded bg-white focus:outline-none max-w-[110px]"
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
          >
            <option value="">Usuario</option>
            <option value="Dueño">Dueño</option>
            <option value="Vendedor">Vendedor</option>
          </select>

          {/* Producto */}
          <select
            className="px-2 py-1 text-xs border rounded bg-white focus:outline-none max-w-[110px]"
            value={filterProduct}
            onChange={(e) => setFilterProduct(e.target.value)}
          >
            <option value="">Productos</option>
            {productsList.slice(0, 20).map((p) => (
              <option key={p} value={p}>
                {p.length > 15 ? p.substring(0, 15) + '...' : p}
              </option>
            ))}
          </select>

          {/* Orden */}
          <button
            onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
            className="p-1 rounded border bg-white hover:bg-slate-50 text-slate-500"
            title="Cambiar Orden"
          >
            <ArrowUpDown size={12} />
          </button>

          {/* Limpiar */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="p-1 rounded bg-red-100 text-red-600 hover:bg-red-200"
              title="Limpiar filtros"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left">ID & Fecha</th>
              <th className="px-4 py-3 text-left">Usuario</th>
              <th className="px-4 py-3 text-left">Detalle</th>
              <th className="px-4 py-3 text-left">Pago</th>
              <th className="px-4 py-3 text-right">Monto</th>
              {currentUser.role === 'admin' && (
                <th className="px-4 py-3 text-center">Acciones</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredTransactions.map((tx, index) => {
              const isVoided = tx.status === 'voided';
              const isHistoric = tx.isHistoric;

              return (
                <tr
                  key={`${tx.id}-${index}`}
                  className={`transition-colors ${
                    isVoided
                      ? 'bg-red-50'
                      : isHistoric
                      ? 'bg-slate-50/50 hover:bg-slate-100'
                      : 'hover:bg-blue-50'
                  }`}
                >
                  <td className="px-4 py-3">
                    <p
                      className={`font-mono font-bold ${
                        isVoided
                          ? 'text-red-800 line-through'
                          : 'text-slate-700'
                      }`}
                    >
                      #{String(tx.id).padStart(6, '0')}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {/* AQUÍ USAMOS EL HELPER PARA NORMALIZAR LA FECHA VISUALMENTE */}
                      {formatDisplayDate(tx.date)}
                      {(tx.time || tx.timestamp) && ` ${tx.time || tx.timestamp}`}
                    </p>
                    {isVoided && (
                      <span className="text-[9px] font-bold text-red-600 uppercase bg-red-100 px-1 rounded">
                        ANULADO
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        isVoided
                          ? 'bg-red-200 text-red-800'
                          : tx.user === 'Dueño'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {/* CORRECCIÓN: Mostramos el usuario resuelto via logs si es posible */}
                      {tx.user || 'Desconocido'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div
                      className={`max-h-20 overflow-y-auto ${
                        isVoided ? 'opacity-50' : ''
                      }`}
                    >
                      {(tx.items || []).slice(0, 3).map((i, idx) => (
                        <div key={idx} className="text-slate-600 text-[10px]">
                          <span className="font-bold">
                            {i.qty || i.quantity}x
                          </span>{' '}
                          {i.title}
                        </div>
                      ))}
                      {(tx.items || []).length > 3 && (
                        <span className="text-[9px] text-slate-400 font-medium">
                          +{tx.items.length - 3} más
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded text-[10px] font-medium ${
                        isVoided
                          ? 'bg-red-100 text-red-600'
                          : tx.payment === 'Efectivo'
                          ? 'bg-green-100 text-green-700'
                          : tx.payment === 'MercadoPago'
                          ? 'bg-blue-100 text-blue-700'
                          : tx.payment === 'Debito'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {tx.payment}{' '}
                      {tx.installments > 0 ? `(${tx.installments}c)` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-sm">
                    <span
                      className={
                        isVoided
                          ? 'text-red-400 line-through'
                          : 'text-slate-800'
                      }
                    >
                      {/* CORRECCIÓN PRECIOS: Aseguramos conversión a número */}
                      ${(Number(tx.total) || 0).toLocaleString()}
                    </span>
                  </td>
                  {currentUser.role === 'admin' && (
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setSelectedTx(tx)}
                          className="text-slate-500 hover:bg-slate-200 p-1.5 rounded transition"
                          title="Ver Detalles"
                        >
                          <Eye size={14} />
                        </button>
                        
                        <button
                          onClick={() => onViewTicket(tx)}
                          className="text-slate-700 hover:bg-slate-200 p-1.5 rounded transition"
                          title="Ver Ticket"
                        >
                          <FileText size={14} />
                        </button>

                        {!isVoided && (
                          <button
                            onClick={() => onEditTransaction(tx)}
                            className="text-blue-500 hover:bg-blue-100 p-1.5 rounded transition"
                            title="Modificar Pedido"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                        
                        <button
                          onClick={() => onDeleteTransaction(tx)}
                          className={`${
                            isVoided
                              ? 'text-red-800 hover:bg-red-200'
                              : 'text-red-500 hover:bg-red-100'
                          } p-1.5 rounded transition`}
                          title={isVoided ? 'Eliminar' : 'Anular'}
                        >
                          {isVoided ? (
                            <XCircle size={14} />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {filteredTransactions.length === 0 && (
              <tr>
                <td
                  colSpan={currentUser.role === 'admin' ? 6 : 5}
                  className="text-center py-10 text-slate-400"
                >
                  {hasActiveFilters
                    ? 'No hay resultados con los filtros aplicados'
                    : 'Sin transacciones'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ♻️ REFACTOR: Modales extraídos a HistoryModals.jsx */}
      <TransactionDetailModal
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
        currentUser={currentUser}
        onEditTransaction={onEditTransaction}
        onDeleteTransaction={onDeleteTransaction}
        onViewTicket={onViewTicket}
      />

      <GeneratorModal
        isOpen={showGeneratorModal}
        onClose={() => setShowGeneratorModal(false)}
        generatorConfig={generatorConfig}
        setGeneratorConfig={setGeneratorConfig}
        onGenerate={handleGenerate}
      />

      <DeleteHistoryModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        activeCount={(transactions || []).length}
        historicCount={historicTransactions.length}
        onConfirm={clearAllTransactions}
      />
    </div>
  );
}