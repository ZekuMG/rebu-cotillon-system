// src/components/modals/HistoryModals.jsx
// ♻️ REFACTOR: Extraído de HistoryView.jsx — Modal de detalle de historial

import React from 'react';
import {
  Edit2,
  XCircle,
  X,
  FileText,
} from 'lucide-react';

// ==========================================
// MODAL: DETALLE DE TRANSACCIÓN
// ==========================================

export const TransactionDetailModal = ({
  transaction,
  onClose,
  currentUser,
  onEditTransaction,
  onDeleteTransaction,
  onViewTicket,
}) => {
  if (!transaction) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
          <h4 className="font-bold text-slate-800">
            Venta #{String(transaction.id).padStart(6, '0')}
          </h4>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-slate-400 text-xs">Fecha</p>
              <p className="font-bold">
                {transaction.date} {transaction.timestamp}
              </p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Usuario</p>
              <p className="font-bold">{transaction.user}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Pago</p>
              <p className="font-bold">{transaction.payment}</p>
            </div>
            <div>
              <p className="text-slate-400 text-xs">Total</p>
              <p className="font-bold text-fuchsia-600">
                ${transaction.total?.toLocaleString()}
              </p>
            </div>
          </div>

          <div>
            <p className="text-slate-400 text-xs mb-2">Productos</p>
            <div className="space-y-2">
              {(transaction.items || []).map((item, idx) => (
                <div
                  key={idx}
                  className="flex justify-between items-center p-2 bg-slate-50 rounded"
                >
                  <div>
                    <p className="font-medium text-sm">{item.title}</p>
                    <p className="text-xs text-slate-400">
                      {item.qty || item.quantity} x $
                      {item.price?.toLocaleString()}
                    </p>
                  </div>
                  <p className="font-bold text-sm">
                    $
                    {(
                      (item.qty || item.quantity) * item.price
                    ).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Acciones Modal */}
        {currentUser.role === 'admin' && (
          <div className="p-4 border-t bg-slate-50 flex gap-2 justify-end">
            <button
              onClick={() => onViewTicket(transaction)}
              className="px-4 py-2 text-sm font-bold text-slate-700 bg-white border hover:bg-slate-50 rounded-lg transition flex items-center gap-2"
            >
              <FileText size={14} /> Ticket
            </button>

            {transaction.status !== 'voided' && !transaction.isHistoric && (
              <button
                onClick={() => {
                  onClose();
                  onEditTransaction(transaction);
                }}
                className="px-4 py-2 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition flex items-center gap-2"
              >
                <Edit2 size={14} /> Editar
              </button>
            )}
            {transaction.status !== 'voided' && !transaction.isHistoric && (
              <button
                onClick={() => {
                  onClose();
                  onDeleteTransaction(transaction);
                }}
                className="px-4 py-2 text-sm font-bold text-amber-600 bg-amber-50 hover:bg-amber-100 rounded-lg transition flex items-center gap-2"
              >
                <XCircle size={14} /> Anular
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};