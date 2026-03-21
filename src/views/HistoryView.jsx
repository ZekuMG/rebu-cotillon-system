// src/views/HistoryView.jsx
// â™»ï¸ REFACTOR: Interfaz de Historial Consolidada y Optimizada (Filtros, Celdas Inline, UI Premium)

import React, { useEffect, useState, useMemo } from 'react';
import {
  History,
  Trash2,
  Edit2,
  XCircle,
  Eye,
  X,
  Search,
  ArrowUpDown,
  FileText,
  UserX,
  Calendar,
  Filter,
  RotateCcw
} from 'lucide-react';
import { PAYMENT_METHODS } from '../data';
import { normalizeDate, isVentaLog, getVentaTotal } from '../utils/helpers';
import { FancyPrice } from '../components/FancyPrice';
import { TransactionDetailModal } from '../components/modals/HistoryModals';

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

const HISTORY_PAGE_SIZE = 50;

export default function HistoryView({
  transactions,
  dailyLogs,
  inventory,
  currentUser,
  members,
  onDeleteTransaction,
  onEditTransaction,
  onRestoreTransaction,
  setTransactions: _setTransactions,
  setDailyLogs: _setDailyLogs,
  showNotification: _showNotification,
  onViewTicket,
}) {
  const getComboIncludedItems = (item) => {
    if (!item?.isCombo || !Array.isArray(item.productsIncluded) || item.productsIncluded.length === 0) return [];
    const comboQty = Number(item.quantity || item.qty || 1);
    return item.productsIncluded.map((includedItem) => ({
      ...includedItem,
      appliedQuantity: Number(includedItem.quantity || includedItem.qty || 1) * comboQty,
    }));
  };

  // Estados de filtros
  const [viewMode, setViewMode] = useState('all');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);

  // Modal de detalle
  const [selectedTx, setSelectedTx] = useState(null);

  // =====================================================
  // TRANSACCIONES HISTÃ“RICAS (desde logs)
  // =====================================================
  const historicTransactions = useMemo(() => {
    const txList = [];
    const activeIds = new Set((transactions || []).map(t => String(t.id)));
    const voidedIds = new Set();
    const permanentlyDeletedIds = new Set();
    const permanentlyDeletedLogs = new Map();
    
    (dailyLogs || []).forEach(log => {
      if (log.action === 'Venta Anulada' && log.details?.id) {
        voidedIds.add(String(log.details.id));
      }
      // âœ¨ FIX: Actualizamos el nombre a "Venta Eliminada"
      const deletedTxId = log.details?.transactionId || log.details?.id;
      if ((log.action === 'Borrado Permanente' || log.action === 'Venta Eliminada') && deletedTxId) {
        const normalizedDeletedTxId = String(deletedTxId);
        permanentlyDeletedIds.add(normalizedDeletedTxId);
        permanentlyDeletedLogs.set(normalizedDeletedTxId, log);
      }
    });

    permanentlyDeletedLogs.forEach((log, txId) => {
      const logDate = normalizeDate(log.date);
      if (!logDate) return;

      const safeTotal = Number(log.details?.total) || getVentaTotal(log.details) || 0;

      txList.push({
        id: txId,
        date: log.date,
        timestamp: log.timestamp,
        fullDate: `${log.date}, ${log.timestamp || '00:00'}:00`,
        user: log.user,
        items: log.details?.items || [],
        payment: log.details?.payment || 'N/A',
        cashReceived: Number(log.details?.cashReceived || 0),
        cashChange: Number(log.details?.cashChange || 0),
        installments: log.details?.installments || 0,
        total: safeTotal,
        client: log.details?.client || log.details?.memberName || null,
        memberNumber: log.details?.memberNumber || log.details?.client?.memberNumber || null,
        pointsEarned: log.details?.pointsEarned || 0,
        pointsSpent: log.details?.pointsSpent || 0,
        status: 'deleted',
        isHistoric: true,
        sortDate: logDate,
        isTest: log.isTest,
        isRestored: false,
      });
    });

    (dailyLogs || []).forEach((log) => {
      if (isVentaLog(log) && log.details) {
        const txId = String(log.details.transactionId || log.id);
        
        // âœ¨ FIX: Si estÃ¡ en la lista de borrados permanentes, NO la dibujamos en el historial
        if (activeIds.has(txId) || permanentlyDeletedIds.has(txId)) return;

        const logDate = normalizeDate(log.date);
        if (logDate) {
            const safeTotal = Number(log.details.total) || getVentaTotal(log.details) || 0;

            txList.push({
                id: txId,
                date: log.date,
                timestamp: log.timestamp,
                fullDate: `${log.date}, ${log.timestamp || '00:00'}:00`,
                user: log.user,
                items: log.details.items || [],
                payment: log.details.payment || 'N/A',
                cashReceived: Number(log.details?.cashReceived || 0),
                cashChange: Number(log.details?.cashChange || 0),
                installments: log.details.installments || 0,
                total: safeTotal,
                client: log.details.client || log.details.memberName || null,
                memberNumber: log.details.client?.memberNumber || log.details.memberNumber || null,
                
                // âœ¨ FIX: AHORA SÃ RESCATAMOS LOS PUNTOS DEL FANTASMA
                pointsEarned: log.details.pointsEarned || 0,
                pointsSpent: log.details.pointsSpent || 0,
                
                status: voidedIds.has(txId) ? 'voided' : 'completed',
                isHistoric: true,
                sortDate: logDate, 
                isTest: log.isTest,
                isRestored: false // Generalmente los anulados histÃ³ricos no estÃ¡n restaurados
            });
        }
      }
    });
    return txList;
  }, [dailyLogs, transactions]);

  // =====================================================
  // TRANSACCIONES ACTIVAS
  // =====================================================
  const activeTransactions = useMemo(() => {
    return (transactions || []).map((tx) => {
      const logDate = normalizeDate(tx.date);
      let resolvedUser = tx.user;
      let resolvedItems = tx.items;
      const creationLog = (dailyLogs || []).find(log => 
        (log.action === 'Venta Realizada' && String(log.details?.transactionId) === String(tx.id))
      );
      
      if (!resolvedUser || resolvedUser === 'Desconocido') {
          if (creationLog) resolvedUser = creationLog.user;
      }

      if (creationLog?.details?.items?.length) {
        resolvedItems = creationLog.details.items;
      }

      const resolvedCashReceived =
        Number(tx.cashReceived || 0) || Number(creationLog?.details?.cashReceived || 0);
      const resolvedCashChange =
        Number(tx.cashChange || 0) || Number(creationLog?.details?.cashChange || 0);

      return {
        ...tx,
        user: resolvedUser || 'Desconocido',
        items: resolvedItems,
        cashReceived: resolvedCashReceived,
        cashChange: resolvedCashChange,
        isHistoric: false,
        sortDate: logDate || new Date(), 
      };
    });
  }, [transactions, dailyLogs]);

  // =====================================================
  // COMBINAR Y FILTRAR
  // =====================================================
  const filteredTransactions = useMemo(() => {
    let txList = [...activeTransactions, ...historicTransactions];
    const isSearchingTest = searchQuery.toLowerCase().trim() === 'test';

    // 1. FILTRO DE MODO PRUEBA
    txList = txList.filter(tx => {
      if (tx.isTest) {
        return isSearchingTest;
      } else {
        return !isSearchingTest;
      }
    });

    // 2. LÃ“GICA DE VISTA: HOY vs HISTORIAL
    if (viewMode === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      txList = txList.filter((tx) => {
        if (!tx.sortDate) return false;
        const txDate = new Date(tx.sortDate);
        txDate.setHours(0, 0, 0, 0);
        return txDate.getTime() === today.getTime();
      });
    } else if (viewMode === 'history') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      txList = txList.filter((tx) => {
        if (!tx.sortDate) return false;
        const txDate = new Date(tx.sortDate);
        txDate.setHours(0, 0, 0, 0);
        return txDate.getTime() < today.getTime(); 
      });
    }

    // 3. RANGO DE FECHAS
    if (filterDateStart) {
      const [year, month, day] = filterDateStart.split('-');
      const startDate = new Date(year, month - 1, day, 0, 0, 0);
      txList = txList.filter((tx) => tx.sortDate >= startDate);
    }
    if (filterDateEnd) {
      const [year, month, day] = filterDateEnd.split('-');
      const endDate = new Date(year, month - 1, day, 23, 59, 59);
      txList = txList.filter((tx) => tx.sortDate <= endDate);
    }

    // 4. RESTO DE FILTROS BÃSICOS
    if (filterPayment) txList = txList.filter((tx) => tx.payment === filterPayment);
    if (filterUser) txList = txList.filter((tx) => tx.user === filterUser);
    
    // 5. FILTRO DE CATEGORÃA 
    if (filterCategory) {
      txList = txList.filter((tx) =>
        (tx.items || []).some((item) => {
          const invProduct = (inventory || []).find(
            (p) => String(p.id) === String(item.productId || item.id) || p.title === item.title
          );
          const catString = item.category || invProduct?.category || '';
          return catString.split(',').map(c => c.trim().toLowerCase()).includes(filterCategory.toLowerCase());
        })
      );
    }

    // 6. BÃšSQUEDA GENERAL
    if (searchQuery.trim() && !isSearchingTest) {
      const query = searchQuery.toLowerCase().trim();
      txList = txList.filter((tx) => {
        const idMatch = String(tx.id).includes(query);
        const userMatch = tx.user?.toLowerCase().includes(query);
        const paymentMatch = tx.payment?.toLowerCase().includes(query);
        const dateMatch = tx.date?.toLowerCase().includes(query);
        const itemsMatch = (tx.items || []).some((item) => item.title?.toLowerCase().includes(query));
        const totalMatch = String(tx.total).includes(query);
        const clientMatch = tx.client && typeof tx.client === 'string' 
          ? tx.client.toLowerCase().includes(query) 
          : tx.client?.name?.toLowerCase().includes(query);

        return idMatch || userMatch || paymentMatch || dateMatch || itemsMatch || totalMatch || clientMatch;
      });
    }

    // 7. ORDENAMIENTO
    txList.sort((a, b) => {
      const dateA = a.sortDate?.getTime() || 0;
      const dateB = b.sortDate?.getTime() || 0;
      if (dateA !== dateB) return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
      return sortOrder === 'desc' ? b.id - a.id : a.id - b.id;
    });

    return txList;
  }, [
    viewMode, activeTransactions, historicTransactions, 
    filterDateStart, filterDateEnd, filterPayment, 
    filterUser, filterCategory, searchQuery, sortOrder, inventory
  ]);


  const stats = useMemo(() => {
    const validTx = filteredTransactions.filter((tx) => tx.status !== 'voided' && tx.status !== 'deleted');
    return {
      count: validTx.length,
      total: validTx.reduce((sum, tx) => sum + (Number(tx.total) || 0), 0),
    };
  }, [filteredTransactions]);

  const categoriesList = useMemo(() => {
    const cats = new Set();
    (inventory || []).forEach(p => {
      if (p.category) {
        p.category.split(',').forEach(c => {
          const trimmed = c.trim();
          if (trimmed) cats.add(trimmed);
        });
      }
    });
    return Array.from(cats).sort();
  }, [inventory]);

  const clearFilters = () => {
    setFilterDateStart(''); setFilterDateEnd('');
    setFilterPayment(''); setFilterUser(''); setFilterCategory('');
    setSearchQuery('');
  };

  const hasActiveFilters = filterDateStart || filterDateEnd || filterPayment || filterUser || filterCategory || searchQuery;
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / HISTORY_PAGE_SIZE));
  const pageStart = filteredTransactions.length === 0 ? 0 : (currentPage - 1) * HISTORY_PAGE_SIZE + 1;
  const pageEnd = Math.min(currentPage * HISTORY_PAGE_SIZE, filteredTransactions.length);
  const visiblePageNumbers = useMemo(() => {
    if (totalPages <= 3) return Array.from({ length: totalPages }, (_, index) => index + 1);
    if (currentPage <= 2) return [1, 2, 3];
    if (currentPage >= totalPages - 1) return [totalPages - 2, totalPages - 1, totalPages];
    return [currentPage - 1, currentPage, currentPage + 1];
  }, [currentPage, totalPages]);
  const paginatedTransactions = useMemo(() => {
    const startIndex = (currentPage - 1) * HISTORY_PAGE_SIZE;
    return filteredTransactions.slice(startIndex, startIndex + HISTORY_PAGE_SIZE);
  }, [filteredTransactions, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [viewMode, filterDateStart, filterDateEnd, filterPayment, filterUser, filterCategory, searchQuery, sortOrder]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  // =====================================================
  // RENDER
  // =====================================================
  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden h-full min-h-0 flex flex-col">
      {/* HEADER Y FILTROS */}
      <div className="p-4 border-b bg-slate-50 shrink-0 space-y-4">
        {/* Fila 1: TÃ­tulo y Stats */}
        <div className="flex flex-wrap justify-between items-center gap-2">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-1.5 rounded-lg text-blue-600">
              <History size={18} />
            </div>
            <h3 className="font-bold text-slate-800 text-sm">Registro de Ventas</h3>
            <span className="text-[10px] bg-white border border-slate-200 text-slate-600 px-2.5 py-1 rounded-lg font-bold shadow-sm ml-2 flex items-center gap-1">
              Total de ventas: {stats.count} °
              <span className="text-blue-600"><FancyPrice amount={stats.total} /></span>
            </span>
          </div>
          <div className="flex items-center gap-2">
             {hasActiveFilters && (
              <button onClick={clearFilters} className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors border border-red-100">
                <X size={12} /> Limpiar Filtros
              </button>
            )}
            <button onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')} className="flex items-center gap-1 px-3 py-1.5 text-[10px] font-bold text-slate-600 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 shadow-sm transition-colors" title="Invertir Orden">
              <ArrowUpDown size={12} /> {sortOrder === 'desc' ? 'MÃ¡s recientes' : 'MÃ¡s antiguas'}
            </button>
          </div>
        </div>

        {/* Fila 2: Barra de Filtros Estilizada */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Buscador */}
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por ID, producto o cliente..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Selector Vista */}
          <select className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 shadow-sm bg-white" value={viewMode} onChange={(e) => setViewMode(e.target.value)}>
            <option value="all">Todas las fechas</option>
            <option value="today">Solo Hoy</option>
            <option value="history">Solo Historial</option>
          </select>

          {/* Fechas */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
            <Calendar size={12} className="text-slate-400" />
            <input type="date" className="text-[10px] bg-transparent outline-none font-medium text-slate-600 cursor-pointer" value={filterDateStart} onChange={(e) => setFilterDateStart(e.target.value)} title="Desde"/>
            <span className="text-[10px] text-slate-300">â€”</span>
            <input type="date" className="text-[10px] bg-transparent outline-none font-medium text-slate-600 cursor-pointer" value={filterDateEnd} onChange={(e) => setFilterDateEnd(e.target.value)} title="Hasta"/>
          </div>

          {/* Filtros Dropdowns */}
          <div className="flex items-center gap-2">
            <div className="relative">
               <Filter size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
               <select className="pl-7 pr-3 py-1.5 text-[11px] font-medium border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 shadow-sm bg-white appearance-none cursor-pointer" value={filterPayment} onChange={(e) => setFilterPayment(e.target.value)}>
                 <option value="">MÃ©todo de Pago</option>
                 {PAYMENT_METHODS.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
               </select>
            </div>
            
            <select className="px-3 py-1.5 text-[11px] font-medium border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 shadow-sm bg-white cursor-pointer" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
              <option value="">Todas las CategorÃ­as</option>
              {categoriesList.map((c) => (<option key={c} value={c}>{c}</option>))}
            </select>

            <select className="px-3 py-1.5 text-[11px] font-medium border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 shadow-sm bg-white cursor-pointer" value={filterUser} onChange={(e) => setFilterUser(e.target.value)}>
              <option value="">Todos los Usuarios</option>
              <option value="DueÃ±o">DueÃ±o</option>
              <option value="Vendedor">Vendedor</option>
            </select>
          </div>

        </div>
      </div>

      {/* TABLA PRINCIPAL */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-[#f8fafc] text-slate-500 uppercase text-[9px] tracking-wider font-bold sticky top-0 z-10 border-b border-slate-200 shadow-sm">
            <tr>
              <th className="px-4 py-3.5 text-left">ID & Fecha</th>
              <th className="px-4 py-3.5 text-left">Usuario</th>
              <th className="px-4 py-3.5 text-left">Socio</th>
              <th className="px-4 py-3.5 text-left">Detalle</th>
              <th className="px-4 py-3.5 text-left">Pago</th>
              <th className="px-4 py-3.5 text-right">Monto</th>
              {currentUser?.role === 'admin' && (
                <th className="px-4 py-3.5 text-center">Acciones</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedTransactions.map((tx, index) => {
              const isVoided = tx.status === 'voided';
              const isDeleted = tx.status === 'deleted';
              const isHistoric = tx.isHistoric;
              const isRestored = tx.isRestored;
              const restoredAt = tx.restoredAt;

              let clientName = null;
              let memberNum = null;
              if (tx.client && typeof tx.client === 'object') {
                clientName = tx.client.name;
                memberNum = tx.client.memberNumber;
              } else if (tx.client && typeof tx.client === 'string') {
                clientName = tx.client;
                memberNum = tx.memberNumber;
              } else if (tx.memberName) {
                clientName = tx.memberName;
                memberNum = tx.memberNumber;
              }
              if (clientName === 'No asociado' || clientName === 'Consumidor Final') {
                clientName = null;
              }

              return (
                <tr
                  key={`${tx.id}-${index}`}
                  className={`transition-all duration-150 ${
                    isVoided ? 'bg-[#fef2f2] hover:bg-[#fee2e2]' 
                             : isDeleted ? 'bg-[#fff7ed] hover:bg-[#ffedd5]'
                             : isHistoric ? 'bg-slate-50/30 hover:bg-slate-50' 
                             : 'hover:bg-[#f0f9ff]'
                  }`}
                >
                  <td className="px-4 py-3 align-middle">
                    <p className={`font-mono font-bold text-[11px] ${isVoided ? 'text-red-800 line-through' : isDeleted ? 'text-orange-800 line-through' : 'text-slate-800'}`}>
                      #{String(tx.id).padStart(6, '0')}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span>{formatDisplayDate(tx.date)} {(tx.time || tx.timestamp) && ` ${tx.time || tx.timestamp}`}</span>
                    </p>
                    {isVoided && (
                      <span className="text-[8.5px] font-black tracking-widest text-red-600 uppercase bg-red-100 px-1.5 py-0.5 rounded mt-1.5 inline-block border border-red-200">
                        ANULADO
                      </span>
                    )}
                    {isDeleted && (
                      <span className="text-[8.5px] font-black tracking-widest text-orange-700 uppercase bg-orange-100 px-1.5 py-0.5 rounded mt-1.5 inline-block border border-orange-200">
                        ELIMINADO
                      </span>
                    )}
                    {/* âœ¨ MEDALLA DE RESTAURADO CON HORA */}
                    {!isVoided && !isDeleted && isRestored && (
                      <div className="mt-1.5 flex flex-col items-start gap-0.5">
                        <span className="text-[8.5px] font-black tracking-widest text-emerald-600 uppercase bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200">
                          RESTAURADO
                        </span>
                        {restoredAt && (
                          <span className="text-[8px] font-medium text-emerald-500">
                            {restoredAt}
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  
                  <td className="px-4 py-3 align-middle">
                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                        isVoided ? 'bg-red-200 text-red-800' : isDeleted ? 'bg-orange-100 text-orange-700 border border-orange-200' : tx.user === 'Dueño' ? 'bg-[#eef2ff] text-indigo-600 border border-indigo-100' : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                      }`}
                    >
                      {tx.user || 'Desconocido'}
                    </span>
                  </td>

                  <td className="px-4 py-3 align-middle">
                    <div className={`flex items-center gap-1.5 flex-wrap ${isVoided || isDeleted ? 'opacity-50' : ''}`}>
                      {clientName ? (
                        <>
                          <span className={`text-[11px] font-bold ${isVoided ? 'text-red-800 line-through' : isDeleted ? 'text-orange-800 line-through' : 'text-slate-700'}`}>
                            {clientName}
                          </span>
                          {memberNum && memberNum !== '---' && (
                            <span className="text-[9px] font-mono font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">
                              #{String(memberNum).padStart(4, '0')}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500 inline-flex items-center gap-1 border border-slate-200">
                          <UserX size={10} /> No asociado
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-4 py-3 align-middle">
                    <div className={`max-h-20 overflow-y-auto custom-scrollbar pr-1 ${isVoided || isDeleted ? 'opacity-50' : ''}`}>
                      {(tx.items || []).slice(0, 3).map((i, idx) => {
                        const qty = i.qty || i.quantity || 0;
                        const isWeight = i.product_type === 'weight' || i.isWeight || (qty >= 20 && i.price < 50);
                        const comboIncludedItems = getComboIncludedItems(i);
                        
                        return (
                          <div key={idx} className="text-slate-600 text-[10px] mb-1.5 flex items-start gap-1.5">
                            <span className="font-bold bg-white border border-slate-200 shadow-sm px-1 py-0.5 rounded text-[9px] text-slate-700 whitespace-nowrap">
                              {qty}{isWeight ? 'g' : 'x'}
                            </span>
                            <div className="min-w-0 flex-1 pt-0.5">
                              <span className="truncate block font-medium" title={i.title}>{i.title}</span>
                              {comboIncludedItems.length > 0 && (
                                <div className="mt-1 rounded-md border border-violet-100 bg-violet-50/70 px-2 py-1.5">
                                  {comboIncludedItems.map((includedItem, includedIndex) => {
                                    const includedIsWeight = includedItem.product_type === 'weight';
                                    return (
                                      <div key={`${idx}-${includedIndex}`} className="flex items-center gap-1.5 text-[9px] text-violet-700">
                                        <span className="font-bold rounded bg-white/80 px-1 py-0.5 border border-violet-100 whitespace-nowrap">
                                          {includedItem.appliedQuantity}{includedIsWeight ? 'g' : 'x'}
                                        </span>
                                        <span className="truncate">{includedItem.title}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      {(tx.items || []).length > 3 && (
                        <span className="text-[9px] text-slate-400 font-medium italic mt-1 inline-block bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">
                          +{tx.items.length - 3} productos mÃ¡s
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${
                          isVoided ? 'bg-red-100 text-red-600 border border-red-200'
                                   : isDeleted ? 'bg-orange-100 text-orange-700 border border-orange-200'
                                   : tx.payment === 'Efectivo' ? 'bg-[#dcfce7] text-[#15803d] border border-[#bbf7d0]'
                                   : tx.payment === 'MercadoPago' ? 'bg-[#dbeafe] text-[#1d4ed8] border border-[#bfdbfe]'
                                   : tx.payment === 'Debito' ? 'bg-purple-100 text-purple-700 border border-purple-200'
                                   : 'bg-[#ffedd5] text-[#c2410c] border border-[#fed7aa]'
                        }`}
                      >
                        {tx.payment}
                      </span>
                      
                      {tx.payment === 'Credito' && tx.installments > 0 && (
                        <span className={`text-[8.5px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                          isVoided ? 'text-red-500 bg-red-50 border border-red-100' : isDeleted ? 'text-orange-600 bg-orange-50 border border-orange-100' : 'text-slate-500 bg-white shadow-sm border border-slate-200'
                        }`}>
                          {tx.installments} {tx.installments === 1 ? 'Cuota' : 'Cuotas'}
                        </span>
                      )}
                    </div>
                    {tx.payment === 'Efectivo' && Number(tx.cashChange || 0) > 0 && (
                      <p className="mt-1 text-[10px] font-bold text-emerald-600">
                        Devolución: <FancyPrice amount={Number(tx.cashChange || 0)} />
                      </p>
                    )}
                  </td>

                  <td className="px-4 py-3 text-right align-middle">
                    <span className={`font-black text-sm ${isVoided ? 'text-red-400 line-through' : isDeleted ? 'text-orange-400 line-through' : 'text-slate-800'}`}>
                      <FancyPrice amount={Number(tx.total) || 0} />
                    </span>
                  </td>

                  {currentUser?.role === 'admin' && (
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center justify-center gap-1.5">
                        
                        {/* BotÃ³n Ver Detalles */}
                        <button onClick={() => setSelectedTx(tx)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300 transition-all shadow-sm group" title="Ver Detalles">
                          <Eye size={14} className="group-hover:scale-110 transition-transform" />
                        </button>
                        
                        {/* BotÃ³n Ver Ticket */}
                        <button onClick={() => onViewTicket(tx)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 hover:border-slate-300 transition-all shadow-sm group" title="Ver Ticket">
                          <FileText size={14} className="group-hover:scale-110 transition-transform" />
                        </button>

                        {/* Botones Modificar/Anular (solo si NO estÃ¡ anulada) */}
                        {!isVoided && !isDeleted && (
                          <>
                            <button onClick={() => onEditTransaction(tx)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-300 transition-all shadow-sm group" title="Modificar Pedido">
                              <Edit2 size={13} className="group-hover:scale-110 transition-transform" />
                            </button>
                            
                            <button onClick={() => onDeleteTransaction(tx)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-all shadow-sm group" title="Anular Venta">
                              <XCircle size={14} className="group-hover:scale-110 transition-transform" />
                            </button>
                          </>
                        )}
                        
                        {/* Botones Restaurar/Eliminar (solo si SÃ estÃ¡ anulada) */}
                        {isVoided && (
                          <>
                            {/* âœ¨ NUEVO BOTÃ“N: Restaurar Venta */}
                            <button onClick={() => onRestoreTransaction(tx)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-emerald-500 hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-300 transition-all shadow-sm group" title="Restaurar Venta (Recuperar)">
                              <RotateCcw size={14} className="group-hover:-rotate-45 transition-transform" />
                            </button>
                            
                            {/* Eliminar Venta Permanentemente */}
                            <button onClick={() => onDeleteTransaction(tx)} className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-red-400 hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-all shadow-sm group" title="Eliminar Registro Permanentemente">
                              <Trash2 size={14} className="group-hover:scale-110 transition-transform" />
                            </button>
                          </>
                        )}

                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
            {filteredTransactions.length === 0 && (
              <tr>
                <td colSpan={currentUser?.role === 'admin' ? 7 : 6} className="text-center py-16">
                  <div className="flex flex-col items-center justify-center text-slate-400">
                    <History size={32} className="mb-2 opacity-50" />
                    <p className="text-sm font-medium">{hasActiveFilters ? 'No se encontraron ventas con estos filtros.' : 'No hay historial de ventas disponible.'}</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {filteredTransactions.length > 0 && (
        <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[11px] font-semibold text-slate-500">
              Mostrando <span className="font-black text-slate-700">{pageStart}</span> a <span className="font-black text-slate-700">{pageEnd}</span> de <span className="font-black text-slate-700">{filteredTransactions.length}</span> registros
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Anterior
              </button>
              <div className="flex items-center gap-1.5">
                {visiblePageNumbers.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => setCurrentPage(pageNumber)}
                    className={`min-w-[34px] rounded-lg border px-2.5 py-1.5 text-[11px] font-black transition ${
                      pageNumber === currentPage
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {pageNumber}
                  </button>
                ))}
              </div>
              <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-black text-slate-700">
                Página {currentPage} de {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalle */}
      <TransactionDetailModal
        transaction={selectedTx}
        onClose={() => setSelectedTx(null)}
        currentUser={currentUser}
        members={members}
        onEditTransaction={onEditTransaction}
        onDeleteTransaction={onDeleteTransaction}
        onViewTicket={onViewTicket}
      />
    </div>
  );
}
