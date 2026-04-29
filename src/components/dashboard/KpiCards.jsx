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
import { hasOwnerAccess } from '../../utils/appUsers';
import { hasPermission } from '../../utils/userPermissions';
import { FancyPrice } from '../FancyPrice';
import { HintIcon } from '../HintIcon';

export const KpiCard = ({ widgetKey, kpiStats, averageTicket, openingBalance, currentUser, setTempOpeningBalance, setIsOpeningBalanceModalOpen, globalFilter, expenses = [], onOpenExpenseModal }) => {
  const canManageExpenses = hasPermission(currentUser, 'extras.expenses.manage');
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
        <div className="bg-white p-4 rounded-xl shadow-sm border border-blue-100 relative overflow-hidden flex flex-col justify-between h-32">
          <div className="flex justify-between items-start z-10">
            <span className="text-[15px] font-bold text-blue-400 uppercase">{getPeriodText('Ventas')}</span>
            <Package size={14} className="text-blue-500" />
          </div>
          {/* Este es cantidad de ventas (número entero), usamos formatNumber */}
          <span className="text-2xl font-bold text-blue-600 z-10">{formatNumber(kpiStats.count)}</span>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-blue-400"></div>
        </div>
      );
    case 'revenue':
      return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-fuchsia-100 relative overflow-hidden flex flex-col justify-between h-32">
          <div className="flex justify-between items-start z-10">
            <span className="text-[15px] font-bold text-fuchsia-400 uppercase">{getPeriodText('Ingreso')}</span>
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
          <span className="text-2xl font-bold text-fuchsia-600 z-10">
            <FancyPrice amount={kpiStats.gross} />
          </span>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-fuchsia-400 to-fuchsia-600"></div>
        </div>
      );
    case 'net':
      return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-emerald-100 relative overflow-hidden flex flex-col justify-between h-32">
          <div className="flex justify-between items-start z-10">
            <span className="text-[15px] font-bold text-emerald-500 uppercase">Ganancia Neta</span>
            <div className="flex items-center gap-1.5">
              <HintIcon
                hint="Ganancia neta del periodo: ingreso bruto menos costos de productos vendidos y gastos registrados."
                size={13}
                side="left"
              />
              <DollarSign size={14} className="text-emerald-500" />
            </div>
          </div>
          {/* ♻️ FIX: FancyPrice */}
          <span className="text-2xl font-bold text-emerald-600 z-10">
            <FancyPrice amount={kpiStats.net} />
          </span>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-emerald-400"></div>
        </div>
      );
    case 'opening':
      return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 relative overflow-hidden flex flex-col justify-between h-32">
          <div className="flex justify-between items-start mb-1 z-10">
            <span className="text-[15px] font-bold text-slate-400 uppercase">Caja Inicial</span>
            {hasOwnerAccess(currentUser) && (
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
          <span className="text-2xl font-bold text-slate-800 z-10">
            <FancyPrice amount={openingBalance} />
          </span>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-slate-300"></div>
        </div>
      );
    case 'average':
      return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-100 relative overflow-hidden flex flex-col justify-between h-32">
          <div className="flex justify-between items-start z-10">
            <span className="text-[15px] font-bold text-indigo-400 uppercase">Ticket Promedio</span>
            <Percent size={14} className="text-indigo-500" />
          </div>
          {/* ♻️ FIX: FancyPrice */}
          <span className="text-2xl font-bold text-indigo-600 z-10">
            <FancyPrice amount={Math.round(averageTicket)} />
          </span>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-indigo-400"></div>
        </div>
      );
    case 'expenses':
      return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-red-100 relative overflow-hidden flex flex-col justify-between h-32">
          <div className="flex justify-between items-start z-10">
            <span className="text-[15px] font-bold text-red-400 uppercase">{getPeriodText('Gastos')}</span>
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
          <span className="text-2xl font-bold text-red-600 z-10">
            <FancyPrice amount={totalExpenses} />
          </span>
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-red-400 to-red-600"></div>
        </div>
      );
    case 'placeholder':
      return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-dashed border-slate-300 relative overflow-hidden flex flex-col justify-center items-center text-slate-300 h-32">
          <Info size={24} className="mb-2 opacity-50" />
          <span className="text-xs text-center font-medium">Espacio Disponible</span>
        </div>
      );
    default:
      return null;
  }
};
