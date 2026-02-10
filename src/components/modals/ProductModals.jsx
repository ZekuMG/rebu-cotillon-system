// src/components/modals/ProductModals.jsx
// ♻️ REFACTOR: Extraído de AppModals.jsx — Modales de gestión de productos

import React from 'react';
import {
  X,
  Upload,
  Image as ImageIcon,
  FileText,
  Trash2,
  AlertTriangle,
  ScanBarcode,
} from 'lucide-react';

// ==========================================
// COMPONENTE AUXILIAR: Selector multi-categoría
// ==========================================

export const CategoryMultiSelect = ({ allCategories, selectedCategories, onChange }) => {
  const safeSelected = Array.isArray(selectedCategories) ? selectedCategories : [];

  const handleAdd = (e) => {
    const val = e.target.value;
    if (val && !safeSelected.includes(val)) {
      onChange([...safeSelected, val]);
    }
    e.target.value = '';
  };

  const handleRemove = (catToRemove) => {
    onChange(safeSelected.filter((c) => c !== catToRemove));
  };

  const availableToAdd = allCategories.filter((c) => !safeSelected.includes(c));

  return (
    <div className="w-full">
      <div className="min-h-[42px] px-3 py-2 border rounded-lg bg-white focus-within:ring-2 focus-within:ring-fuchsia-500 focus-within:border-fuchsia-500">
        <div className="flex flex-wrap gap-2 mb-1">
          {safeSelected.map((cat) => (
            <span key={cat} className="inline-flex items-center gap-1 bg-fuchsia-100 text-fuchsia-700 text-xs font-bold px-2 py-1 rounded-md">
              {cat}
              <button type="button" onClick={() => handleRemove(cat)} className="hover:text-fuchsia-900 focus:outline-none">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
        <select className="w-full text-xs bg-transparent outline-none text-slate-500 cursor-pointer" onChange={handleAdd} value="">
          <option value="" disabled>
            {safeSelected.length === 0 ? 'Seleccionar categorías...' : '+ Agregar otra categoría'}
          </option>
          {availableToAdd.map((c) => (
            <option key={c} value={c} className="text-slate-800">{c}</option>
          ))}
        </select>
      </div>
      {safeSelected.length === 0 && <p className="text-[10px] text-red-400 mt-1 ml-1">* Debe seleccionar al menos una</p>}
    </div>
  );
};

// ==========================================
// MODAL: AGREGAR PRODUCTO
// ==========================================

export const AddProductModal = ({ isOpen, onClose, newItem, setNewItem, categories, onImageUpload, onAdd, inventory, onDuplicateBarcode }) => {
  if (!isOpen) return null;

  const handleBarcodeChange = (value) => {
    setNewItem({ ...newItem, barcode: value });
    if (value && value.length >= 3) {
      const existing = inventory?.find(p => p.barcode === value);
      if (existing && onDuplicateBarcode) {
        onDuplicateBarcode(existing, value);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10">
          <h3 className="font-bold text-slate-800">Nuevo Producto</h3>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={onAdd} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Nombre</label>
            <input required type="text" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-fuchsia-500 outline-none" value={newItem.title} onChange={(e) => setNewItem({ ...newItem, title: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1 flex items-center gap-1">
              <ScanBarcode size={12} /> Código de Barras (Opcional)
            </label>
            <input 
              type="text" 
              placeholder="Escanear o escribir código..."
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-fuchsia-500 outline-none font-mono" 
              value={newItem.barcode || ''} 
              onChange={(e) => handleBarcodeChange(e.target.value)} 
            />
            <p className="text-[10px] text-slate-400 mt-1">Usado para escaneo rápido en Punto de Venta</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Costo ($)</label>
              <input required type="number" className="w-full px-3 py-2 border rounded-lg" value={newItem.purchasePrice} onChange={(e) => setNewItem({ ...newItem, purchasePrice: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Precio ($)</label>
              <input required type="number" className="w-full px-3 py-2 border rounded-lg font-bold text-slate-800" value={newItem.price} onChange={(e) => setNewItem({ ...newItem, price: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Stock</label>
              <input required type="number" className="w-full px-3 py-2 border rounded-lg" value={newItem.stock} onChange={(e) => setNewItem({ ...newItem, stock: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Categoría(s)</label>
              <CategoryMultiSelect allCategories={categories} selectedCategories={newItem.categories} onChange={(newCats) => setNewItem({ ...newItem, categories: newCats })} />
            </div>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-dashed border-slate-300">
            <label className="text-xs font-bold text-slate-500 uppercase block mb-2 flex items-center gap-1"><ImageIcon size={12} /> Imagen del producto</label>
            <div className="mb-3">
              <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-white hover:bg-slate-50">
                <div className="flex flex-col items-center justify-center pt-2 pb-2"><Upload size={20} className="text-slate-400 mb-1" /><p className="text-[10px] text-slate-500">Click para subir imagen</p></div>
                <input type="file" className="hidden" accept="image/*" onChange={(e) => onImageUpload(e, false)} />
              </label>
            </div>
            <div><input type="text" placeholder="O pega una URL aquí..." className="w-full px-3 py-2 border rounded-lg text-xs" value={newItem.image} onChange={(e) => setNewItem({ ...newItem, image: e.target.value })} /></div>
            {newItem.image && (<div className="mt-3 flex justify-center"><img src={newItem.image} alt="Preview" className="h-20 w-20 object-cover rounded border shadow-sm" /></div>)}
          </div>
          <button type="submit" className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-slate-800">Agregar</button>
        </form>
      </div>
    </div>
  );
};

// ==========================================
// MODAL: EDITAR PRODUCTO
// ==========================================

export const EditProductModal = ({ product, onClose, setEditingProduct, categories, onImageUpload, editReason, setEditReason, onSave, inventory, onDuplicateBarcode }) => {
  if (!product) return null;

  const handleBarcodeChange = (value) => {
    setEditingProduct({ ...product, barcode: value });
    if (value && value.length >= 3) {
      const existing = inventory?.find(p => p.barcode === value && p.id !== product.id);
      if (existing && onDuplicateBarcode) {
        onDuplicateBarcode(existing, value);
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10">
          <h3 className="font-bold text-slate-800">Editar Producto</h3>
          <button onClick={onClose}><X size={20} className="text-slate-400" /></button>
        </div>
        <form onSubmit={onSave} className="p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Nombre</label>
            <input required type="text" className="w-full px-3 py-2 border rounded-lg" value={product.title} onChange={(e) => setEditingProduct({ ...product, title: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1 flex items-center gap-1">
              <ScanBarcode size={12} /> Código de Barras (Opcional)
            </label>
            <input 
              type="text" 
              placeholder="Escanear o escribir código..."
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-fuchsia-500 outline-none font-mono" 
              value={product.barcode || ''} 
              onChange={(e) => handleBarcodeChange(e.target.value)} 
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Costo ($)</label>
              <input required type="number" className="w-full px-3 py-2 border rounded-lg" value={product.purchasePrice} onChange={(e) => setEditingProduct({ ...product, purchasePrice: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Precio ($)</label>
              <input required type="number" className="w-full px-3 py-2 border rounded-lg font-bold" value={product.price} onChange={(e) => setEditingProduct({ ...product, price: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Stock</label>
              <input required type="number" className="w-full px-3 py-2 border rounded-lg" value={product.stock} onChange={(e) => setEditingProduct({ ...product, stock: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Categoría(s)</label>
              <CategoryMultiSelect allCategories={categories} selectedCategories={product.categories || []} onChange={(newCats) => setEditingProduct({ ...product, categories: newCats })} />
            </div>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-dashed border-slate-300">
            <label className="text-xs font-bold text-slate-500 uppercase block mb-2 flex items-center gap-1"><ImageIcon size={12} /> Imagen del producto</label>
            <div className="mb-3">
              <label className="flex flex-col items-center justify-center w-full h-20 border-2 border-slate-300 border-dashed rounded-lg cursor-pointer bg-white hover:bg-slate-50">
                <div className="flex flex-col items-center justify-center pt-2 pb-2"><Upload size={20} className="text-slate-400 mb-1" /><p className="text-[10px] text-slate-500">Click para cambiar imagen</p></div>
                <input type="file" className="hidden" accept="image/*" onChange={(e) => onImageUpload(e, true)} />
              </label>
            </div>
            <div><input type="text" className="w-full px-3 py-2 border rounded-lg text-xs" value={product.image} onChange={(e) => setEditingProduct({ ...product, image: e.target.value })} /></div>
            {product.image && (<div className="mt-3 flex justify-center"><img src={product.image} alt="Preview" className="h-20 w-20 object-cover rounded border shadow-sm" /></div>)}
          </div>
          <div>
            <label className="text-xs font-bold text-amber-600 uppercase block mb-1 flex items-center gap-1"><FileText size={12} /> Motivo del cambio (Opcional)</label>
            <textarea className="w-full px-3 py-2 border border-amber-200 rounded-lg text-sm bg-amber-50 focus:ring-2 focus:ring-amber-500 outline-none" rows="2" placeholder="¿Por qué realizas este cambio?" value={editReason} onChange={(e) => setEditReason(e.target.value)}></textarea>
          </div>
          <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700">Guardar Cambios</button>
        </form>
      </div>
    </div>
  );
};

// ==========================================
// MODAL: ELIMINAR PRODUCTO
// ==========================================

export const DeleteProductModal = ({ product, onClose, reason, setReason, onConfirm }) => {
  if (!product) return null;
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-4 bg-red-50 border-b border-red-100 flex justify-between items-center">
          <h3 className="font-bold text-red-800 flex items-center gap-2"><Trash2 size={18} /> Eliminar Producto</h3>
          <button onClick={onClose}><X size={18} className="text-red-400 hover:text-red-600" /></button>
        </div>
        <div className="p-6">
          <div className="flex gap-4 items-start mb-4">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center shrink-0"><AlertTriangle size={24} className="text-red-600" /></div>
            <div><p className="text-slate-700 font-bold text-lg leading-tight mb-1">¿Estás seguro?</p><p className="text-slate-500 text-sm">Vas a eliminar <span className="font-bold text-slate-800">"{product.title}"</span> del inventario.</p></div>
          </div>
          <div className="mb-4">
             <label className="text-xs font-bold text-slate-400 uppercase block mb-1">Motivo (Opcional)</label>
             <input type="text" placeholder="Ej: Producto discontinuado" className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-red-500" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-lg font-bold border border-slate-300 text-slate-600 hover:bg-slate-50 transition-colors">Cancelar</button>
            <button onClick={onConfirm} className="flex-1 py-2.5 rounded-lg font-bold bg-red-600 text-white hover:bg-red-700 shadow-md transition-colors">Sí, Eliminar</button>
          </div>
        </div>
      </div>
    </div>
  );
};
