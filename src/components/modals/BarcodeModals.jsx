// src/components/modals/BarcodeModals.jsx
// ♻️ REFACTOR: Extraído de AppModals.jsx — Modales de código de barras

import React from 'react';
import {
  AlertTriangle,
  ScanBarcode,
  Plus,
  PackageX,
} from 'lucide-react';

export const BarcodeNotFoundModal = ({ isOpen, scannedCode, onClose, onAddProduct }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="p-4 bg-gradient-to-r from-slate-700 to-slate-800 text-white">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <PackageX size={20} /> Producto No Encontrado
          </h3>
        </div>
        
        <div className="p-6 text-center">
          <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <ScanBarcode size={32} className="text-amber-600" />
          </div>
          
          <p className="text-slate-600 mb-2">No se encontró ningún producto con el código:</p>
          <p className="text-2xl font-mono font-bold text-slate-800 bg-slate-100 px-4 py-2 rounded-lg inline-block mb-6">
            {scannedCode}
          </p>
          
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-lg font-bold border-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition"
            >
              Cerrar Ventana
            </button>
            <button
              onClick={() => onAddProduct(scannedCode)}
              className="flex-1 py-3 rounded-lg font-bold bg-fuchsia-600 text-white hover:bg-fuchsia-700 transition flex items-center justify-center gap-2"
            >
              <Plus size={18} /> Agregar Producto
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const BarcodeDuplicateModal = ({ isOpen, existingProduct, onClose, onKeepExisting, onReplaceBarcode }) => {
  if (!isOpen || !existingProduct) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[90] p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="p-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <AlertTriangle size={20} /> Código Duplicado
          </h3>
        </div>
        
        <div className="p-6">
          <p className="text-slate-600 mb-4 text-center">
            Este código de barras ya está asignado a otro producto:
          </p>
          
          <div className="bg-slate-50 border rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              {existingProduct.image ? (
                <img src={existingProduct.image} alt="" className="w-12 h-12 rounded-lg object-cover border" />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-slate-200 flex items-center justify-center">
                  <ScanBarcode size={20} className="text-slate-400" />
                </div>
              )}
              <div>
                <p className="font-bold text-slate-800">{existingProduct.title}</p>
                <p className="text-xs text-slate-500">Código: {existingProduct.barcode}</p>
              </div>
            </div>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={onKeepExisting}
              className="flex-1 py-3 rounded-lg font-bold border-2 border-slate-200 text-slate-600 hover:bg-slate-50 transition"
            >
              Cancelar
            </button>
            <button
              onClick={onReplaceBarcode}
              className="flex-1 py-3 rounded-lg font-bold bg-amber-500 text-white hover:bg-amber-600 transition"
            >
              Reemplazar
            </button>
          </div>
          
          <p className="text-[10px] text-slate-400 text-center mt-3">
            "Reemplazar" quitará el código del producto anterior
          </p>
        </div>
      </div>
    </div>
  );
};
