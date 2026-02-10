import React, { useState } from 'react';
import {
  X,
  DollarSign,
  Tag,
  CreditCard,
  FileText,
  Save,
  TrendingDown
} from 'lucide-react';
import { PAYMENT_METHODS } from '../../data';

// Categorías de gastos definidas según tus requisitos
const EXPENSE_CATEGORIES = [
  'Proveedores',
  'Servicios/Operativos',
  'Retiros de Socios',
  'Otros'
];

export const ExpenseModal = ({ isOpen, onClose, onSave }) => {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [paymentMethod, setPaymentMethod] = useState('Efectivo');
  const [note, setNote] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!value || value <= 0) return;

    onSave({
      amount: value,
      category,
      paymentMethod,
      note
    });

    // Resetear formulario y cerrar
    setAmount('');
    setCategory(EXPENSE_CATEGORIES[0]);
    setPaymentMethod('Efectivo');
    setNote('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* HEADER */}
        <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex justify-between items-center">
          <div className="flex items-center gap-2 text-red-700">
            <div className="bg-red-100 p-2 rounded-lg">
              <TrendingDown size={20} />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">Registrar Gasto</h3>
              <p className="text-[10px] uppercase font-bold opacity-70">Salida de dinero</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* BODY */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto">
          
          {/* Monto */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Monto del Gasto *</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="number"
                step="0.01"
                autoFocus
                required
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xl font-bold text-slate-800 focus:ring-2 focus:ring-red-500 focus:bg-white outline-none transition-all placeholder:text-slate-300"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          {/* Categoría */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Categoría *</label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <select
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl font-medium text-slate-700 focus:ring-2 focus:ring-red-500 outline-none appearance-none"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {EXPENSE_CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Método de Pago (Multicaja) */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Origen del Dinero *</label>
            <div className="relative">
              <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <select
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl font-medium text-slate-700 focus:ring-2 focus:ring-red-500 outline-none appearance-none"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                {PAYMENT_METHODS.map(method => (
                  <option key={method.id} value={method.id}>
                    {method.label} {method.id === 'Efectivo' ? '(Resta de Caja)' : '(Banco/Digital)'}
                  </option>
                ))}
              </select>
            </div>
            {paymentMethod === 'Efectivo' ? (
                <p className="text-[10px] text-orange-500 mt-1 ml-1 font-bold flex items-center gap-1">
                    • Afectará al cierre de caja físico.
                </p>
            ) : (
                <p className="text-[10px] text-blue-500 mt-1 ml-1 font-bold flex items-center gap-1">
                    • No afecta la caja física, solo la ganancia neta.
                </p>
            )}
          </div>

          {/* Notas */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Detalle / Nota</label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 text-slate-400" size={18} />
              <textarea
                rows="3"
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500 outline-none resize-none"
                placeholder="Ej: Pago factura luz Edesur..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              ></textarea>
            </div>
          </div>

          {/* Botón Guardar */}
          <button
            type="submit"
            className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-lg shadow-red-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            <Save size={20} />
            Confirmar Gasto
          </button>

        </form>
      </div>
    </div>
  );
};