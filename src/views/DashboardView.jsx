// src/views/DashboardView.jsx
// ♻️ REFACTOR: Lógica de cálculo extraída a hooks/useDashboardData.js
//              Widgets extraídos a components/dashboard/
//              Este archivo conserva: estado UI, drag-and-drop, persistencia de layout

import React, { useState, useEffect } from 'react';
import { 
  GripVertical, 
  Lock, 
  ShoppingCart, 
  TrendingDown, 
  FileText, 
  Clock 
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
import { formatPrice } from '../utils/helpers';

// Órdenes por defecto (Constantes)
// Agregamos 'activityPanel' al final de la sección inferior
const DEFAULT_BOTTOM_ORDER = ['chart', 'payments', 'topProducts', 'lowStock', 'activityPanel'];
// Reemplazamos 'placeholder' por 'expenses' si deseas que aparezca por defecto
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
  // Props nuevas recuperadas
  expenses = [],
  onOpenExpenseModal
}) {
  // =====================================================
  // 1. ESTADOS Y PERMISOS
  // =====================================================
  const isAdmin = currentUser?.role === 'admin';

  // Filtro global de período
  const [globalFilter, setGlobalFilter] = useState('day');

  // Switch Productos / Categorías
  const [rankingMode, setRankingMode] = useState('products');

  // --- GESTIÓN DE ORDEN Y PERSISTENCIA ---
  const [widgetOrder, setWidgetOrder] = useState(() => {
    const saved = localStorage.getItem('party_dashboard_order_bottom');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Seguridad: Si el guardado viejo no tiene el nuevo panel, lo agregamos
      if (!parsed.includes('activityPanel')) return [...parsed, 'activityPanel'];
      return parsed;
    }
    return DEFAULT_BOTTOM_ORDER;
  });

  const [topWidgetOrder, setTopWidgetOrder] = useState(() => {
    const saved = localStorage.getItem('party_dashboard_order_top');
    if (saved) {
        const parsed = JSON.parse(saved);
        // Seguridad: Si el guardado viejo tiene placeholder, lo migramos a expenses
        const migrated = parsed.map(k => k === 'placeholder' ? 'expenses' : k);
        if (!migrated.includes('expenses')) return [...migrated, 'expenses'];
        return migrated;
    }
    return DEFAULT_TOP_ORDER;
  });

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [draggedItem, setDraggedItem] = useState(null);
  const [draggedTopItem, setDraggedTopItem] = useState(null);

  // Detectar cambios sin guardar
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
    // Borramos localStorage para resetear a los nuevos Defaults
    localStorage.removeItem('party_dashboard_order_bottom');
    localStorage.removeItem('party_dashboard_order_top');
    setWidgetOrder(DEFAULT_BOTTOM_ORDER);
    setTopWidgetOrder(DEFAULT_TOP_ORDER);
    setHasUnsavedChanges(false);
  };

  // =====================================================
  // 2. DATOS CALCULADOS (via custom hook)
  // =====================================================
  const {
    kpiStats,
    averageTicket,
    chartData,
    maxSales,
    paymentStats,
    rankingStats,
    lowStockProducts,
    getEmptyStateMessage,
  } = useDashboardData({ transactions, dailyLogs, inventory, globalFilter, rankingMode, expenses });

  // =====================================================
  // 2.1 DATOS LOCALES PARA EL NUEVO PANEL DE ACTIVIDAD
  // =====================================================
  // Unificamos Ventas y Gastos en una sola lista cronológica
  const combinedActivity = [
    ...(transactions || []).map(t => ({
      ...t,
      type: 'sale',
      sortTime: t.id // Usamos ID como timestamp aproximado si no hay date object
    })),
    ...(expenses || []).map(e => ({
      ...e,
      type: 'expense',
      sortTime: e.id
    }))
  ].sort((a, b) => b.sortTime - a.sortTime); // Más reciente primero

  // =====================================================
  // 3. RENDERIZADORES DE WIDGETS
  // =====================================================
  const renderWidget = (widgetKey) => {
    switch (widgetKey) {
      case 'chart':
        return (
          <SalesChart
            chartData={chartData}
            maxSales={maxSales}
            globalFilter={globalFilter}
            getEmptyStateMessage={getEmptyStateMessage}
          />
        );
      case 'payments':
        return (
          <PaymentBreakdown
            paymentStats={paymentStats}
            totalGross={kpiStats.gross}
            globalFilter={globalFilter}
          />
        );
      case 'topProducts':
        return (
          <TopRanking
            rankingStats={rankingStats}
            rankingMode={rankingMode}
            setRankingMode={setRankingMode}
            getEmptyStateMessage={getEmptyStateMessage}
          />
        );
      case 'lowStock':
        return <LowStockAlert lowStockProducts={lowStockProducts} />;
      
      // --- NUEVO WIDGET: PANEL DE ACTIVIDAD Y BITÁCORA ---
      case 'activityPanel':
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full min-h-[450px]">
            
            {/* COLUMNA 1: Actividad Financiera (Ventas + Gastos) */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-full max-h-[450px]">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                  <Clock size={18} className="text-blue-600"/> Actividad Financiera
                </h3>
                <span className="text-[10px] font-bold text-slate-400 bg-white border px-2 py-0.5 rounded">En vivo</span>
              </div>
              
              <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                {combinedActivity.length > 0 ? (
                  combinedActivity.slice(0, 50).map((item, idx) => ( // Mostramos hasta 50, scroll para verlos
                    <div key={idx} className="flex items-center justify-between p-3 mb-1 hover:bg-slate-50 rounded-lg transition-colors border-b border-dashed border-slate-100 last:border-0">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm ${
                            item.type === 'sale' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                        }`}>
                          {item.type === 'sale' ? <ShoppingCart size={16} /> : <TrendingDown size={16} />}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700 leading-tight">
                              {item.type === 'sale' ? `Venta #${item.id}` : item.category}
                          </span>
                          <span className="text-[10px] text-slate-400 leading-tight">
                              {item.type === 'sale' 
                                  ? `${item.payment} • ${item.items?.length || 0} items` 
                                  : `${item.paymentMethod} • ${item.note || '-'}`}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-bold ${item.type === 'sale' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {item.type === 'sale' ? '+' : '-'}${formatPrice(item.type === 'sale' ? item.total : item.amount)}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {item.time || new Date(item.sortTime).toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'})}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60">
                    <Clock size={32} className="mb-2" />
                    <p className="text-xs italic">Sin movimientos hoy</p>
                  </div>
                )}
              </div>
            </div>

            {/* COLUMNA 2: Bitácora de Acciones (Logs) */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden h-full max-h-[450px]">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                <h3 className="font-bold text-slate-700 flex items-center gap-2">
                  <FileText size={18} className="text-fuchsia-600"/> Bitácora del Sistema
                </h3>
                <span className="text-[10px] font-bold text-slate-400 bg-white border px-2 py-0.5 rounded">Auditoría</span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="space-y-0">
                  {dailyLogs && dailyLogs.length > 0 ? (
                    dailyLogs.slice(0, 50).map((log) => ( // Scroll para ver más de 10
                      <div key={log.id} className="flex gap-3 relative pb-5 border-l border-slate-200 ml-1.5 last:border-0 last:pb-0 group">
                        <div className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-slate-300 ring-4 ring-white group-hover:bg-fuchsia-400 transition-colors" />
                        <div className="pl-3 -mt-1 w-full">
                          <div className="flex justify-between items-start">
                            <span className="text-xs font-bold text-slate-700">{log.action}</span>
                            <span className="text-[9px] font-mono text-slate-400 bg-slate-50 px-1 rounded">{log.timestamp}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 leading-snug mt-0.5 break-words">
                            {typeof log.details === 'string' ? log.details : 'Detalle registrado en sistema'}
                          </p>
                          <p className="text-[9px] text-slate-400 mt-1 flex items-center gap-1">
                             <span className="w-1 h-1 rounded-full bg-slate-300"></span> {log.user}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-60 mt-10">
                      <FileText size={32} className="mb-2" />
                      <p className="text-xs italic">Registro limpio</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        );

      default:
        return null;
    }
  };

  // =====================================================
  // 4. RENDER PRINCIPAL
  // =====================================================
  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-10">
      {/* HEADER & CONTROLES */}
      <div className="flex flex-col lg:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Panel de Control</h2>
          <p className="text-xs text-slate-400">Resumen de operaciones en tiempo real</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <LayoutManagerControls
            isAdmin={isAdmin}
            hasUnsavedChanges={hasUnsavedChanges}
            onSave={handleSaveLayout}
            onRestore={handleRestoreLayout}
          />
          <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>
          <GlobalTimeSwitch globalFilter={globalFilter} setGlobalFilter={setGlobalFilter} />
        </div>
      </div>

      {/* Tarjetas principales (KPIs) - Draggable condicional */}
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
            className={`transition-all duration-200 ${
              draggedTopItem === widgetKey ? 'opacity-40 scale-95' : 'opacity-100'
            }`}
          >
            <div className="group relative h-full">
              {isAdmin && (
                <div className="absolute top-1 right-1 z-20 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 bg-white/80 p-1 rounded backdrop-blur-sm">
                  <GripVertical size={14} />
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
                // Pasamos props de Gastos para que KpiCards.jsx pueda renderizar la tarjeta 'expenses'
                expenses={expenses}
                onOpenExpenseModal={onOpenExpenseModal}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Gráficos y Widgets Inferiores - Draggable condicional */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {widgetOrder.map((widgetKey, index) => {
          // El panel de actividad ocupará todo el ancho si es posible (lg:col-span-2)
          const isFullWidth = widgetKey === 'activityPanel';

          return (
            <div
              key={widgetKey}
              draggable={isAdmin}
              onDragStart={(e) => {
                if (!isAdmin) return;
                setDraggedItem(widgetKey);
                e.dataTransfer.effectAllowed = 'move';
              }}
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
              className={`transition-all duration-200 h-full ${
                draggedItem === widgetKey ? 'opacity-40 scale-95 border-dashed border-2 border-slate-300 rounded-xl' : ''
              } ${isFullWidth ? 'lg:col-span-2' : ''}`}
            >
              <div className={`group relative h-full ${widgetKey === 'activityPanel' ? '' : ''}`}>
                {isAdmin ? (
                  <div className="absolute top-4 right-4 z-20 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 bg-white/80 p-1 rounded backdrop-blur-sm">
                    <GripVertical size={16} />
                  </div>
                ) : (
                  // Solo mostramos candado si NO es el panel de actividad (para no tapar info)
                  widgetKey !== 'activityPanel' && (
                    <div className="absolute top-4 right-4 z-20 opacity-0 group-hover:opacity-50 transition-opacity text-slate-200 pointer-events-none">
                      <Lock size={16} />
                    </div>
                  )
                )}
                {renderWidget(widgetKey)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}