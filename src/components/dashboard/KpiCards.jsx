// src/components/dashboard/KpiCards.jsx
// ♻️ REFACTOR: Extraído de DashboardView.jsx — renderTopWidget()

import React from 'react';
import {
  TrendingUp,
  TrendingDown,
  Edit2,
  DollarSign,
  Package,
  Info,
  Percent,
} from 'lucide-react';
// ♻️ FIX: Importamos formatNumber y FancyPrice
import { formatNumber } from '../../utils/helpers';
import { hasPermission } from '../../utils/userPermissions';
import { FancyPrice } from '../FancyPrice';
import { HintIcon } from '../HintIcon';

export const KpiCard = ({ widgetKey, kpiStats, averageTicket, openingBalance, currentUser, setTempOpeningBalance, setIsOpeningBalanceModalOpen, globalFilter, expenses = [], onOpenExpenseModal }) => {
  const canManageExpenses = hasPermission(currentUser, 'extras.expenses.manage');
  const canManageRegister = hasPermission(currentUser, 'register.manage');
  const canViewProfit = hasPermission(currentUser, 'metrics.viewProfit');
  const isNetNegative = Number(kpiStats.net || 0) < 0;
  const getPeriodText = (prefix) => {
    if (globalFilter === 'day') return `${prefix} del Dia`;
    if (globalFilter === 'week') return `${prefix} Semanal`;
    if (globalFilter === 'year') return `${prefix} Anual`;
    return `${prefix} Mensual`;
  };

  // Cálculo local del total de gastos para la tarjeta
  const totalExpenses = expenses.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);

  switch (widgetKey) {
    case 'sales':
      return (
        <div className="bg-white p-3 rounded-lg shadow-sm border border-blue-100 relative overflow-hidden flex flex-col justify-between h-24">
          <div className="flex justify-between items-start z-10">
            <span className="text-[11px] font-black text-blue-400 uppercase tracking-wide">{getPeriodText('Ventas')}</span>
            <Package size={14} className="text-blue-500" />
          </div>
          {/* Este es cantidad de ventas (número entero), usamos formatNumber */}
          <span className="text-xl font-black text-blue-600 z-10">{formatNumber(kpiStats.count)}</span>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-blue-400"></div>
        </div>
      );
    case 'revenue':
      return (
        <div className="bg-white p-3 rounded-lg shadow-sm border border-fuchsia-100 relative overflow-hidden flex flex-col justify-between h-24">
          <div className="flex justify-between items-start z-10">
            <span className="text-[11px] font-black text-fuchsia-400 uppercase tracking-wide">{getPeriodText('Ingreso')}</span>
            <div className="flex items-center gap-1.5">
              <HintIcon
                hint="Ingreso bruto vendido en el periodo seleccionado."
                size={13}
                side="left"
              />
              <TrendingUp size={14} className="text-fuchsia-500" />
            </div>
          </div>
          {/* ♻️ FIX: FancyPrice */}
          <span className="text-xl font-black text-fuchsia-600 z-10">
            <FancyPrice amount={kpiStats.gross} />
          </span>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-fuchsia-400 to-fuchsia-600"></div>
        </div>
      );
    case 'net':
      return (
        <div className={`bg-white p-3 rounded-lg shadow-sm border relative overflow-hidden flex flex-col justify-between h-24 ${!canViewProfit ? 'border-slate-200' : isNetNegative ? 'border-rose-200' : 'border-emerald-100'}`}>
          <div className="flex justify-between items-start z-10">
            <span className={`text-[11px] font-black uppercase tracking-wide ${!canViewProfit ? 'text-slate-400' : isNetNegative ? 'text-rose-600' : 'text-emerald-500'}`}>Resultado Caja</span>
            <div className="flex items-center gap-1.5">
              <HintIcon
                hint={!canViewProfit
                  ? 'Tu usuario no tiene permiso para ver resultado y ganancias.'
                  : 'Resultado del periodo: ingreso cobrado menos gastos registrados. El costo vendido se usa para margen de productos, no para caja.'}
                size={13}
                side="left"
              />
              <DollarSign size={14} className={!canViewProfit ? 'text-slate-400' : isNetNegative ? 'text-rose-500' : 'text-emerald-500'} />
            </div>
          </div>
          {/* ♻️ FIX: FancyPrice */}
          <span className={`font-black z-10 ${!canViewProfit ? 'text-slate-400 text-[11px] uppercase tracking-[0.08em]' : isNetNegative ? 'text-rose-600 text-xl' : 'text-emerald-600 text-xl'}`}>
            {!canViewProfit ? 'No disponible' : <FancyPrice amount={kpiStats.net} />}
          </span>
          <div className={`absolute bottom-0 left-0 w-full h-1 ${!canViewProfit ? 'bg-slate-300' : isNetNegative ? 'bg-rose-400' : 'bg-emerald-400'}`}></div>
        </div>
      );
    case 'opening':
      return (
        <div className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 relative overflow-hidden flex flex-col justify-between h-24">
          <div className="flex justify-between items-start mb-1 z-10">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-wide">Caja Inicial</span>
            {canManageRegister && (
              <button
                onClick={() => {
                  setTempOpeningBalance(String(openingBalance));
                  setIsOpeningBalanceModalOpen(true);
                }}
                className="text-slate-400 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 p-1 rounded transition"
              >
                <Edit2 size={12} />
              </button>
            )}
          </div>
          {/* ♻️ FIX: FancyPrice */}
          <span className="text-xl font-black text-slate-800 z-10">
            <FancyPrice amount={openingBalance} />
          </span>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-slate-300"></div>
        </div>
      );
    case 'average':
      return (
        <div className="bg-white p-3 rounded-lg shadow-sm border border-indigo-100 relative overflow-hidden flex flex-col justify-between h-24">
          <div className="flex justify-between items-start z-10">
            <span className="text-[11px] font-black text-indigo-400 uppercase tracking-wide">Ticket Promedio</span>
            <Percent size={14} className="text-indigo-500" />
          </div>
          {/* ♻️ FIX: FancyPrice */}
          <span className="text-xl font-black text-indigo-600 z-10">
            <FancyPrice amount={Math.round(averageTicket)} />
          </span>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-indigo-400"></div>
        </div>
      );
    case 'expenses':
      return (
        <div className="bg-white p-3 rounded-lg shadow-sm border border-red-100 relative overflow-hidden flex flex-col justify-between h-24">
          <div className="flex justify-between items-start z-10">
            <span className="text-[11px] font-black text-red-400 uppercase tracking-wide">{getPeriodText('Gastos')}</span>
            {onOpenExpenseModal && canManageExpenses && (
              <button
                onClick={onOpenExpenseModal}
                className="text-red-400 hover:text-red-600 bg-red-50 hover:bg-red-100 p-1 rounded transition"
                title="Registrar Gasto"
              >
                <TrendingDown size={12} />
              </button>
            )}
          </div>
          {/* ♻️ FIX: FancyPrice */}
          <span className="text-xl font-black text-red-600 z-10">
            <FancyPrice amount={totalExpenses} />
          </span>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-red-400 to-red-600"></div>
        </div>
      );
    case 'placeholder':
      return (
        <div className="bg-white p-3 rounded-lg shadow-sm border border-dashed border-slate-300 relative overflow-hidden flex flex-col justify-center items-center text-slate-300 h-24">
          <Info size={24} className="mb-2 opacity-50" />
          <span className="text-xs text-center font-medium">Espacio Disponible</span>
        </div>
      );
    default:
      return null;
  }
};
