// src/components/dashboard/SalesChart.jsx
// ♻️ REFACTOR: Gráfico de barras para Día/Semana y Heatmap para el Mes

import React, { useState } from 'react';
import { BarChart3, CalendarDays, X, ShoppingCart } from 'lucide-react';
import { formatCurrency } from '../../utils/helpers';

export const SalesChart = ({ chartData, maxSales, globalFilter, getEmptyStateMessage }) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  
  // Estado para el modal de información del día
  const [selectedDay, setSelectedDay] = useState(null);

  // =====================================
  // RENDERIZADO: MAPA DE CALOR (Últimos 30 días)
  // =====================================
  if (globalFilter === 'month') {
    const localMax = Math.max(...chartData.map(d => d.sales), 1); 

    const getIntensityClass = (sales) => {
      if (sales === 0) return 'bg-slate-100 hover:bg-slate-200 border-slate-200'; // Gris si es 0
      const ratio = sales / localMax;
      
      // ✨ NUEVA ESCALA: De más oscuro a verde más fuerte/claro
      if (ratio < 0.25) return 'bg-emerald-800 hover:bg-emerald-700 border-emerald-900';
      if (ratio < 0.50) return 'bg-emerald-600 hover:bg-emerald-500 border-emerald-700';
      if (ratio < 0.75) return 'bg-emerald-500 hover:bg-emerald-400 border-emerald-600';
      return 'bg-emerald-400 hover:bg-emerald-300 border-emerald-500 shadow-sm ring-1 ring-emerald-200'; // Verde fuerte pero claro
    };

    return (
      <div className="bg-white p-5 rounded-xl shadow-sm border h-full flex flex-col relative">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2">
              <CalendarDays size={18} className="text-emerald-500" />
              Mapa de Facturación
            </h3>
            <span className="text-xs text-slate-400">
              Últimos 30 días corridos
            </span>
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center relative min-h-[180px]">
          {!chartData.some(d => d.sales > 0) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-white/60 backdrop-blur-[1px]">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide bg-white px-2 py-1 rounded border">
                {getEmptyStateMessage()}
              </span>
            </div>
          )}

          {/* Grilla tipo GitHub (10 columnas x 3 filas = 30 días) */}
          <div className="grid grid-cols-10 gap-1.5 sm:gap-2 pt-2 pb-6">
            {chartData.map((item, idx) => {
              const isHovered = hoveredIndex === idx;
              const isToday = item.isToday;

              return (
                <div
                  key={idx}
                  className="relative group cursor-pointer"
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onClick={() => setSelectedDay(item)}
                >
                  {/* Tooltip Hover */}
                  <div
                    className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 transition-all duration-200 bg-slate-800 text-white text-[10px] px-2 py-1.5 rounded whitespace-nowrap z-30 shadow-lg pointer-events-none ${isHovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
                  >
                    <p className="text-emerald-300 font-medium mb-0.5 capitalize">{item.dayName} {item.dayNum} de {item.monthName}</p>
                    <p className="font-bold text-sm leading-none mb-1">{formatCurrency(item.sales)}</p>
                    <p className="text-slate-400 leading-none">{item.count} {item.count === 1 ? 'Venta' : 'Ventas'}</p>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                  </div>

                  {/* Cuadradito de color */}
                  <div
                    className={`aspect-square w-full rounded border transition-all duration-300 ${getIntensityClass(item.sales)} ${isToday ? 'ring-2 ring-offset-1 ring-slate-800' : ''}`}
                  />
                </div>
              );
            })}
          </div>

          {/* Leyenda abajo actualizada */}
          <div className="flex items-center justify-end gap-1.5 mt-auto pt-3 border-t border-slate-100">
            <span className="text-[10px] text-slate-400 font-medium mr-1">Menos</span>
            <div className="w-3 h-3 rounded bg-slate-100 border border-slate-200" />
            <div className="w-3 h-3 rounded bg-emerald-800 border border-emerald-900" />
            <div className="w-3 h-3 rounded bg-emerald-600 border border-emerald-700" />
            <div className="w-3 h-3 rounded bg-emerald-500 border border-emerald-600" />
            <div className="w-3 h-3 rounded bg-emerald-400 border border-emerald-500" />
            <span className="text-[10px] text-slate-400 font-medium ml-1">Más</span>
          </div>
        </div>

        {/* MODAL DE DETALLES DEL DÍA */}
        {selectedDay && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[80vh]">
              <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="font-bold text-slate-800 capitalize text-lg">
                    {selectedDay.dayName} {selectedDay.dayNum} de {selectedDay.monthName}
                  </h3>
                  <p className="text-xs text-slate-500">Resumen operativo</p>
                </div>
                <button onClick={() => setSelectedDay(null)} className="text-slate-400 hover:text-slate-600 bg-white hover:bg-slate-200 p-1.5 rounded-full transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="p-5 overflow-y-auto bg-slate-100/50 flex-1 custom-scrollbar">
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Facturación</p>
                    <p className="text-lg font-black text-emerald-500">{formatCurrency(selectedDay.sales)}</p>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Operaciones</p>
                    <p className="text-lg font-black text-blue-600">{selectedDay.count}</p>
                  </div>
                </div>
                
                <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-3 flex items-center gap-1.5"><ShoppingCart size={12}/> Desglose de Ventas</h4>
                
                <div className="space-y-2">
                  {selectedDay.transactions && selectedDay.transactions.length > 0 ? (
                    selectedDay.transactions.map((tx, i) => (
                      <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center border border-emerald-100">
                            <ShoppingCart size={14}/>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-700">Ticket #{tx.id}</p>
                            <p className="text-[10px] text-slate-400 font-medium">{tx.time} • {tx.payment}</p>
                          </div>
                        </div>
                        <p className="font-bold text-emerald-600 text-sm">{formatCurrency(tx.total)}</p>
                      </div>
                    ))
                  ) : (
                    <div className="text-center bg-white border border-dashed border-slate-300 rounded-xl py-6">
                      <p className="text-xs font-bold text-slate-400">No hubo ventas este día.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =====================================
  // RENDERIZADO ORIGINAL: GRÁFICO DE BARRAS (Día y Semana)
  // =====================================
  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border h-full">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 size={18} className="text-fuchsia-500" />
            Evolución de Ventas
          </h3>
          <span className="text-xs text-slate-400">
            {globalFilter === 'day' ? 'Por horario' : 'Últimos 7 días'}
          </span>
        </div>
      </div>

      <div className="flex">
        <div className="flex flex-col justify-between pr-2 py-1 text-right" style={{ height: '180px', minWidth: '50px' }}>
          <span className="text-[9px] text-slate-400">{formatCurrency(maxSales)}</span>
          <span className="text-[9px] text-slate-400">{formatCurrency(Math.round(maxSales / 2))}</span>
          <span className="text-[9px] text-slate-400">{formatCurrency(0)}</span>
        </div>

        <div className="flex-1 relative">
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" style={{ height: '180px' }}>
            <div className="border-t border-slate-100"></div>
            <div className="border-t border-dashed border-slate-100"></div>
            <div className="border-t border-slate-200"></div>
          </div>

          {!chartData.some(d => d.sales > 0) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center z-10 bg-white/60 backdrop-blur-[1px]">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide bg-white px-2 py-1 rounded border">
                {getEmptyStateMessage()}
              </span>
            </div>
          )}

          <div className="flex items-end justify-around gap-2 relative" style={{ height: '180px' }}>
            {chartData.map((item, idx) => {
              const heightPercent = maxSales > 0 ? (item.sales / maxSales) * 100 : 0;
              const isHovered = hoveredIndex === idx;

              return (
                <div
                  key={idx}
                  className="flex-1 h-full flex flex-col items-center justify-end relative group"
                  onMouseEnter={() => setHoveredIndex(idx)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  <div
                    className={`absolute -top-10 left-1/2 -translate-x-1/2 transition-all duration-200 bg-slate-800 text-white text-[10px] px-2 py-1 rounded whitespace-nowrap z-30 shadow-lg pointer-events-none ${isHovered ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
                  >
                    <p className="font-bold">{formatCurrency(item.sales)}</p>
                    <p className="text-slate-300">{item.count} Ventas</p>
                  </div>

                  <div
                    className={`w-full max-w-[40px] rounded-t transition-all duration-300 ${
                      item.isCurrent
                        ? 'bg-fuchsia-500 hover:bg-fuchsia-600'
                        : item.sales > 0
                          ? 'bg-fuchsia-300 hover:bg-fuchsia-400'
                          : 'bg-slate-100 hover:bg-slate-200'
                    }`}
                    style={{ height: item.sales > 0 ? `${Math.max(heightPercent, 5)}%` : '4px' }}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex justify-around gap-2 mt-2 pt-2 border-t border-slate-200">
            {chartData.map((item, idx) => (
              <div key={idx} className="flex-1 text-center">
                <p className={`text-[9px] font-bold ${item.isCurrent ? 'text-fuchsia-600' : 'text-slate-500'}`}>{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};