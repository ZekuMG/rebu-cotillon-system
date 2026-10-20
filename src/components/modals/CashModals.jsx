// src/components/modals/CashModals.jsx
// ♻️ REFACTOR: Modales de gestión de caja con diseño premium para montos altos

import React from 'react';
import {
  DollarSign,
  Clock,
  AlertTriangle,
  Lock,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import AsyncActionButton from '../AsyncActionButton';
import usePendingAction from '../../hooks/usePendingAction';
// ✨ NUEVO: Importamos el componente global
import { FancyPrice } from '../FancyPrice';

export const OpeningBalanceModal = ({ isOpen, onClose, tempOpeningBalance, setTempOpeningBalance, tempClosingTime, setTempClosingTime, onSave }) => {
  const { isPending, runAction } = usePendingAction();
  const currentOpeningBalance = Number(tempOpeningBalance || 0);
  const updateOpeningBalance = (delta) => {
    const nextAmount = Math.max(0, currentOpeningBalance + delta);
    setTempOpeningBalance(String(nextAmount));
  };
  const handleOpeningBalanceChange = (event) => {
    const sanitizedValue = String(event.target.value || '').replace(/[^\d]/g, '');
    setTempOpeningBalance(sanitizedValue);
  };

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
            <div className="relative rounded-xl border-2 border-slate-200 bg-slate-50 shadow-inner transition focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600" size={20} />
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                className="no-number-spinner w-full rounded-xl bg-transparent py-3 pl-10 pr-16 text-xl font-black tabular-nums text-slate-900 outline-none"
                value={tempOpeningBalance}
                onChange={handleOpeningBalanceChange}
                autoFocus
              />
              <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-emerald-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => updateOpeningBalance(1000)}
                  className="flex h-6 w-10 items-center justify-center text-emerald-700 transition hover:bg-emerald-50 active:bg-emerald-100"
                  title="Sumar $1000"
                >
                  <ChevronUp size={16} strokeWidth={3} />
                </button>
                <button
                  type="button"
                  onClick={() => updateOpeningBalance(-1000)}
                  disabled={currentOpeningBalance <= 0}
                  className="flex h-6 w-10 items-center justify-center border-t border-emerald-100 text-emerald-700 transition hover:bg-emerald-50 active:bg-emerald-100 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-white"
                  title="Restar $1000"
                >
                  <ChevronDown size={16} strokeWidth={3} />
                </button>
              </div>
            </div>
            <p className="mt-1 text-[10px] font-bold text-slate-400">Los controles ajustan de $1000 en $1000.</p>
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
            <AsyncActionButton onAction={() => runAction('cash-opening-save', onSave)} pending={isPending('cash-opening-save')} disabled={!tempOpeningBalance || !tempClosingTime || isPending('cash-opening-save')} loadingLabel="Abriendo..." className="flex-1 bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed">Abrir Caja</AsyncActionButton>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ClosingTimeModal = ({ isOpen, onClose: _onClose, closingTime, setClosingTime, onSave }) => {
  const { isPending, runAction } = usePendingAction();
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs p-5 text-center">
        <h3 className="font-bold text-slate-800 mb-4">Configurar Hora de Cierre</h3>
        <input type="time" className="w-full text-center text-2xl font-bold p-2 border rounded mb-4" value={closingTime} onChange={(e) => setClosingTime(e.target.value)} />
        <AsyncActionButton onAction={() => runAction('cash-closing-time-save', onSave)} pending={isPending('cash-closing-time-save')} loadingLabel="Guardando..." className="w-full bg-slate-800 text-white py-2 rounded-lg font-bold disabled:opacity-60 disabled:cursor-wait">Guardar</AsyncActionButton>
      </div>
    </div>
  );
};


