import React, { useState, useMemo } from 'react';
import {
  History,
  Trash2,
  Edit2,
  XCircle,
  Calendar,
  ChevronDown,
  Eye,
  X,
  Search,
  Wand2,
  AlertTriangle,
  Filter,
  ArrowUpDown,
  Plus,
} from 'lucide-react';
import { PAYMENT_METHODS } from '../data';

export default function HistoryView({
  transactions,
  dailyLogs,
  inventory,
  currentUser,
  onDeleteTransaction,
  onEditTransaction,
  setTransactions,
  setDailyLogs,
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

  // Modal generador
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
  // HELPERS
  // =====================================================
  const normalizeDate = (dateStr) => {
    if (!dateStr) return null;
    const cleanDate = dateStr.split(',')[0].trim();
    const parts = cleanDate.split('/');
    if (parts.length >= 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      return { day, month, year, str: `${day}/${month}/${year}` };
    }
    return null;
  };

  const isVentaLog = (log) => {
    const action = log.action || '';
    return action === 'Venta Realizada' || action === 'Nueva Venta';
  };

  const getVentaTotal = (details) => {
    if (!details) return 0;
    if (details.total !== undefined) return Number(details.total) || 0;
    if (details.items && Array.isArray(details.items)) {
      return details.items.reduce((sum, item) => {
        return (
          sum +
          (Number(item.price) || 0) *
            (Number(item.qty) || Number(item.quantity) || 0)
        );
      }, 0);
    }
    return 0;
  };

  const todayStr = useMemo(() => {
    const today = new Date();
    return `${today.getDate()}/${today.getMonth() + 1}/${today.getFullYear()}`;
  }, []);

  // =====================================================
  // TRANSACCIONES HISTÓRICAS
  // =====================================================
  const historicTransactions = useMemo(() => {
    const txList = [];
    (dailyLogs || []).forEach((log) => {
      if (isVentaLog(log) && log.details) {
        const logDate = normalizeDate(log.date);
        const isToday = logDate && logDate.str === todayStr;
        if (logDate && !isToday) {
          txList.push({
            id: log.details.transactionId || log.id,
            date: log.date,
            timestamp: log.timestamp,
            fullDate: `${log.date}, ${log.timestamp || '00:00'}:00`,
            user: log.user,
            items: log.details.items || [],
            payment: log.details.payment || 'N/A',
            installments: log.details.installments || 0,
            total: getVentaTotal(log.details),
            status: 'completed',
            isHistoric: true,
            sortDate: logDate
              ? new Date(logDate.year, logDate.month - 1, logDate.day)
              : new Date(0),
          });
        }
      }
    });
    return txList;
  }, [dailyLogs, todayStr]);

  // =====================================================
  // TRANSACCIONES DEL DÍA
  // =====================================================
  const todayTransactions = useMemo(() => {
    return (transactions || []).map((tx) => {
      const logDate = normalizeDate(tx.date);
      return {
        ...tx,
        isHistoric: false,
        sortDate: logDate
          ? new Date(logDate.year, logDate.month - 1, logDate.day)
          : new Date(),
      };
    });
  }, [transactions]);

  // =====================================================
  // COMBINAR Y FILTRAR
  // =====================================================
  const filteredTransactions = useMemo(() => {
    let txList = [];

    if (viewMode === 'today') {
      txList = todayTransactions;
    } else if (viewMode === 'history') {
      txList = historicTransactions;
    } else {
      txList = [...todayTransactions, ...historicTransactions];
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
        return (
          idMatch ||
          userMatch ||
          paymentMatch ||
          dateMatch ||
          itemsMatch ||
          totalMatch
        );
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
    viewMode,
    todayTransactions,
    historicTransactions,
    filterDateStart,
    filterDateEnd,
    filterPayment,
    filterUser,
    filterProduct,
    searchQuery,
    sortOrder,
  ]);

  const stats = useMemo(() => {
    const validTx = filteredTransactions.filter((tx) => tx.status !== 'voided');
    return {
      count: validTx.length,
      total: validTx.reduce((sum, tx) => sum + (tx.total || 0), 0),
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
    filterDateStart ||
    filterDateEnd ||
    filterPayment ||
    filterUser ||
    filterProduct ||
    searchQuery;

  // =====================================================
  // GENERADOR DE PEDIDOS
  // =====================================================
  const generateRandomTransactions = () => {
    const { count, dateStart, dateEnd, timeStart, timeEnd } = generatorConfig;
    const products = inventory || [];
    if (products.length === 0) {
      alert('No hay productos en el inventario para generar ventas');
      return;
    }

    const payments = ['Efectivo', 'MercadoPago', 'Debito', 'Credito'];
    const users = ['Dueño', 'Vendedor'];

    const end = dateEnd ? new Date(dateEnd + 'T23:59:59') : new Date();
    const start = dateStart
      ? new Date(dateStart + 'T00:00:00')
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const startHour = parseInt(timeStart, 10) || 9;
    const endHour = parseInt(timeEnd, 10) || 21;

    const newLogs = [];

    for (let i = 0; i < count; i++) {
      const randomTime =
        start.getTime() + Math.random() * (end.getTime() - start.getTime());
      const randomDate = new Date(randomTime);

      let randomHour;
      do {
        randomHour =
          startHour + Math.floor(Math.random() * (endHour - startHour));
      } while (randomHour >= 14 && randomHour < 16);

      const randomMinute = Math.floor(Math.random() * 60);

      const day = randomDate.getDate().toString().padStart(2, '0');
      const month = (randomDate.getMonth() + 1).toString().padStart(2, '0');
      const year = randomDate.getFullYear();
      const dateStr = `${day}/${month}/${year}`;
      const timeStr = `${randomHour.toString().padStart(2, '0')}:${randomMinute
        .toString()
        .padStart(2, '0')}`;

      const numProducts = 1 + Math.floor(Math.random() * 5);
      const selectedProducts = [];
      const usedProducts = new Set();

      for (let j = 0; j < numProducts && j < products.length; j++) {
        let product;
        let attempts = 0;
        do {
          product = products[Math.floor(Math.random() * products.length)];
          attempts++;
        } while (usedProducts.has(product.id) && attempts < 10);

        if (!usedProducts.has(product.id)) {
          usedProducts.add(product.id);
          const qty = 1 + Math.floor(Math.random() * 4);
          selectedProducts.push({
            title: product.title,
            price: product.price,
            qty: qty,
          });
        }
      }

      if (selectedProducts.length === 0) continue;

      const total = selectedProducts.reduce(
        (sum, p) => sum + p.price * p.qty,
        0
      );
      const payment = payments[Math.floor(Math.random() * payments.length)];
      const user = users[Math.floor(Math.random() * users.length)];
      const txId = 1001 + i + Math.floor(Math.random() * 100);

      newLogs.push({
        id: Date.now() + i + Math.random(),
        timestamp: timeStr,
        date: dateStr,
        action: 'Venta Realizada',
        user: user,
        details: {
          transactionId: txId,
          items: selectedProducts,
          total: total,
          payment: payment,
          installments:
            payment === 'Credito' ? Math.floor(Math.random() * 6) + 1 : 0,
        },
        reason: 'Venta generada para pruebas',
      });
    }

    if (newLogs.length > 0 && setDailyLogs) {
      setDailyLogs((prev) => [...newLogs, ...(prev || [])]);
    }

    setShowGeneratorModal(false);
    alert(`✅ Se generaron ${newLogs.length} pedidos exitosamente`);
  };

  const clearAllTransactions = () => {
    if (setTransactions) setTransactions([]);
    if (setDailyLogs) {
      setDailyLogs((prev) => (prev || []).filter((log) => !isVentaLog(log)));
    }
    setShowDeleteModal(false);
    alert('✅ Historial de transacciones eliminado');
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

        {/* Fila 2: Filtros Compactos (Todo en una línea horizontal con scroll si hace falta) */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {/* Buscador */}
          <div className="relative min-w-[140px]">
            <Search
              size={12}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
            />
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
                      #{tx.id}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {tx.date}
                      {tx.timestamp &&
                        !tx.date?.includes(',') &&
                        ` ${tx.timestamp}`}
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
                        {!isHistoric && !isVoided && (
                          <button
                            onClick={() => onEditTransaction(tx)}
                            className="text-blue-500 hover:bg-blue-100 p-1.5 rounded transition"
                            title="Modificar Pedido"
                          >
                            <Edit2 size={14} />
                          </button>
                        )}
                        {!isHistoric && (
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
                        )}
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

      {/* Modal de detalles */}
      {selectedTx && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden">
            <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
              <h4 className="font-bold text-slate-800">
                Venta #{selectedTx.id}
              </h4>
              <button
                onClick={() => setSelectedTx(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-slate-400 text-xs">Fecha</p>
                  <p className="font-bold">
                    {selectedTx.date} {selectedTx.timestamp}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Usuario</p>
                  <p className="font-bold">{selectedTx.user}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Pago</p>
                  <p className="font-bold">{selectedTx.payment}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Total</p>
                  <p className="font-bold text-fuchsia-600">
                    ${selectedTx.total?.toLocaleString()}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-slate-400 text-xs mb-2">Productos</p>
                <div className="space-y-2">
                  {(selectedTx.items || []).map((item, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center p-2 bg-slate-50 rounded"
                    >
                      <div>
                        <p className="font-medium text-sm">{item.title}</p>
                        <p className="text-xs text-slate-400">
                          {item.qty || item.quantity} x $
                          {item.price?.toLocaleString()}
                        </p>
                      </div>
                      <p className="font-bold text-sm">
                        $
                        {(
                          (item.qty || item.quantity) * item.price
                        ).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Botones de acción en el modal */}
            {currentUser.role === 'admin' && (
              <div className="p-4 border-t bg-slate-50 flex gap-2 justify-end">
                {selectedTx.status !== 'voided' && !selectedTx.isHistoric && (
                  <button
                    onClick={() => {
                      setSelectedTx(null);
                      onEditTransaction(selectedTx);
                    }}
                    className="px-4 py-2 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition flex items-center gap-2"
                  >
                    <Edit2 size={14} /> Editar
                  </button>
                )}
                {selectedTx.status !== 'voided' && !selectedTx.isHistoric && (
                  <button
                    onClick={() => {
                      setSelectedTx(null);
                      onDeleteTransaction(selectedTx);
                    }}
                    className="px-4 py-2 text-sm font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition flex items-center gap-2"
                  >
                    <XCircle size={14} /> Anular
                  </button>
                )}
                <button
                  onClick={() => setSelectedTx(null)}
                  className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition"
                >
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Generador */}
      {showGeneratorModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-4 border-b flex justify-between items-center bg-fuchsia-500">
              <h4 className="font-bold text-white flex items-center gap-2">
                <Wand2 size={18} /> Generar Pedidos de Prueba
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                    Hora inicio
                  </label>
                  <select
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    value={generatorConfig.timeStart}
                    onChange={(e) =>
                      setGeneratorConfig({
                        ...generatorConfig,
                        timeStart: e.target.value,
                      })
                    }
                  >
                    {Array.from({ length: 13 }, (_, i) => i + 9).map((h) => (
                      <option key={h} value={h.toString().padStart(2, '0')}>
                        {h}:00 hs
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                    Hora fin
                  </label>
                  <select
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    value={generatorConfig.timeEnd}
                    onChange={(e) =>
                      setGeneratorConfig({
                        ...generatorConfig,
                        timeEnd: e.target.value,
                      })
                    }
                  >
                    {Array.from({ length: 13 }, (_, i) => i + 9).map((h) => (
                      <option key={h} value={h.toString().padStart(2, '0')}>
                        {h}:00 hs
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-fuchsia-50 border border-fuchsia-200 rounded-lg p-3 text-xs text-fuchsia-700">
                <p>
                  ⚡ Se generarán ventas aleatorias con productos del
                  inventario. Horarios de 14-16 hs serán omitidos.
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
                onClick={generateRandomTransactions}
                className="px-4 py-2 text-sm bg-fuchsia-500 text-white rounded-lg font-bold hover:bg-fuchsia-600 transition"
              >
                Generar {generatorConfig.count} Pedidos
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
                <AlertTriangle size={18} /> Eliminar Historial
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
                Esta acción eliminará <strong>todas las transacciones</strong>.
                No se puede deshacer.
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
                <p className="font-bold">Se eliminarán:</p>
                <p>• {(transactions || []).length} transacciones del día</p>
                <p>• {historicTransactions.length} transacciones históricas</p>
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
                onClick={clearAllTransactions}
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
