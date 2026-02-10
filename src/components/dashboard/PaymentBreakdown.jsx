// src/components/dashboard/PaymentBreakdown.jsx
// ♻️ REFACTOR: Extraído de DashboardView.jsx — renderWidget('payments')

import React from 'react';
import { DollarSign } from 'lucide-react';

export const PaymentBreakdown = ({ paymentStats, totalGross, globalFilter }) => {
  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border h-full">
      <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
        <DollarSign size={18} className="text-green-500" />
        Pagos ({globalFilter === 'day' ? 'Hoy' : globalFilter === 'week' ? 'Semana' : 'Mes'})
      </h3>
      <div className="space-y-3">
        {paymentStats.map((m) => {
          const percent = totalGross > 0 ? (m.total / totalGross) * 100 : 0;

          return (
            <div key={m.id}>
              <div className="flex justify-between text-xs mb-1">
                <span className="font-bold text-slate-600 flex items-center gap-2">
                  {m.label}
                  {m.total > 0 && <span className="text-[9px] text-slate-400">({Math.round(percent)}%)</span>}
                </span>
                <span className={`font-bold ${m.total > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                  ${m.total.toLocaleString()}
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-700 ${m.total > 0 ? 'bg-green-500' : 'bg-transparent'}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {totalGross === 0 && (
        <p className="text-center text-xs text-slate-400 mt-6 italic">No hay pagos registrados en este período</p>
      )}
    </div>
  );
};