export const CloseCashModal = ({ isOpen, onClose, salesCount, totalSales, totalExpenses = 0, cashExpenses = 0, cashSales = 0, paymentMethodsSummary = {}, openingBalance, onConfirm }) => {
  const { isPending, runAction } = usePendingAction();
  if (!isOpen) return null;

  const initialCash = Number(openingBalance) || 0;
  const cashIncome = Number(cashSales) || 0;
  const cashOutgoings = Number(cashExpenses) || 0;
  const invoiced = Number(totalSales) || 0;
  const expensesTotal = Number(totalExpenses) || 0;
  const finalCashBalance = initialCash + cashIncome - cashOutgoings;
  const operatingResult = invoiced - expensesTotal;
  const paymentRows = Object.entries(paymentMethodsSummary || {})
    .map(([method, amount]) => ({ method, amount: Number(amount) || 0 }))
    .filter(({ amount }) => amount !== 0)
    .sort((a, b) => (a.method === 'Efectivo' ? -1 : b.method === 'Efectivo' ? 1 : b.amount - a.amount));
  if (paymentRows.length === 0 && invoiced !== 0) {
    if (cashIncome !== 0) paymentRows.push({ method: 'Efectivo', amount: cashIncome });
    if (invoiced !== cashIncome) paymentRows.push({ method: 'Otros medios', amount: invoiced - cashIncome });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 backdrop-blur-sm sm:p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="cash-close-title" className="flex max-h-[calc(100dvh-1rem)] w-full max-w-[480px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <div className="flex shrink-0 items-center gap-2.5 bg-slate-800 px-4 py-3 text-white">
          <div className="rounded-md bg-white/10 p-1.5">
            <Lock size={18} aria-hidden="true" />
          </div>
          <div>
            <h3 id="cash-close-title" className="text-base font-bold leading-tight">Cerrar caja</h3>
            <p className="text-xs text-slate-300">Resumen del ciclo · {salesCount} operaciones</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
          <section className="grid grid-cols-2 gap-2" aria-label="Totales del ciclo">
            <div className="min-w-0 rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-fuchsia-700">Total facturado</p>
              <p className="truncate text-xl font-black tabular-nums text-fuchsia-800 sm:text-2xl"><FancyPrice amount={invoiced} /></p>
            </div>
            <div className="min-w-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">Ingresos − gastos</p>
              <p className="truncate text-xl font-black tabular-nums text-emerald-800 sm:text-2xl"><FancyPrice amount={operatingResult} /></p>
            </div>
          </section>

          <section className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2" aria-label="Arqueo de efectivo">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-1">
              <h4 className="text-xs font-bold text-slate-800">Efectivo a contar</h4>
              <span className="text-xl font-black tabular-nums text-emerald-700"><FancyPrice amount={finalCashBalance} /></span>
            </div>
            <div className="flex justify-between gap-3 text-xs text-slate-600"><span>Caja inicial</span><span className="tabular-nums"><FancyPrice amount={initialCash} /></span></div>
            <div className="flex justify-between gap-3 text-xs text-slate-600"><span>+ Ventas en efectivo</span><span className="tabular-nums"><FancyPrice amount={cashIncome} /></span></div>
            <div className="flex justify-between gap-3 text-xs text-slate-600"><span>− Gastos en efectivo</span><span className="tabular-nums"><FancyPrice amount={cashOutgoings} /></span></div>
          </section>

          <section className="rounded-lg border border-slate-200 px-3 py-2" aria-label="Cobros y gastos">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1">
              <h4 className="text-xs font-bold text-slate-800">Cobros por medio</h4>
              <span className="text-[11px] text-slate-500">{salesCount} ventas</span>
            </div>
            {paymentRows.length ? paymentRows.map(({ method, amount }) => (
              <div key={method} className="flex justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-slate-600">{method}</span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-800"><FancyPrice amount={amount} /></span>
              </div>
            )) : <p className="py-1 text-xs text-slate-500">Sin cobros registrados</p>}
            <div className="mt-0.5 flex justify-between gap-3 border-t border-slate-100 pt-1 text-xs">
              <span className="text-slate-600">Gastos del ciclo</span>
              <span className="font-semibold tabular-nums text-rose-700">−<FancyPrice amount={expensesTotal} /></span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Los cobros digitales no se suman al efectivo físico.</p>
          </section>

          <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            Al confirmar, la caja quedará cerrada. Contá el efectivo antes de continuar.
          </p>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 bg-white px-4 py-2.5">
          <button type="button" onClick={onClose} disabled={isPending('cash-close-confirm')} className="rounded-lg px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50">Cancelar</button>
          <AsyncActionButton onAction={() => runAction('cash-close-confirm', onConfirm)} pending={isPending('cash-close-confirm')} loadingLabel="Procesando..." className="flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:cursor-wait disabled:opacity-60"><Lock size={14} /> Procesar cierre</AsyncActionButton>
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
