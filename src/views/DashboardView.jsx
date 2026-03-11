import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShoppingCart, 
  TrendingDown, 
  FileText, 
  Clock,
  ChevronRight
} from 'lucide-react';

import useDashboardData from '../hooks/useDashboardData';
import {
  KpiCard,
  SalesChart,
  PaymentBreakdown,
  TopRanking,
  LowStockAlert,
  GlobalTimeSwitch,
  LayoutManagerControls,
} from '../components/dashboard';
import { FancyPrice } from '../components/FancyPrice';
import { isTestRecord } from '../utils/helpers'; // ✨ Importado el escudo anti-test

const DEFAULT_BOTTOM_ORDER = ['chart', 'payments', 'topProducts', 'lowStock', 'financialActivity', 'systemLogs'];
const DEFAULT_TOP_ORDER = ['sales', 'revenue', 'net', 'opening', 'average', 'expenses'];

export default function DashboardView({
  openingBalance,
  totalSales,
  salesCount,
  currentUser,
  setTempOpeningBalance,
  setIsOpeningBalanceModalOpen,
  transactions,
  dailyLogs,
  inventory,
  expenses = [],
  onOpenExpenseModal,
  onAlertClick,
  onNavigate,
  onViewTransaction
}) {
  const isAdmin = currentUser?.role === 'admin';

  // ✨ LIMPIEZA ABSOLUTA DE MODO TEST ANTES DE CALCULAR NADA
  const cleanTransactions = useMemo(() => (transactions || []).filter(t => !isTestRecord(t)), [transactions]);
  const cleanDailyLogs = useMemo(() => (dailyLogs || []).filter(l => !isTestRecord(l)), [dailyLogs]);
  const cleanInventory = useMemo(() => (inventory || []).filter(i => !isTestRecord(i)), [inventory]);
  const cleanExpenses = useMemo(() => (expenses || []).filter(e => !isTestRecord(e)), [expenses]);

  const [globalFilter, setGlobalFilter] = useState('day');
  const [rankingMode, setRankingMode] = useState('products');
  const [rankingCriteria, setRankingCriteria] = useState('revenue');

  const [widgetOrder, setWidgetOrder] = useState(() => {
    const saved = localStorage.getItem('party_dashboard_order_bottom');
    if (saved) {
      let parsed = JSON.parse(saved);
      if (parsed.includes('activityPanel')) {
        const idx = parsed.indexOf('activityPanel');
        parsed.splice(idx, 1, 'financialActivity', 'systemLogs');
      } else {
        if (!parsed.includes('financialActivity')) parsed.push('financialActivity');
        if (!parsed.includes('systemLogs')) parsed.push('systemLogs');
      }
      return parsed.filter(w => w !== 'expirations'); 
    }
    return DEFAULT_BOTTOM_ORDER;
  });

  const [topWidgetOrder, setTopWidgetOrder] = useState(() => {
    const saved = localStorage.getItem('party_dashboard_order_top');
    if (saved) {
        const parsed = JSON.parse(saved);
        const migrated = parsed.map(k => k === 'placeholder' ? 'expenses' : k);
        if (!migrated.includes('expenses')) return [...migrated, 'expenses'];
        return migrated;
    }
    return DEFAULT_TOP_ORDER;
  });

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [draggedTopItem, setDraggedTopItem] = useState(null);

  useEffect(() => {
    const savedBottom = localStorage.getItem('party_dashboard_order_bottom');
    const savedTop = localStorage.getItem('party_dashboard_order_top');

    const currentBottomStr = JSON.stringify(widgetOrder);
    const currentTopStr = JSON.stringify(topWidgetOrder);

    const savedBottomStr = savedBottom || JSON.stringify(DEFAULT_BOTTOM_ORDER);
    const savedTopStr = savedTop || JSON.stringify(DEFAULT_TOP_ORDER);

    if (currentBottomStr !== savedBottomStr || currentTopStr !== savedTopStr) {
      setHasUnsavedChanges(true);
    } else {
      setHasUnsavedChanges(false);
    }
  }, [widgetOrder, topWidgetOrder]);

  const handleSaveLayout = () => {
    localStorage.setItem('party_dashboard_order_bottom', JSON.stringify(widgetOrder));
    localStorage.setItem('party_dashboard_order_top', JSON.stringify(topWidgetOrder));
    setHasUnsavedChanges(false);
  };

  const handleRestoreLayout = () => {
    localStorage.removeItem('party_dashboard_order_bottom');
    localStorage.removeItem('party_dashboard_order_top');
    setWidgetOrder(DEFAULT_BOTTOM_ORDER);
    setTopWidgetOrder(DEFAULT_TOP_ORDER);
    setHasUnsavedChanges(false);
  };

  // ✨ ALIMENTAMOS LOS CALCULOS SOLO CON DATA LIMPIA
  const {
    kpiStats,
    averageTicket,
    chartData,
    maxSales,
    paymentStats,
    rankingStats,
    lowStockProducts,
    expiringProducts,
    getEmptyStateMessage,
    filteredData,       
    filteredExpenses,  
  } = useDashboardData({ 
    transactions: cleanTransactions, 
    dailyLogs: cleanDailyLogs, 
    inventory: cleanInventory, 
    globalFilter, 
    rankingMode, 
    rankingCriteria,
    expenses: cleanExpenses 
  });

  const combinedActivity = useMemo(() => {
    const sales = (filteredData || []).map(t => ({
      ...t,
      type: 'sale',
      sortTime: t.date ? t.date.getTime() : 0
    }));
    const exps = (filteredExpenses || []).map(e => ({
      ...e,
      type: 'expense',
      sortTime: (() => {
        try {
          if (e.date && e.time) {
            const [day, month, year] = e.date.split('/');
            return new Date(`${year}-${month}-${day}T${e.time}`).getTime();
          }
          return 0;
        } catch { return 0; }
      })()
    }));
    return [...sales, ...exps].sort((a, b) => b.sortTime - a.sortTime);
  }, [filteredData, filteredExpenses]);

  const renderWidget = (widgetKey) => {
    switch (widgetKey) {
      case 'chart':
        return <SalesChart chartData={chartData} maxSales={maxSales} globalFilter={globalFilter} getEmptyStateMessage={getEmptyStateMessage} />;
      case 'payments':
        return <PaymentBreakdown paymentStats={paymentStats} totalGross={kpiStats.gross} globalFilter={globalFilter} />;
      case 'topProducts':
        return (
          <TopRanking 
            rankingStats={rankingStats} 
            rankingMode={rankingMode} 
            setRankingMode={setRankingMode}
            rankingCriteria={rankingCriteria}
            setRankingCriteria={setRankingCriteria}
            getEmptyStateMessage={getEmptyStateMessage} 
          />
        );
      case 'lowStock':
        return (
          <LowStockAlert 
            lowStockProducts={lowStockProducts} 
            expiringProducts={expiringProducts} 
            onAlertClick={onAlertClick} 
          />
        );
      case 'financialActivity':
        return (
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 h-full flex flex-col">
              <div className="flex justify-between items-center mb-4 gap-2 shrink-0">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-slate-800 flex items-center gap-1.5 whitespace-nowrap text-sm">
                    <Clock size={16} className="text-blue-500"/> Actividad Financiera
                  </h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded uppercase tracking-wider">
                    {{ day: 'Hoy', week: 'Semana', month: 'Mes' }[globalFilter]}
                  </span>
                  <button 
                    onClick={() => onNavigate && onNavigate('history')}
                    className="text-[9px] font-bold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded uppercase tracking-wider hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-0.5"
                  >
                    Ver todo <ChevronRight size={10} />
                  </button>
                </div>
              </div>

              <div className="relative flex-1 min-h-[280px]">
                <div className="absolute inset-0 overflow-y-auto custom-scrollbar pr-1">
                  <div className="space-y-2">
                    {combinedActivity.length > 0 ? (
                      (() => {
                        let lastDateStr = null;
                        const elements = [];

                        combinedActivity.slice(0, 50).forEach((item, idx) => {
                          const itemDate = new Date(item.sortTime);
                          const dateStr = itemDate.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });

                          if (globalFilter !== 'day' && dateStr !== lastDateStr) {
                            elements.push(
                              <div key={`sep-${dateStr}`} className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-sm px-2 py-1 rounded text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center border border-slate-200 shadow-[0_2px_4px_rgba(0,0,0,0.02)]">
                                {dateStr === new Date().toLocaleDateString('es-AR') ? 'HOY - ' : ''}{dateStr}
                              </div>
                            );
                            lastDateStr = dateStr;
                          }

                          let clientName = 'Consumidor Final';
                          let memberNum = '';
                          if (item.client) {
                             if (typeof item.client === 'object') {
                               clientName = item.client.name || 'Consumidor Final';
                               memberNum = item.client.memberNumber && item.client.memberNumber !== '---' ? ` (#${item.client.memberNumber})` : '';
                             } else {
                               clientName = item.client;
                             }
                          }
                          if (clientName === 'No asociado') clientName = 'Consumidor Final';
                          if (item.type === 'expense') clientName = item.category;

                          const isSale = item.type === 'sale';
                          const handleItemClick = () => {
                            if (isSale && onViewTransaction) {
                              // ✨ Como esto es visual, buscamos en cleanTransactions para asegurar congruencia
                              const originalTx = cleanTransactions.find(t => String(t.id) === String(item.id));
                              if (originalTx) {
                                onViewTransaction(originalTx);
                              }
                            }
                          };

                          elements.push(
                            <div 
                              key={idx} 
                              onClick={handleItemClick}
                              className={`flex justify-between items-center p-2.5 rounded-lg border bg-slate-50 transition-colors ${
                                isSale ? 'hover:border-blue-300 hover:bg-white cursor-pointer border-slate-200' : 'border-slate-200'
                              }`}
                            >
                              <div className="flex-1 min-w-0 pr-3 flex items-center gap-2">
                                <div className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center shadow-sm border ${isSale ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                                  {isSale ? <ShoppingCart size={12} /> : <TrendingDown size={12} />}
                                </div>
                                <div className="flex flex-col min-w-0">
                                  {isSale ? (
                                    <p className="font-bold text-xs text-slate-700 truncate" title={`${clientName}${memberNum} | Ticket #${item.id}`}>
                                      {clientName} <span className="text-slate-400 font-medium">{memberNum}</span> <span className="text-slate-300 mx-1">|</span> <span className="text-blue-500 font-mono">#{item.id}</span>
                                    </p>
                                  ) : (
                                    <p className="font-bold text-xs text-slate-700 truncate">{clientName}</p>
                                  )}
                                  <p className="text-[9px] font-medium text-slate-400 truncate">
                                    {isSale ? `${item.payment} • ${item.items?.length || 0} ítems` : `${item.paymentMethod} • ${item.description || item.note || '-'}`}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right shrink-0 flex flex-col items-end">
                                <p className={`font-bold text-xs flex items-center gap-0.5 ${isSale ? 'text-emerald-600' : 'text-red-600'}`}>
                                  <span>{isSale ? '+' : '-'}</span>
                                  <FancyPrice amount={isSale ? item.total : item.amount} />
                                </p>
                                <p className="text-[9px] font-bold text-slate-400 mt-0.5">
                                  {item.time || new Date(item.sortTime).toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'})}
                                </p>
                              </div>
                            </div>
                          );
                        });

                        return elements;
                      })()
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 opacity-50 h-full">
                        <Clock size={32} className="mb-2 text-slate-300" />
                        <p className="text-xs font-bold text-slate-400 text-center">{{ day: 'Sin movimientos hoy', week: 'Sin movimientos esta semana', month: 'Sin movimientos este mes' }[globalFilter]}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
        );
      case 'systemLogs':
        return (
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 h-full flex flex-col">
              <div className="flex justify-between items-center mb-4 gap-2 shrink-0">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-slate-800 flex items-center gap-1.5 whitespace-nowrap text-sm">
                    <FileText size={16} className="text-fuchsia-500"/> Bitácora del Sistema
                  </h3>
                </div>
                <button 
                  onClick={() => onNavigate && onNavigate('logs')}
                  className="text-[9px] font-bold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded uppercase tracking-wider hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-0.5"
                >
                  Ver todo <ChevronRight size={10} />
                </button>
              </div>
              
              <div className="relative flex-1 min-h-[280px]">
                <div className="absolute inset-0 overflow-y-auto custom-scrollbar pr-1">
                  <div className="ml-2.5 mt-2 space-y-0 border-l border-slate-200">
                    {/* ✨ USAMOS cleanDailyLogs en lugar de dailyLogs crudos */}
                    {cleanDailyLogs && cleanDailyLogs.length > 0 ? (
                      cleanDailyLogs.slice(0, 50).map((log) => (
                        <div key={log.id} className="group/log relative pb-5 pl-5 transition-all">
                          <div className="absolute -left-[5.5px] top-1.5 w-2.5 h-2.5 rounded-full bg-slate-200 ring-4 ring-white group-hover/log:bg-fuchsia-500 group-hover/log:scale-125 transition-all duration-200" />
                          
                          <div className="flex flex-col bg-transparent group-hover/log:bg-slate-50/80 p-2 -my-2 -ml-2 rounded-lg transition-colors border border-transparent group-hover/log:border-slate-100">
                            <div className="flex justify-between items-start">
                              <span className="text-xs font-bold text-slate-700 group-hover/log:text-fuchsia-700 transition-colors">
                                {log.action}
                              </span>
                              <span className="text-[9px] font-mono text-slate-400 bg-slate-50 px-1 rounded border border-slate-100 group-hover/log:bg-white group-hover/log:border-slate-200 transition-colors">
                                {log.timestamp}
                              </span>
                            </div>
                            
                            <p className="text-[11px] text-slate-500 leading-snug mt-0.5 break-words">
                              {typeof log.details === 'string' ? log.details : 'Detalle registrado en sistema'}
                            </p>
                            
                            <div className="flex items-center gap-1 mt-1.5 opacity-60 group-hover/log:opacity-100 transition-opacity">
                               <div className="w-4 h-4 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[8px] font-bold uppercase">
                                 {log.user ? log.user.substring(0,2) : 'SY'}
                               </div>
                               <span className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">
                                 {log.user || 'Sistema'}
                               </span>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 opacity-50 h-full border-l-0 -ml-2.5">
                        <FileText size={32} className="mb-2 text-slate-300" />
                        <p className="text-xs font-bold text-slate-400 text-center">Registro limpio</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
        );
      default: return null;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      <div className="flex flex-col lg:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Panel de Control</h2>
          <p className="text-xs text-slate-400">Resumen de operaciones en tiempo real</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LayoutManagerControls isAdmin={isAdmin} hasUnsavedChanges={hasUnsavedChanges} onSave={handleSaveLayout} onRestore={handleRestoreLayout} />
          <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>
          <GlobalTimeSwitch globalFilter={globalFilter} setGlobalFilter={setGlobalFilter} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {topWidgetOrder.map((widgetKey, index) => (
          <div
            key={widgetKey}
            draggable={isAdmin}
            onDragStart={(e) => {
              if (!isAdmin) return;
              setDraggedTopItem(widgetKey);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => setDraggedTopItem(null)} 
            onDragOver={(e) => {
              e.preventDefault();
              if (!isAdmin || draggedTopItem === widgetKey) return;
              const currentIdx = topWidgetOrder.indexOf(draggedTopItem);
              if (currentIdx !== -1 && currentIdx !== index) {
                const newOrder = [...topWidgetOrder];
                newOrder.splice(currentIdx, 1);
                newOrder.splice(index, 0, draggedTopItem);
                setTopWidgetOrder(newOrder);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDraggedTopItem(null);
            }}
            className={`transition-all duration-200 ${draggedTopItem === widgetKey ? 'opacity-40 scale-95' : 'opacity-100'}`}
          >
            <div className="group relative h-full">
              <KpiCard
                widgetKey={widgetKey}
                kpiStats={kpiStats}
                averageTicket={averageTicket}
                openingBalance={openingBalance}
                currentUser={currentUser}
                setTempOpeningBalance={setTempOpeningBalance}
                setIsOpeningBalanceModalOpen={setIsOpeningBalanceModalOpen}
                globalFilter={globalFilter}
                expenses={filteredExpenses} 
                onOpenExpenseModal={onOpenExpenseModal}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {widgetOrder.map((widgetKey, index) => (
          <div
            key={widgetKey}
            draggable={isAdmin}
            onDragStart={(e) => {
              if (!isAdmin) return;
              setDraggedItem(widgetKey);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => setDraggedItem(null)} 
            onDragOver={(e) => {
              e.preventDefault();
              if (!isAdmin || draggedItem === widgetKey) return;
              const currentIdx = widgetOrder.indexOf(draggedItem);
              if (currentIdx !== -1 && currentIdx !== index) {
                const newOrder = [...widgetOrder];
                newOrder.splice(currentIdx, 1);
                newOrder.splice(index, 0, draggedItem);
                setWidgetOrder(newOrder);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDraggedItem(null);
            }}
            className={`transition-all duration-200 h-full ${draggedItem === widgetKey ? 'opacity-40 scale-95 border-dashed border-2 border-slate-300 rounded-xl' : ''}`}
          >
            <div className="group relative h-full">
              {renderWidget(widgetKey)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}