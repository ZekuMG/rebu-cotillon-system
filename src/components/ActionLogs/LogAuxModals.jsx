import React, { useState } from 'react';
import { X, Wand2, Trash2, AlertOctagon } from 'lucide-react';

// --- MODAL GENERADOR ---
export function GeneratorModal({ isOpen, onClose, onGenerate }) {
  // Estado interno para no ensuciar la vista principal
  const [config, setConfig] = useState({
    count: 30,
    dateStart: '',
    dateEnd: '',
    includeVentas: true,
    includeCaja: true,
    includeProductos: true,
    includeCategorias: true,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full animate-in zoom-in-95">
        <div className="p-4 border-b flex justify-between items-center bg-amber-500 rounded-t-xl">
          <h4 className="font-bold text-white flex items-center gap-2">
            <Wand2 size={18} /> Generar Acciones de Prueba
          </h4>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X size={20} />
          </button>
        </div>
        
        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Cantidad</label>
            <input
              type="number"
              min="1"
              max="200"
              className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500"
              value={config.count}
              onChange={(e) => setConfig({ ...config, count: parseInt(e.target.value) || 1 })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Desde</label>
              <input
                type="date"
                className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500"
                value={config.dateStart}
                onChange={(e) => setConfig({ ...config, dateStart: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Hasta</label>
              <input
                type="date"
                className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-amber-500"
                value={config.dateEnd}
                onChange={(e) => setConfig({ ...config, dateEnd: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">Tipos de acciones</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 p-1 rounded">
                <input type="checkbox" checked={config.includeVentas} onChange={(e) => setConfig({ ...config, includeVentas: e.target.checked })} className="rounded text-amber-500 focus:ring-amber-500" />
                <span>Ventas y Anulaciones</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 p-1 rounded">
                <input type="checkbox" checked={config.includeCaja} onChange={(e) => setConfig({ ...config, includeCaja: e.target.checked })} className="rounded text-amber-500 focus:ring-amber-500" />
                <span>Apertura/Cierre de Caja</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 p-1 rounded">
                <input type="checkbox" checked={config.includeProductos} onChange={(e) => setConfig({ ...config, includeProductos: e.target.checked })} className="rounded text-amber-500 focus:ring-amber-500" />
                <span>Edición/Alta de Productos</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-slate-50 p-1 rounded">
                <input type="checkbox" checked={config.includeCategorias} onChange={(e) => setConfig({ ...config, includeCategorias: e.target.checked })} className="rounded text-amber-500 focus:ring-amber-500" />
                <span>Categorías</span>
              </label>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 flex gap-2">
            <span className="text-xl">⚡</span>
            <p>Se generarán acciones variadas aleatorias basadas en los tipos seleccionados.</p>
          </div>
        </div>

        <div className="p-4 border-t flex gap-2 justify-end bg-slate-50 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-200 rounded-lg transition">Cancelar</button>
          <button 
            onClick={() => onGenerate(config)} 
            className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg font-bold hover:bg-amber-600 transition shadow-sm"
          >
            Generar {config.count} Acciones
          </button>
        </div>
      </div>
    </div>
  );
}

// --- MODAL BORRADO ---
export function DeleteHistoryModal({ isOpen, onClose, onConfirm, count }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[80] p-4 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full animate-in zoom-in-95 overflow-hidden">
        <div className="bg-red-50 p-6 flex flex-col items-center text-center border-b border-red-100">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-600 ring-8 ring-red-50">
            <AlertOctagon size={32} />
          </div>
          <h3 className="text-xl font-bold text-red-900 mb-2">¿Borrar todo el historial?</h3>
          <p className="text-sm text-red-700/80">
            Estás a punto de eliminar <span className="font-bold">{count} registros</span> de acciones.
            <br />
            <span className="font-bold mt-2 block">Esta acción no se puede deshacer.</span>
          </p>
        </div>
        <div className="p-4 bg-white flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold hover:bg-slate-50 transition-colors text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 px-4 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 shadow-lg shadow-red-200 transition-all text-sm flex items-center justify-center gap-2"
          >
            <Trash2 size={16} /> Confirmar Borrado
          </button>
        </div>
      </div>
    </div>
  );
}