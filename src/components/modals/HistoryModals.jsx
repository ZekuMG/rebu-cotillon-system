// src/components/modals/HistoryModals.jsx
// ♻️ REFACTOR: Extraído de HistoryView.jsx — Modales de historial (detalle, generador, eliminar)

import React from 'react';
import {
  Edit2,
  XCircle,
  X,
  Wand2,
  AlertTriangle,
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

// ==========================================
// MODAL: GENERADOR DE PEDIDOS DE PRUEBA
// ==========================================

export const GeneratorModal = ({
  isOpen,
  onClose,
  generatorConfig,
  setGeneratorConfig,
  onGenerate,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
        <div className="p-4 border-b flex justify-between items-center bg-fuchsia-500">
          <h4 className="font-bold text-white flex items-center gap-2">
            <Wand2 size={18} /> Generar Pedidos de Prueba
          </h4>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
              Cantidad
            </label>
            <input
              type="number"
              min="1"
              max="200"
              className="w-full px-3 py-2 border rounded-lg text-sm"
              value={generatorConfig.count}
              onChange={(e) =>
                setGeneratorConfig({
                  ...generatorConfig,
                  count: parseInt(e.target.value) || 1,
                })
              }
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                Desde
              </label>
              <input
                type="date"
                className="w-full px-3 py-2 border rounded-lg text-sm"
                value={generatorConfig.dateStart}
                onChange={(e) =>
                  setGeneratorConfig({
                    ...generatorConfig,
                    dateStart: e.target.value,
                  })
                }
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                Hasta
              </label>
              <input
                type="date"
                className="w-full px-3 py-2 border rounded-lg text-sm"
                value={generatorConfig.dateEnd}
                onChange={(e) =>
                  setGeneratorConfig({
                    ...generatorConfig,
                    dateEnd: e.target.value,
                  })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                Hora inicio
              </label>
              <select
                className="w-full px-3 py-2 border rounded-lg text-sm"
                value={generatorConfig.timeStart}
                onChange={(e) =>
                  setGeneratorConfig({
                    ...generatorConfig,
                    timeStart: e.target.value,
                  })
                }
              >
                {Array.from({ length: 13 }, (_, i) => i + 9).map((h) => (
                  <option key={h} value={h.toString().padStart(2, '0')}>
                    {h}:00 hs
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
                Hora fin
              </label>
              <select
                className="w-full px-3 py-2 border rounded-lg text-sm"
                value={generatorConfig.timeEnd}
                onChange={(e) =>
                  setGeneratorConfig({
                    ...generatorConfig,
                    timeEnd: e.target.value,
                  })
                }
              >
                {Array.from({ length: 13 }, (_, i) => i + 9).map((h) => (
                  <option key={h} value={h.toString().padStart(2, '0')}>
                    {h}:00 hs
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-fuchsia-50 border border-fuchsia-200 rounded-lg p-3 text-xs text-fuchsia-700">
            <p>
              ⚡ Se generarán ventas aleatorias con productos del
              inventario. Horarios de 14-16 hs serán omitidos.
            </p>
          </div>
        </div>
        <div className="p-4 border-t flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            Cancelar
          </button>
          <button
            onClick={onGenerate}
            className="px-4 py-2 text-sm bg-fuchsia-500 text-white rounded-lg font-bold hover:bg-fuchsia-600 transition"
          >
            Generar {generatorConfig.count} Pedidos
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// MODAL: ELIMINAR HISTORIAL COMPLETO
// ==========================================

export const DeleteHistoryModal = ({
  isOpen,
  onClose,
  activeCount,
  historicCount,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full">
        <div className="p-4 border-b flex justify-between items-center bg-red-500">
          <h4 className="font-bold text-white flex items-center gap-2">
            <AlertTriangle size={18} /> Eliminar Historial
          </h4>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white"
          >
            <X size={20} />
          </button>
        </div>
        <div className="p-4">
          <p className="text-sm text-slate-600 mb-4">
            Esta acción eliminará <strong>todas las transacciones</strong>.
            No se puede deshacer.
          </p>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
            <p className="font-bold">Se eliminarán:</p>
            <p>• {activeCount} transacciones del día</p>
            <p>• {historicCount} transacciones históricas</p>
          </div>
        </div>
        <div className="p-4 border-t flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm bg-red-500 text-white rounded-lg font-bold hover:bg-red-600 transition"
          >
            Eliminar Todo
          </button>
        </div>
      </div>
    </div>
  );
};
