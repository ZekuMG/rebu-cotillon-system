import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  ShoppingCart, 
  TrendingDown, 
  FileText,
  Clock,
  ChevronRight,
  ChevronDown,
  CalendarDays,
  RefreshCw
} from 'lucide-react';

import useDashboardData from '../hooks/useDashboardData';
import { hasOwnerAccess } from '../utils/appUsers';
import { canAccessTab, getAllowedDashboardFilters } from '../utils/userPermissions';
import {
  KpiCard,
  PaymentBreakdown,
  TopRanking,
  LowStockAlert,
  GlobalTimeSwitch,
  LayoutManagerControls,
} from '../components/dashboard';
import { FancyPrice } from '../components/FancyPrice';
import { formatTimeAR, isTestRecord } from '../utils/helpers'; // ✨ Importado el escudo anti-test
import { parseMetricDate } from '../utils/salesMetricsCore';

const DEFAULT_BOTTOM_ORDER = ['payments', 'topProducts', 'lowStock', 'financialActivity'];
const DEFAULT_TOP_ORDER = ['sales', 'revenue', 'net', 'opening', 'average', 'expenses'];
const DASHBOARD_FEED_BATCH = 50;
const RETIRED_BOTTOM_WIDGETS = new Set(['chart', 'expirations', 'systemLogs']);
const BOTTOM_WIDGETS = new Set(DEFAULT_BOTTOM_ORDER);

const resolveActivityDate = (record = {}) => {
  const directDate = record.metricDate || record.activityDate || record.createdAt || record.created_at || record.date;
  const parsedDirect = parseMetricDate(directDate);
  const parsedDate = parsedDirect ? new Date(parsedDirect.getTime()) : null;

  if (!parsedDate) return null;

  const rawTime = String(record.time || record.timestamp || '').trim();
  const timeMatch = rawTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeMatch && !record.metricDate && !record.createdAt && !record.created_at) {
    parsedDate.setHours(
      Number(timeMatch[1]) || 0,
      Number(timeMatch[2]) || 0,
      Number(timeMatch[3]) || 0,
      0
    );
  }

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
};

const getActivityDateKey = (date) => {
  if (!date || Number.isNaN(date.getTime())) return 'sin-fecha';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
};

const formatActivityDateLabel = (date) =>
  date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : 'Sin fecha';

const formatActivityTimeLabel = (date, fallback) => {
  const cleanFallback = String(fallback || '').trim();
  if (cleanFallback && !cleanFallback.startsWith('--')) return cleanFallback.slice(0, 5);
  return date ? formatTimeAR(date) : '--:--';
};

const safeParseDashboardOrder = (value) => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const normalizeBottomOrder = (order) => {
  const source = Array.isArray(order) ? [...order] : [...DEFAULT_BOTTOM_ORDER];
  const migrated = [];

  source.forEach((widgetKey) => {
    if (widgetKey === 'activityPanel') {
      migrated.push('financialActivity');
      return;
    }
    migrated.push(widgetKey);
  });

  const normalized = migrated.filter((widgetKey, index, list) => (
    BOTTOM_WIDGETS.has(widgetKey) &&
    !RETIRED_BOTTOM_WIDGETS.has(widgetKey) &&
    list.indexOf(widgetKey) === index
  ));

  DEFAULT_BOTTOM_ORDER.forEach((widgetKey) => {
    if (!normalized.includes(widgetKey)) normalized.push(widgetKey);
  });

  return normalized;
};

