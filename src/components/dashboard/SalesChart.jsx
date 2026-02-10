// src/components/dashboard/SalesChart.jsx
// ♻️ REFACTOR: Extraído de DashboardView.jsx — renderWidget('chart')

import React, { useState } from 'react';
import { BarChart3 } from 'lucide-react';

export const SalesChart = ({ chartData, maxSales, globalFilter, getEmptyStateMessage }) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border h-full">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 size={18} className="text-fuchsia-500" />
            Evolución de Ventas
          </h3>
          <span className="text-xs text-slate-400">
            {globalFilter === 'day' ? 'Por horario' : globalFilter === 'week' ? 'Últimos 7 días' : 'Por semana'}
          </span>
        </div>
      </div>

      <div className="flex">
        <div className="flex flex-col justify-between pr-2 py-1 text-right" style={{ height: '180px', minWidth: '50px' }}>
          <span className="text-[9px] text-slate-400">${maxSales.toLocaleString()}</span>
          <span className="text-[9px] text-slate-400">${Math.round(maxSales / 2).toLocaleString()}</span>
          <span className="text-[9px] text-slate-400">$0</span>
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
                    <p className="font-bold">${item.sales.toLocaleString()}</p>
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
