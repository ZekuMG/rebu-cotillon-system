// src/components/modals/TransactionModals.jsx
// ♻️ REFACTOR: Extraído de AppModals.jsx — Modales de edición/anulación de transacciones

import React from 'react';
import {
  X,
  Search,
  Trash2,
  AlertCircle,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import { PAYMENT_METHODS } from '../../data';
import { formatPrice } from '../../utils/helpers';

export const EditTransactionModal = ({ transaction, onClose, inventory, setEditingTransaction, transactionSearch, setTransactionSearch, addTxItem, removeTxItem, setTxItemQty, handlePaymentChange, editReason, setEditReason, onSave }) => {
  if (!transaction) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center mb-4 pb-2 border-b">
          <div><h3 className="font-bold text-slate-800">Modificar Pedido #{transaction.id}</h3><p className="text-[10px] text-slate-400">Cambiar cantidades recalcula stock y total</p></div>
          <button onClick={onClose}><X size={18} className="text-slate-400" /></button>
        </div>
        <div className="flex-1 overflow-y-auto mb-4">
          <div className="mb-3 relative">
            <div className="flex items-center border rounded-lg px-2 bg-slate-50"><Search size={14} className="text-slate-400" /><input type="text" placeholder="Buscar producto para agregar..." className="w-full p-2 bg-transparent text-xs outline-none" value={transactionSearch} onChange={(e) => setTransactionSearch(e.target.value)} /></div>
            {transactionSearch && (
              <div className="absolute top-full left-0 right-0 bg-white border shadow-lg rounded-b-lg max-h-40 overflow-y-auto z-10">
                {inventory.filter((p) => p.title.toLowerCase().includes(transactionSearch.toLowerCase())).map((p) => (
                  <button key={p.id} onClick={() => addTxItem(p)} className="w-full text-left p-2 hover:bg-fuchsia-50 text-xs flex justify-between items-center border-b"><span>{p.title}</span><span className="font-bold">${formatPrice(p.price)}</span></button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            {transaction.items.map((item, itemIndex) => (
              <div key={`item-${itemIndex}-${item.title}`} className="flex justify-between items-center bg-slate-50 p-2 rounded border">
                <div className="flex-1"><p className="text-xs font-bold text-slate-700">{item.title}</p><p className="text-[10px] text-slate-500">${formatPrice(item.price)}</p></div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-white border rounded"><input type="number" min="1" className="w-12 p-1 text-xs border rounded text-center font-bold bg-white focus:ring-2 focus:ring-fuchsia-500 outline-none" value={item.qty} onChange={(e) => setTxItemQty(itemIndex, e.target.value)} /></div>
                  <button onClick={() => removeTxItem(itemIndex)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <form onSubmit={onSave} className="space-y-4 border-t pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Método de Pago</label>
              <select className="w-full px-2 py-2 border rounded-lg bg-white text-xs" value={transaction.payment} onChange={(e) => handlePaymentChange(e.target.value)}>
                {PAYMENT_METHODS.map((m) => (<option key={m.id} value={m.id}>{m.label}</option>))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Total ($)</label>
              <input readOnly type="text" className="w-full px-2 py-2 border rounded-lg font-bold text-slate-700 bg-slate-100 text-xs" value={formatPrice(transaction.total)} />
            </div>
          </div>
          {transaction.payment === 'Credito' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 bg-amber-50 text-amber-700 p-2 rounded border border-amber-200 text-xs"><AlertCircle size={14} /><span className="font-bold">10% de recargo aplicado al total</span></div>
              <div className="flex items-center justify-between bg-slate-50 p-2 rounded border">
                <span className="text-xs font-bold text-slate-600">Cuotas</span>
                <select className="text-xs p-1.5 rounded border bg-white" value={transaction.installments || 1} onChange={(e) => setEditingTransaction({ ...transaction, installments: Number(e.target.value) })}>
                  <option value={1}>1 pago</option><option value={3}>3 cuotas</option><option value={6}>6 cuotas</option><option value={12}>12 cuotas</option>
                </select>
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-bold text-amber-600 uppercase block mb-1 flex items-center gap-1"><FileText size={12} /> Motivo del cambio (Opcional)</label>
            <textarea className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-amber-50 focus:ring-2 focus:ring-amber-500 outline-none" rows="2" placeholder="¿Por qué modificas el pedido?" value={editReason} onChange={(e) => setEditReason(e.target.value)}></textarea>
          </div>
          <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700">Confirmar Cambios</button>
        </form>
      </div>
    </div>
  );
};

export const RefundModal = ({ transaction, onClose, refundReason, setRefundReason, onConfirm }) => {
  if (!transaction) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="p-4 bg-red-50 border-b border-red-100 flex justify-between items-center">
          <h3 className="font-bold text-red-800 flex items-center gap-2"><AlertTriangle size={18} /> {transaction.status === 'voided' ? 'Eliminar Registro' : 'Anular Venta'}</h3>
          <button onClick={onClose}><X size={18} className="text-red-400 hover:text-red-600" /></button>
        </div>
        <form onSubmit={onConfirm} className="p-5">
          <p className="text-sm text-slate-600 mb-4">{transaction.status === 'voided' ? 'Esta acción borrará definitivamente el registro del historial. No se puede deshacer.' : `Se marcará la venta #${transaction.id} como anulada y se devolverá el stock al inventario.`}</p>
          <div className="mb-4">
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Motivo (Opcional)</label>
            <textarea className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500 outline-none resize-none" rows="3" placeholder="Ej: Cliente devolvió los productos..." value={refundReason} onChange={(e) => setRefundReason(e.target.value)} autoFocus></textarea>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100 rounded-lg">Cancelar</button>
            <button type="submit" className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg">{transaction.status === 'voided' ? 'Borrar Definitivamente' : 'Confirmar Anulación'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};
