import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  DollarSign,
  Tag,
  CreditCard,
  FileText,
  Save,
  TrendingDown,
  Eye,
} from 'lucide-react';
import AsyncActionButton from '../AsyncActionButton';
import usePendingAction from '../../hooks/usePendingAction';
import { PAYMENT_METHODS } from '../../data';

const EXPENSE_CATEGORIES = [
  'Proveedores',
  'Servicios/Operativos',
  'Retiros de Socios',
  'Otros',
];

const getExpenseNote = (expense = {}) =>
  expense.note || expense.description || '';

export const ExpenseModal = ({
  isOpen,
  onClose,
  onSave,
  initialExpense = null,
  mode = 'create',
  readOnly = false,
}) => {
  const { isPending, runAction } = usePendingAction();
  const isEditMode = mode === 'edit' && initialExpense;
  const actionKey = isEditMode ? 'expense-modal-edit' : 'expense-modal-save';
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [paymentMethod, setPaymentMethod] = useState('Efectivo');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    if (isEditMode) {
      setAmount(String(Number(initialExpense.amount || 0) || ''));
      setCategory(initialExpense.category || EXPENSE_CATEGORIES[0]);
      setPaymentMethod(initialExpense.paymentMethod || initialExpense.payment_method || 'Efectivo');
      setNote(getExpenseNote(initialExpense));
      return;
    }

    setAmount('');
    setCategory(EXPENSE_CATEGORIES[0]);
    setPaymentMethod('Efectivo');
    setNote('');
  }, [initialExpense, isEditMode, isOpen]);

  const modalCopy = useMemo(() => {
    if (readOnly) {
      return {
        title: 'Detalle de Gasto',
        eyebrow: 'Solo lectura',
        button: '',
        Icon: Eye,
      };
    }

    if (isEditMode) {
      return {
        title: 'Editar Gasto',
        eyebrow: 'Ajuste de salida',
        button: 'Guardar cambios',
        Icon: TrendingDown,
      };
    }

    return {
      title: 'Registrar Gasto',
      eyebrow: 'Salida de dinero',
      button: 'Confirmar Gasto',
      Icon: TrendingDown,
    };
  }, [isEditMode, readOnly]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (readOnly) return;

    const value = parseFloat(amount);
    if (!value || value <= 0) return;

    const savedExpense = await onSave({
      id: initialExpense?.id || null,
      amount: value,
      category,
      paymentMethod,
      note,
      description: note,
    });

    if (!savedExpense) return;
    onClose();
  };

  const FormIcon = modalCopy.Icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex justify-between items-center">
          <div className="flex items-center gap-2 text-red-700">
            <div className="bg-red-100 p-2 rounded-lg">
              <FormIcon size={20} />
            </div>
            <div>
              <h3 className="font-bold text-lg leading-tight">{modalCopy.title}</h3>
              <p className="text-[10px] uppercase font-bold opacity-70">{modalCopy.eyebrow}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={(e) => void runAction(actionKey, () => handleSubmit(e))} className="p-6 space-y-5 overflow-y-auto">
          {readOnly && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700">
              No tenes permiso para editar gastos.
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Monto del Gasto *</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="number"
                step="0.01"
                autoFocus={!readOnly}
                required
                disabled={readOnly}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xl font-bold text-slate-800 focus:ring-2 focus:ring-red-500 focus:bg-white outline-none transition-all placeholder:text-slate-300 disabled:cursor-not-allowed disabled:text-slate-500"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Categoria *</label>
            <div className="relative">
              <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <select
                disabled={readOnly}
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl font-medium text-slate-700 focus:ring-2 focus:ring-red-500 outline-none appearance-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Origen del Dinero *</label>
            <div className="relative">
              <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <select
                disabled={readOnly}
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl font-medium text-slate-700 focus:ring-2 focus:ring-red-500 outline-none appearance-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.label} {method.id === 'Efectivo' ? '(Resta de Caja)' : '(Banco/Digital)'}
                  </option>
                ))}
              </select>
            </div>
            {paymentMethod === 'Efectivo' ? (
              <p className="text-[10px] text-orange-500 mt-1 ml-1 font-bold flex items-center gap-1">
                Afecta al cierre de caja fisico.
              </p>
            ) : (
              <p className="text-[10px] text-blue-500 mt-1 ml-1 font-bold flex items-center gap-1">
                No afecta la caja fisica, solo la ganancia neta.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5 ml-1">Detalle / Nota</label>
            <div className="relative">
              <FileText className="absolute left-3 top-3 text-slate-400" size={18} />
              <textarea
                rows="3"
                disabled={readOnly}
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500 outline-none resize-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
                placeholder="Ej: Pago factura luz Edesur..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          {!readOnly && (
            <AsyncActionButton
              type="submit"
              pending={isPending(actionKey)}
              disabled={isPending(actionKey)}
              className="w-full py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold shadow-lg shadow-red-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <Save size={20} />
              {modalCopy.button}
            </AsyncActionButton>
          )}
        </form>
      </div>
    </div>
  );
};