export default function DashboardView({
  openingBalance,
  totalSales: _totalSales,
  salesCount: _salesCount,
  currentUser,
  setTempOpeningBalance,
  setIsOpeningBalanceModalOpen,
  transactions,
  dailyLogs,
  inventory,
  expenses = [],
  isLoading = false,
  isProfitSyncing = false,
  emptyStateMessage = '',
  onOpenExpenseModal,
  onAlertClick,
  onNavigate,
  onViewTransaction,
  onViewExpense,
  onRequireFullTransactions,
}) {
  const isAdmin = hasOwnerAccess(currentUser);
  const canViewHistory = canAccessTab(currentUser, 'history');
  const canViewInventory = canAccessTab(currentUser, 'inventory');

  // ✨ LIMPIEZA ABSOLUTA DE MODO TEST ANTES DE CALCULAR NADA
  const cleanTransactions = useMemo(() => (transactions || []).filter(t => !isTestRecord(t)), [transactions]);
  const cleanDailyLogs = useMemo(() => (dailyLogs || []).filter(l => !isTestRecord(l)), [dailyLogs]);
  const cleanInventory = useMemo(() => (inventory || []).filter(i => !isTestRecord(i)), [inventory]);
  const cleanExpenses = useMemo(() => (expenses || []).filter(e => !isTestRecord(e)), [expenses]);
  const availableDashboardFilters = useMemo(() => getAllowedDashboardFilters(currentUser), [currentUser]);

  const [globalFilter, setGlobalFilter] = useState(availableDashboardFilters[0] || 'day');
  const [rankingMode, setRankingMode] = useState('products');
  const [rankingCriteria, setRankingCriteria] = useState('revenue');
  const [visibleActivityCount, setVisibleActivityCount] = useState(DASHBOARD_FEED_BATCH);
  const [visibleLogsCount, setVisibleLogsCount] = useState(DASHBOARD_FEED_BATCH);
  const [showOnlyActivityExpenses, setShowOnlyActivityExpenses] = useState(false);
  const [isActivityDateMenuOpen, setIsActivityDateMenuOpen] = useState(false);
  const activityScrollRef = useRef(null);
  const activityDateRefs = useRef({});
  const pendingActivityDateKeyRef = useRef(null);
  const requestedAnnualFullLoadRef = useRef(false);

  useEffect(() => {
    if (!availableDashboardFilters.length) return;
    if (!availableDashboardFilters.includes(globalFilter)) {
      setGlobalFilter(availableDashboardFilters[0]);
    }
  }, [availableDashboardFilters, globalFilter]);

  useEffect(() => {
    if (globalFilter !== 'year') {
      requestedAnnualFullLoadRef.current = false;
      return;
    }

    if (requestedAnnualFullLoadRef.current || !onRequireFullTransactions) return;
    requestedAnnualFullLoadRef.current = true;
    void onRequireFullTransactions();
  }, [globalFilter, onRequireFullTransactions]);

  const [widgetOrder, setWidgetOrder] = useState(() => {
    const saved = safeParseDashboardOrder(localStorage.getItem('party_dashboard_order_bottom'));
    return normalizeBottomOrder(saved);
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
    const rawSavedBottom = localStorage.getItem('party_dashboard_order_bottom');
    if (!rawSavedBottom) return;

    const parsed = safeParseDashboardOrder(rawSavedBottom);
    const normalized = normalizeBottomOrder(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      localStorage.setItem('party_dashboard_order_bottom', JSON.stringify(normalized));
    }
  }, []);

  useEffect(() => {
    const savedBottom = localStorage.getItem('party_dashboard_order_bottom');
    const savedTop = localStorage.getItem('party_dashboard_order_top');

    const currentBottomStr = JSON.stringify(widgetOrder);
    const currentTopStr = JSON.stringify(topWidgetOrder);

    const savedBottomStr = JSON.stringify(normalizeBottomOrder(safeParseDashboardOrder(savedBottom)));
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
    const sales = (filteredData || []).map((t) => {
      const activityDate = resolveActivityDate(t);
      return {
        ...t,
        type: 'sale',
        activityDate,
        activityDateKey: getActivityDateKey(activityDate),
        activityDateLabel: formatActivityDateLabel(activityDate),
        activityTimeLabel: formatActivityTimeLabel(activityDate, t.time),
        sortTime: activityDate ? activityDate.getTime() : 0,
      };
    });
    const exps = (filteredExpenses || []).map((e) => {
      const activityDate = resolveActivityDate(e);
      return {
        ...e,
        type: 'expense',
        activityDate,
        activityDateKey: getActivityDateKey(activityDate),
        activityDateLabel: formatActivityDateLabel(activityDate),
        activityTimeLabel: formatActivityTimeLabel(activityDate, e.time),
        sortTime: activityDate ? activityDate.getTime() : 0,
      };
    });
    return (showOnlyActivityExpenses ? exps : [...sales, ...exps]).sort((a, b) => b.sortTime - a.sortTime);
  }, [filteredData, filteredExpenses, showOnlyActivityExpenses]);

  const activityDateOptions = useMemo(() => {
    const dates = new Map();
    const todayLabel = formatActivityDateLabel(new Date());

    combinedActivity.forEach((item) => {
      if (!item.activityDateKey || item.activityDateKey === 'sin-fecha' || dates.has(item.activityDateKey)) return;
      dates.set(item.activityDateKey, {
        key: item.activityDateKey,
        label: item.activityDateLabel,
        isToday: item.activityDateLabel === todayLabel,
      });
    });

    return Array.from(dates.values());
  }, [combinedActivity]);

  const scrollActivityToDate = useCallback((dateKey) => {
    const container = activityScrollRef.current;
    const target = activityDateRefs.current[dateKey];
    if (!container || !target) return false;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetTop = targetRect.top - containerRect.top + container.scrollTop - 6;
    container.scrollTo({ top: Math.max(targetTop, 0), behavior: 'auto' });
    return true;
  }, []);

  const handleActivityDateSelect = useCallback((dateKey) => {
    setIsActivityDateMenuOpen(false);

    const targetIndex = combinedActivity.findIndex((item) => item.activityDateKey === dateKey);
    if (targetIndex === -1) return;

    if (targetIndex >= visibleActivityCount) {
      pendingActivityDateKeyRef.current = dateKey;
      setVisibleActivityCount(Math.min(combinedActivity.length, targetIndex + DASHBOARD_FEED_BATCH));
      return;
    }

    window.requestAnimationFrame(() => scrollActivityToDate(dateKey));
  }, [combinedActivity, scrollActivityToDate, visibleActivityCount]);

  useEffect(() => {
    if (!pendingActivityDateKeyRef.current) return;
    const dateKey = pendingActivityDateKeyRef.current;
    window.requestAnimationFrame(() => {
      if (scrollActivityToDate(dateKey)) {
        pendingActivityDateKeyRef.current = null;
      }
    });
  }, [visibleActivityCount, combinedActivity, scrollActivityToDate]);

  useEffect(() => {
    setVisibleActivityCount(DASHBOARD_FEED_BATCH);
    pendingActivityDateKeyRef.current = null;
  }, [combinedActivity, globalFilter]);

  useEffect(() => {
    setIsActivityDateMenuOpen(false);
  }, [globalFilter]);

  useEffect(() => {
    setVisibleLogsCount(DASHBOARD_FEED_BATCH);
  }, [cleanDailyLogs]);

  const handleInfiniteFeedScroll = (event, totalItems, setVisibleCount) => {
    const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
    if (scrollHeight - scrollTop > clientHeight + 200) return;

    setVisibleCount((current) => {
      if (current >= totalItems) return current;
      return Math.min(current + DASHBOARD_FEED_BATCH, totalItems);
    });
  };

  const hasDashboardSourceData =
    cleanTransactions.length > 0 ||
    cleanDailyLogs.length > 0 ||
    cleanExpenses.length > 0;
  const isRefreshingDashboardData = Boolean(isProfitSyncing && hasDashboardSourceData);
  const renderWidget = (widgetKey) => {
    switch (widgetKey) {
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
            onSelectEntry={(entry, mode) => {
              if (mode === 'categories') {
                if (canViewHistory && onNavigate) {
                  onNavigate('history', { category: entry.name });
                  return;
                }
                if (canViewInventory && onNavigate) {
                  onNavigate('inventory', { category: entry.name });
                }
                return;
              }

              const query = entry.name || '';
              if (canViewHistory && onNavigate) {
                onNavigate('history', { searchQuery: query });
                return;
              }
              if (canViewInventory && onNavigate && !String(query).trim().startsWith('*')) {
                onNavigate('inventory', { searchQuery: query });
              }
            }}
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
            <div className="bg-white p-3.5 rounded-lg shadow-sm border border-slate-200 h-full min-h-0 flex flex-col">
              <div className="flex justify-between items-center mb-2.5 gap-2 shrink-0">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-slate-800 flex items-center gap-1.5 whitespace-nowrap text-[13px]">
                    <Clock size={15} className="text-blue-500"/> Actividad Financiera
                  </h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowOnlyActivityExpenses((value) => !value)}
                    aria-pressed={showOnlyActivityExpenses}
                    title={showOnlyActivityExpenses ? 'Mostrando solo gastos' : 'Filtrar solo gastos'}
                    className={`flex h-6 items-center gap-1 rounded border px-1.5 text-[8px] font-black uppercase tracking-wider transition-colors ${
                      showOnlyActivityExpenses
                        ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                        : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                    }`}
                  >
                    <TrendingDown size={10} />
                    Gastos
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        if (globalFilter !== 'day' && activityDateOptions.length > 0) {
                          setIsActivityDateMenuOpen((value) => !value);
                        }
                      }}
                      disabled={globalFilter === 'day' || activityDateOptions.length === 0}
                      className={`flex h-6 items-center gap-1 rounded border px-1.5 text-[9px] font-bold uppercase tracking-wider transition-colors ${
                        globalFilter !== 'day' && activityDateOptions.length > 0
                          ? 'cursor-pointer border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100'
                          : 'cursor-default border-blue-200 bg-blue-50 text-blue-600'
                      }`}
                      title={globalFilter === 'day' ? 'Actividad de hoy' : 'Saltar a una fecha'}
                    >
                      <CalendarDays size={10} />
                      {{ day: 'Hoy', week: 'Semana', month: 'Mes', year: 'Año' }[globalFilter]}
                      {globalFilter !== 'day' && activityDateOptions.length > 0 && <ChevronDown size={10} />}
                    </button>
                    {isActivityDateMenuOpen && globalFilter !== 'day' && (
                      <div className="dashboard-activity-date-menu absolute right-0 top-full z-30 mt-1 max-h-48 w-40 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-[0_8px_18px_rgba(15,23,42,0.12)]">
                        {activityDateOptions.map((option) => (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => handleActivityDateSelect(option.key)}
                            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[10px] font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                          >
                            <span>{option.isToday ? 'HOY - ' : ''}{option.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={() => onNavigate && onNavigate('history')}
                    className="text-[8px] font-bold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded uppercase tracking-wider hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-0.5"
                  >
                    Ver todo <ChevronRight size={10} />
                  </button>
                </div>
              </div>

              <div
                ref={activityScrollRef}
                className="custom-scrollbar flex-1 min-h-0 overflow-y-auto pr-1"
                onScroll={(event) => handleInfiniteFeedScroll(event, combinedActivity.length, setVisibleActivityCount)}
              >
                  <div className="space-y-1">
                    {combinedActivity.length > 0 ? (
                      (() => {
                        let lastDateStr = null;
                        const elements = [];

                        combinedActivity.slice(0, visibleActivityCount).forEach((item, idx) => {
                          const dateStr = item.activityDateLabel;
                          const dateKey = item.activityDateKey;

                          if (globalFilter !== 'day' && dateStr !== lastDateStr) {
                            elements.push(
                              <div
                                key={`sep-${dateKey}`}
                                ref={(node) => {
                                  if (node) activityDateRefs.current[dateKey] = node;
                                  else delete activityDateRefs.current[dateKey];
                                }}
                                className="sticky top-0 z-10 bg-slate-100/95 backdrop-blur-sm px-2 py-1 rounded text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center border border-slate-200 shadow-[0_2px_4px_rgba(0,0,0,0.02)]"
                              >
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
                            if (!isSale && onViewExpense) {
                              const originalExpense = cleanExpenses.find(e => String(e.id) === String(item.id));
                              onViewExpense(originalExpense || item);
                            }
                          };

                          elements.push(
                            <div 
                              key={`${item.type}-${item.id || idx}`}
                              onClick={handleItemClick}
                              className={`flex justify-between items-center px-2 py-1.5 rounded-md border bg-slate-50 transition-colors ${
                                isSale
                                  ? 'hover:border-blue-300 hover:bg-white cursor-pointer border-slate-200'
                                  : 'hover:border-red-300 hover:bg-white cursor-pointer border-slate-200'
                              }`}
                            >
                              <div className="flex-1 min-w-0 pr-2 flex items-center gap-1.5">
                                <div className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center shadow-sm border ${isSale ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
                                  {isSale ? <ShoppingCart size={11} /> : <TrendingDown size={11} />}
                                </div>
                                <div className="flex flex-col min-w-0">
                                  {isSale ? (
                                    <p className="font-bold text-[11px] text-slate-700 truncate leading-tight" title={`${clientName}${memberNum} | Ticket #${item.id}`}>
                                      {clientName} <span className="text-slate-400 font-medium">{memberNum}</span> <span className="text-slate-300 mx-1">|</span> <span className="text-blue-500 font-mono">#{item.id}</span>
                                    </p>
                                  ) : (
                                    <p className="font-bold text-[11px] text-slate-700 truncate leading-tight">{clientName}</p>
                                  )}
                                  <p className="text-[8px] font-medium text-slate-400 truncate leading-tight">
                                    {isSale ? `${item.payment} • ${item.items?.length || 0} ítems` : `${item.paymentMethod} • ${item.description || item.note || '-'}`}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right shrink-0 flex flex-col items-end">
                                <p className={`font-bold text-[11px] flex items-center gap-0.5 leading-tight ${isSale ? 'text-emerald-600' : 'text-red-600'}`}>
                                  <span>{isSale ? '+' : '-'}</span>
                                  <FancyPrice amount={isSale ? item.total : item.amount} />
                                </p>
                                <p className="text-[8px] font-bold text-slate-400 mt-0.5 leading-tight">
                                  {item.activityTimeLabel}
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
                        <p className="text-xs font-bold text-slate-400 text-center">{{ day: 'Sin movimientos hoy', week: 'Sin movimientos esta semana', month: 'Sin movimientos este mes', year: 'Sin movimientos este año' }[globalFilter]}</p>
                      </div>
                    )}
                  </div>
              </div>
            </div>
        );
      case 'systemLogs':
        return (
            <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 h-full min-h-0 flex flex-col">
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
              
              <div
                className="custom-scrollbar flex-1 min-h-[280px] overflow-y-auto pr-1"
                onScroll={(event) => handleInfiniteFeedScroll(event, cleanDailyLogs.length, setVisibleLogsCount)}
              >
                  <div className="ml-2.5 mt-2 space-y-0 border-l border-slate-200">
                    {/* ✨ USAMOS cleanDailyLogs en lugar de dailyLogs crudos */}
                    {cleanDailyLogs && cleanDailyLogs.length > 0 ? (
                      cleanDailyLogs.slice(0, visibleLogsCount).map((log) => (
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
        );
      default: return null;
    }
  };

  if (isLoading && !hasDashboardSourceData) {
    return (
      <div className="dashboard-view flex h-full items-center justify-center rounded-[28px] border border-slate-200 bg-white/85 shadow-sm">
        <div className="text-center">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Cargando panel</p>
          <p className="mt-2 text-sm font-medium text-slate-500">Estamos trayendo ventas, logs y cierres sin bloquear el resto de la app.</p>
        </div>
      </div>
    );
  }

  if (emptyStateMessage && !hasDashboardSourceData) {
    return (
      <div className="dashboard-view flex h-full items-center justify-center rounded-[28px] border border-slate-200 bg-white/85 shadow-sm">
        <div className="max-w-md text-center">
          <p className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Dashboard no disponible</p>
          <p className="mt-2 text-sm font-medium text-slate-500">{emptyStateMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-view flex h-full min-h-0 flex-col">
      <div className="custom-scrollbar flex-1 min-h-0 overflow-y-auto pr-1">
        <div className="rebu-content-frame pb-6">
      <div className="flex flex-col lg:flex-row justify-between items-center gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold text-slate-800 leading-tight">Panel de Control</h2>
            {isRefreshingDashboardData && (
              <span className="inline-flex h-6 items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 text-[10px] font-black uppercase tracking-[0.1em] text-amber-700">
                <RefreshCw size={11} className="animate-spin" />
                Recalculando
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">
            {isRefreshingDashboardData
              ? 'Mostrando el ultimo valor mientras llega la informacion nueva de Supabase.'
              : 'Resumen de operaciones en tiempo real'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <LayoutManagerControls isAdmin={isAdmin} hasUnsavedChanges={hasUnsavedChanges} onSave={handleSaveLayout} onRestore={handleRestoreLayout} />
          <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>
          <GlobalTimeSwitch
            globalFilter={globalFilter}
            setGlobalFilter={setGlobalFilter}
            availableFilters={availableDashboardFilters}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {topWidgetOrder.map((widgetKey, index) => (
          <div
            key={widgetKey}
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
              {isAdmin && (
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 z-10 h-4"
                  aria-label="Reordenar metrica"
                  title="Arrastrar desde el cabezal"
                >
                  <div
                    draggable
                    onDragStart={(e) => {
                      setDraggedTopItem(widgetKey);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => setDraggedTopItem(null)}
                    className="pointer-events-auto mx-auto mt-1.5 h-1 w-8 cursor-grab rounded-full bg-slate-200/70 opacity-0 transition duration-150 active:cursor-grabbing group-hover:opacity-100 group-hover:bg-slate-300/80"
                  />
                </div>
              )}
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
                isRefreshing={isRefreshingDashboardData}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:auto-rows-auto">
        {widgetOrder.map((widgetKey, index) => (
          (() => {
            const isPaymentsWidget = widgetKey === 'payments';
            const isTopProductsWidget = widgetKey === 'topProducts';
            const widgetDesktopHeight = isPaymentsWidget
                  ? 'lg:h-[var(--rebu-dashboard-widget-short)]'
                : isTopProductsWidget
                  ? 'lg:h-[var(--rebu-dashboard-widget-short)]'
                : 'lg:h-[var(--rebu-dashboard-widget-tall)]';
            return (
              <div
                key={widgetKey}
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
                className={`min-h-0 transition-all duration-200 ${widgetDesktopHeight} ${draggedItem === widgetKey ? 'rounded-xl border-2 border-dashed border-slate-300 opacity-40 scale-95' : ''}`}
              >
                <div className="group relative h-full min-h-0">
                  {isAdmin && (
                    <div
                      className="pointer-events-none absolute inset-x-0 top-0 z-10 h-4"
                      aria-label="Reordenar widget"
                      title="Arrastrar desde el cabezal"
                    >
                      <div
                        draggable
                        onDragStart={(e) => {
                          setDraggedItem(widgetKey);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragEnd={() => setDraggedItem(null)}
                        className="pointer-events-auto mx-auto mt-1.5 h-1 w-9 cursor-grab rounded-full bg-slate-200/70 opacity-0 transition duration-150 active:cursor-grabbing group-hover:opacity-100 group-hover:bg-slate-300/80"
                      />
                    </div>
                  )}
                  {renderWidget(widgetKey)}
                </div>
              </div>
            );
          })()
        ))}
        </div>
      </div>
      </div>
    </div>
  );
}
