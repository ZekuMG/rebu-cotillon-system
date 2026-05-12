// src/components/dashboard/PaymentBreakdown.jsx
// ♻️ REFACTOR: Extraído de DashboardView.jsx — renderWidget('payments')

import React from 'react';
import { DollarSign } from 'lucide-react';
// ♻️ FIX: Importamos FancyPrice
import { FancyPrice } from '../FancyPrice';

const PAYMENT_BAR_STYLES = {
  Efectivo: { bar: '#22c55e', glow: 'rgba(34, 197, 94, 0.32)' },
  MercadoPago: { bar: '#38bdf8', glow: 'rgba(56, 189, 248, 0.34)' },
  Debito: { bar: '#818cf8', glow: 'rgba(129, 140, 248, 0.32)' },
  Credito: { bar: '#f59e0b', glow: 'rgba(245, 158, 11, 0.34)' },
};

const getPaymentBarStyle = (methodId) => (
  PAYMENT_BAR_STYLES[methodId] || { bar: '#60a5fa', glow: 'rgba(96, 165, 250, 0.3)' }
);

export const PaymentBreakdown = ({ paymentStats, totalGross, globalFilter }) => {
  return (
    <div className="bg-white px-4 py-3.5 rounded-lg shadow-sm border h-full min-h-0 flex flex-col overflow-visible">
      <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2 mb-3 shrink-0">
        <DollarSign size={16} className="text-green-500" />
        Metodos de Pago ({globalFilter === 'day' ? 'Hoy' : globalFilter === 'week' ? 'Semana' : globalFilter === 'year' ? 'Año' : 'Mes'})
      </h3>
      <div className="custom-scrollbar -mx-1 space-y-2 overflow-y-auto overflow-x-visible px-1 pr-2">
        {paymentStats.map((m) => {
          const percent = totalGross > 0 ? (m.total / totalGross) * 100 : 0;
          const color = getPaymentBarStyle(m.id);

          return (
            <div key={m.id} className="rounded-md px-1 py-0.5">
              <div className="mb-1 flex justify-between gap-3 text-[11px]">
                <span className="font-bold text-slate-600 flex min-w-0 items-center gap-1.5">
                  <span
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: color.glow }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color.bar }} />
                  </span>
                  <span className="truncate">{m.label}</span>
                  {m.total > 0 && <span className="text-[9px] text-slate-400">({Math.round(percent)}%)</span>}
                </span>
                {/* ♻️ FIX: Aplicamos FancyPrice */}
                <span className={`font-bold ${m.total > 0 ? 'text-slate-800' : 'text-slate-300'}`}>
                  <FancyPrice amount={m.total} />
                </span>
              </div>
              <div className="w-full rounded-full h-1.5 overflow-hidden" style={{ backgroundColor: 'rgba(148, 163, 184, 0.18)' }}>
                <div
                  className="h-1.5 rounded-full transition-all duration-700"
                  style={{
                    width: `${percent}%`,
                    backgroundColor: m.total > 0 ? color.bar : 'transparent',
                    boxShadow: m.total > 0 ? `0 0 14px ${color.glow}` : 'none',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {totalGross === 0 && (
        <p className="text-center text-xs text-slate-400 mt-5 italic">No hay pagos registrados en este período</p>
      )}
    </div>
  );
};
