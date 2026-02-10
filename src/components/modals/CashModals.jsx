// src/components/modals/CashModals.jsx
// ♻️ REFACTOR: Extraído de AppModals.jsx — Modales de gestión de caja

import React from 'react';
import {
  DollarSign,
  Clock,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { formatPrice } from '../../utils/helpers';

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
            <div className="flex justify-between text-sm"><span className="text-slate-600">Monto inicial:</span><span className="font-bold text-slate-800">${formatPrice(tempOpeningBalance)}</span></div>
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

export const CloseCashModal = ({ isOpen, onClose, salesCount, totalSales, openingBalance, onConfirm }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="p-4 bg-gradient-to-r from-slate-800 to-slate-700 text-white">
          <h3 className="font-bold text-lg flex items-center gap-2"><Lock size={20} /> Cerrar Caja</h3>
          <p className="text-slate-300 text-sm">Resumen del día</p>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-100"><p className="text-[10px] font-bold text-blue-500 uppercase">Ventas Realizadas</p><p className="text-2xl font-bold text-blue-700">{salesCount}</p></div>
            <div className="bg-fuchsia-50 p-3 rounded-lg border border-fuchsia-100"><p className="text-[10px] font-bold text-fuchsia-500 uppercase">Total Vendido</p><p className="text-2xl font-bold text-fuchsia-700">${formatPrice(totalSales)}</p></div>
          </div>
          <div className="bg-slate-50 p-4 rounded-lg border space-y-2">
            <div className="flex justify-between items-center text-sm"><span className="text-slate-500">Caja Inicial</span><span className="font-bold text-slate-700">${formatPrice(openingBalance)}</span></div>
            <div className="flex justify-between items-center text-sm"><span className="text-slate-500">+ Ventas del día</span><span className="font-bold text-fuchsia-600">+${formatPrice(totalSales)}</span></div>
            <div className="border-t pt-2 flex justify-between items-center"><span className="font-bold text-slate-700">Total en Caja</span><span className="text-xl font-bold text-green-600">${formatPrice(openingBalance + totalSales)}</span></div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700"><p className="font-bold flex items-center gap-2"><AlertTriangle size={16} /> Atención</p><p className="text-xs mt-1">Esta acción reiniciará las transacciones del día. Asegurate de haber revisado el resumen.</p></div>
        </div>
        <div className="p-4 bg-slate-50 border-t flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-200 rounded-lg transition">Cancelar</button>
          <button onClick={onConfirm} className="px-6 py-2 text-sm font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg transition flex items-center gap-2"><Lock size={14} /> Confirmar Cierre</button>
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
