// src/components/modals/SaleModals.jsx
// ♻️ REFACTOR: Extraído de AppModals.jsx — Modales de venta exitosa, ticket e imagen

import React from 'react';
import {
  X,
  CheckCircle,
  Printer,
  FileOutput,
} from 'lucide-react';
import { formatPrice } from '../../utils/helpers';
// [MODIFICADO] Importamos el layout real para unificar diseño de impresión y vista previa
import { TicketPrintLayout } from '../TicketPrintLayout';

export const ImageModal = ({ isOpen, image, onClose }) => {
  if (!isOpen || !image) return null;
  return (
    <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 cursor-pointer" onClick={onClose}>
      <img src={image} alt="Zoom" className="max-w-full max-h-full rounded-lg shadow-2xl" />
      <button className="absolute top-5 right-5 text-white/70 hover:text-white"><X size={32} /></button>
    </div>
  );
};

export const SaleSuccessModal = ({ transaction, onClose, onViewTicket }) => {
  if (!transaction) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="bg-gradient-to-r from-green-500 to-emerald-500 p-6 text-center">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-lg"><CheckCircle size={40} className="text-green-500" /></div>
          <h3 className="text-xl font-bold text-white">¡Venta Exitosa!</h3>
          <p className="text-green-100 text-sm">La transacción se ha registrado correctamente</p>
        </div>
        
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 rounded-lg p-4 text-center">
            <p className="text-xs text-slate-400 uppercase font-bold">Número de Compra</p>
            <p className="text-3xl font-bold text-slate-800">#{String(transaction.id).padStart(6, '0')}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 p-3 rounded-lg"><p className="text-[10px] font-bold text-blue-400 uppercase">Vendedor</p><p className="font-bold text-blue-700">{transaction.user}</p></div>
            <div className="bg-fuchsia-50 p-3 rounded-lg"><p className="text-[10px] font-bold text-fuchsia-400 uppercase">Método de Pago</p><p className="font-bold text-fuchsia-700">{transaction.payment}{transaction.installments > 1 && ` (${transaction.installments} cuotas)`}</p></div>
          </div>
          <div className="border-t pt-3 flex justify-between items-end"><span className="font-bold text-slate-600">TOTAL</span><span className="text-2xl font-bold text-green-600">${formatPrice(transaction.total)}</span></div>
        </div>

        <div className="p-4 bg-slate-50 border-t flex gap-3">
          <button onClick={onViewTicket} className="flex-1 bg-slate-800 text-white py-3 rounded-lg font-bold hover:bg-slate-900 transition flex items-center justify-center gap-2"><FileOutput size={18} /> Ver Ticket</button>
          <button onClick={onClose} className="flex-1 bg-green-500 text-white py-3 rounded-lg font-bold hover:bg-green-600 transition flex items-center justify-center gap-2"><CheckCircle size={18} /> Continuar</button>
        </div>
      </div>
    </div>
  );
};

export const TicketModal = ({ transaction, onClose, onPrint }) => {
  if (!transaction) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden w-full max-w-sm">
        {/* Header Modal */}
        <div className="p-4 bg-slate-100 border-b flex justify-between items-center shrink-0">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <FileOutput size={18} /> Visualización Ticket
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
        </div>

        {/* Body Modal (Preview Ticket Real) */}
        <div className="overflow-y-auto p-6 bg-slate-200 flex justify-center">
          {/* [CAMBIO CRÍTICO] 
             Usamos el componente TicketPrintLayout DIRECTAMENTE.
             Esto garantiza que la previsualización tenga:
             1. Formato "Socio (N°): Nombre [#ID]"
             2. Lógica de Puntos Ganados/Totales
             3. Sin DNI/Tel
             4. Misma tipografía Arial 10px Negrita
          */}
          <TicketPrintLayout transaction={transaction} />
        </div>

        {/* Footer Modal (Acciones) */}
        <div className="p-4 border-t bg-white shrink-0">
          <button onClick={onPrint} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition flex items-center justify-center gap-2 shadow-lg">
            <Printer size={20} /> Imprimir Ahora
          </button>
        </div>
      </div>
    </div>
  );
};