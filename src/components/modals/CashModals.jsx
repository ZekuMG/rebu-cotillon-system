// src/components/modals/CashModals.jsx
// ♻️ REFACTOR: Modales de gestión de caja con diseño premium para montos altos

import React from 'react';
import {
  DollarSign,
  Clock,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { formatCurrency } from '../../utils/helpers';
// ✨ NUEVO: Importamos el componente global
import { FancyPrice } from '../FancyPrice';

export const OpeningBalanceModal = ({ isOpen, onClose, tempOpeningBalance, setTempOpeningBalance, tempClosingTime, setTempClosingTime, onSave }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="p-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white">
          <h3 className="font-bold text-lg">Apertura de Caja</h3>
          <p className="text-green-100 text-xs">Configure los datos para iniciar la jornada</p>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Monto Inicial en Caja</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input type="number" placeholder="0" className="w-full pl-10 pr-4 py-3 text-xl font-bold border-2 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none" value={tempOpeningBalance} onChange={(e) => setTempOpeningBalance(e.target.value)} autoFocus />
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Horario de Cierre Programado</label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input type="time" className="w-full pl-10 pr-4 py-3 text-xl font-bold border-2 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none" value={tempClosingTime} onChange={(e) => setTempClosingTime(e.target.value)} />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">La caja se deberá cerrar a esta hora</p>
          </div>
          <div className="bg-slate-50 p-3 rounded-lg border">
            <p className="text-xs text-slate-500 mb-2">Resumen de apertura:</p>
            <div className="flex justify-between text-sm"><span className="text-slate-600">Monto inicial:</span><span className="font-bold text-slate-800"><FancyPrice amount={Number(tempOpeningBalance) || 0} /></span></div>
            <div className="flex justify-between text-sm mt-1"><span className="text-slate-600">Cierre programado:</span><span className="font-bold text-slate-800">{tempClosingTime || '--:--'}</span></div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-lg font-bold border-2 border-slate-200 text-slate-600 hover:bg-slate-50">Cancelar</button>
            <button onClick={onSave} disabled={!tempOpeningBalance || !tempClosingTime} className="flex-1 bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed">Abrir Caja</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ClosingTimeModal = ({ isOpen, onClose, closingTime, setClosingTime, onSave }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs p-5 text-center">
        <h3 className="font-bold text-slate-800 mb-4">Configurar Hora de Cierre</h3>
        <input type="time" className="w-full text-center text-2xl font-bold p-2 border rounded mb-4" value={closingTime} onChange={(e) => setClosingTime(e.target.value)} />
        <button onClick={onSave} className="w-full bg-slate-800 text-white py-2 rounded-lg font-bold">Guardar</button>
      </div>
    </div>
  );
};


export const CloseCashModal = ({ isOpen, onClose, salesCount, totalSales, totalExpenses = 0, cashExpenses = 0, cashSales = 0, openingBalance, onConfirm }) => {
  if (!isOpen) return null;
  
  const finalCashBalance = openingBalance + cashSales - cashExpenses;
  
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-5 bg-gradient-to-r from-slate-800 to-slate-700 text-white flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-lg">
            <Lock size={22} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-lg leading-tight">Cerrar Caja</h3>
            <p className="text-slate-300 text-xs">Resumen del ciclo actual</p>
          </div>
        </div>
        
        <div className="p-6 space-y-5">
          
          <div className="space-y-3">
            
            {/* Facturado: Fila completa */}
            <div className="bg-fuchsia-50 p-5 rounded-xl border border-fuchsia-100 flex flex-col items-center text-center shadow-inner">
              <p className="text-[11px] font-bold text-fuchsia-500 uppercase tracking-widest mb-1">Total Facturado</p>
              <p className="text-4xl font-black text-fuchsia-700 tracking-tight">
                <FancyPrice amount={totalSales} />
              </p>
            </div>
            
            {/* Ventas y Gastos: 2 Columnas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-center shadow-sm">
                <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider mb-1">Operaciones</p>
                <p className="text-3xl font-bold text-blue-700">{salesCount}</p>
              </div>
              <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-center shadow-sm min-w-0">
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider mb-1">Total Gastos</p>
                <p className="text-2xl font-bold text-red-600 truncate w-full">
                  <FancyPrice amount={totalExpenses} />
                </p>
              </div>
            </div>
            
          </div>

          {/* Desglose de caja física */}
          <div className="bg-slate-50 p-5 rounded-xl border border-slate-200 space-y-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-medium">Caja Inicial</span>
              <span className="font-bold text-slate-700 text-base"><FancyPrice amount={openingBalance} /></span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-medium">+ Ventas en efectivo</span>
              <span className="font-bold text-emerald-600 text-base">+<FancyPrice amount={cashSales} /></span>
            </div>
            {cashExpenses > 0 && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-slate-500 font-medium">− Gastos en efectivo</span>
                <span className="font-bold text-red-500 text-base">-<FancyPrice amount={cashExpenses} /></span>
              </div>
            )}
            <div className="border-t border-slate-200 pt-3 mt-1 flex justify-between items-center">
              <span className="font-bold text-slate-800 text-lg">Efectivo en Caja</span>
              <span className="text-2xl font-black text-green-600"><FancyPrice amount={finalCashBalance} /></span>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 flex gap-3 items-start shadow-sm">
            <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold mb-0.5">Atención</p>
              <p className="text-xs leading-relaxed opacity-90">Esta acción vaciará la caja y preparará el sistema para el próximo turno. Asegurate de haber contado el efectivo.</p>
            </div>
          </div>
        </div>
        
        <div className="p-5 bg-slate-50 border-t border-slate-200 flex gap-3 justify-end">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-200 hover:text-slate-700 rounded-xl transition-colors">Cancelar</button>
          <button onClick={onConfirm} className="px-6 py-2.5 text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl transition-all shadow-md hover:shadow-lg flex items-center gap-2 transform active:scale-[0.98]"><Lock size={16} /> Procesar Cierre</button>
        </div>
      </div>
    </div>
  );
};

export const AutoCloseAlertModal = ({ isOpen, onClose, closingTime }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="p-6 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4"><Clock size={32} className="text-amber-600" /></div>
          <h3 className="text-xl font-bold text-slate-800 mb-2">Cierre Automático</h3>
          <p className="text-slate-500 text-sm mb-6">Se ha cumplido el horario de cierre programado ({closingTime} hs).<br />La caja se ha cerrado y el resumen se guardó en el historial.</p>
          <button onClick={onClose} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-colors">Entendido</button>
        </div>
      </div>
    </div>
  );
};