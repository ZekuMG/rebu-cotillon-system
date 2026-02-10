import React from 'react';
import { X, Clock, User, FileText } from 'lucide-react';
// Importamos el renderizador y el helper de títulos que creamos en el paso anterior
import LogDetailRenderer, { getDetailTitle } from './LogDetailRenderer';

export default function LogDetailModal({ selectedLog, onClose }) {
  if (!selectedLog) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-[60] p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 border border-slate-100">
        
        {/* Header Modal */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex justify-between items-center">
          <div>
            <h3 className="font-bold text-slate-800 text-base">
              {getDetailTitle(selectedLog.action)}
            </h3>
            <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
              <Clock size={12} /> {selectedLog.date} {selectedLog.timestamp}
              <span className="text-slate-300">|</span>
              ID: {selectedLog.id}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 p-2 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body Scrollable */}
        <div className="p-6 overflow-y-auto space-y-5 custom-scrollbar">
          
          {/* Metadata Grid (Usuario y Acción) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                Responsable
              </p>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
                  <User size={14} />
                </div>
                <span className="font-bold text-slate-700 text-sm">
                  {selectedLog.user}
                </span>
              </div>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">
                Tipo de Acción
              </p>
              <span className="font-bold text-slate-700 text-sm">
                {selectedLog.action}
              </span>
            </div>
          </div>

          {/* Renderizado del Contenido Específico */}
          <div className="pt-2">
            <LogDetailRenderer log={selectedLog} />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50 text-right shrink-0">
          <button
            onClick={onClose}
            className="bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-slate-700 transition-colors shadow-lg shadow-slate-200"
          >
            Cerrar Detalle
          </button>
        </div>
      </div>
    </div>
  );
}