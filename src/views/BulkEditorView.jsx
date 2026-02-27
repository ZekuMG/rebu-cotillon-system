// src/views/BulkEditorView.jsx
import React, { useState, useEffect } from 'react';
import { 
  Search, Save, Percent, CheckSquare, Square, AlertCircle, 
  Scale, Package, ArrowRight, Loader2
} from 'lucide-react';
import { getPricePerKg } from '../utils/helpers';

export default function BulkEditorView({ inventory, categories, onSaveSingle, onSaveBulk }) {
  // --- Filtros ---
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  
  // --- Estado de Edición Local ---
  const [edits, setEdits] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  
  // --- Herramienta de Ajuste Masivo ---
  const [bulkAction, setBulkAction] = useState({ field: 'price', percentage: '' });
  const [isSaving, setIsSaving] = useState(false);

  // Inicializar/Sincronizar valores cuando cambia el inventario
  useEffect(() => {
    const initialEdits = {};
    inventory.forEach(p => {
      const isWeight = p.product_type === 'weight';
      initialEdits[p.id] = {
        price: isWeight ? Math.round(Number(p.price) * 1000) : p.price,
        purchasePrice: isWeight ? Math.round(Number(p.purchasePrice) * 1000) : p.purchasePrice,
        stock: isWeight ? Math.round(Number(p.stock)) : p.stock,
      };
    });
    setEdits(initialEdits);
  }, [inventory]);

  // --- Filtrado Inteligente (El mismo que en POS) ---
  const filteredProducts = (inventory || []).filter((product) => {
    const searchString = searchTerm.toLowerCase().trim();
    const searchWords = searchString ? searchString.split(/\s+/) : [];
    const matchesSearch = searchWords.length === 0 || searchWords.every(word =>
      (product.title || '').toLowerCase().includes(word) ||
      String(product.id).toLowerCase().includes(word) ||
      (product.barcode && String(product.barcode).toLowerCase().includes(word))
    );
    const matchesCategory = selectedCategory === 'Todas' || 
      (Array.isArray(product.categories) ? product.categories.includes(selectedCategory) : product.category === selectedCategory);
    return matchesSearch && matchesCategory;
  });

  // --- Handlers de Edición ---
  const handleEditChange = (id, field, value) => {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredProducts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredProducts.map(p => p.id));
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // --- Aplicar Regla Masiva Visualmente ---
  const applyBulkPercentage = () => {
    const percentage = Number(bulkAction.percentage);
    if (isNaN(percentage) || percentage === 0 || selectedIds.length === 0) return;

    const multiplier = 1 + (percentage / 100);
    const newEdits = { ...edits };

    selectedIds.forEach(id => {
      const currentVal = Number(newEdits[id][bulkAction.field]) || 0;
      newEdits[id][bulkAction.field] = Math.round(currentVal * multiplier);
    });

    setEdits(newEdits);
    setBulkAction({ ...bulkAction, percentage: '' });
  };

  // --- Guardar Cambios ---
  const handleSaveSingle = async (product) => {
    const editData = edits[product.id];
    setIsSaving(true);
    await onSaveSingle(product, editData);
    setIsSaving(false);
  };

  const handleSaveBulk = async () => {
    if (selectedIds.length === 0) return;
    const bulkData = selectedIds.map(id => ({
      product: inventory.find(p => p.id === id),
      edits: edits[id]
    }));
    
    setIsSaving(true);
    await onSaveBulk(bulkData);
    setSelectedIds([]); // Limpiar selección tras guardar
    setIsSaving(false);
  };

  // Saber si un producto tiene cambios sin guardar
  const hasChanges = (p) => {
    if (!edits[p.id]) return false;
    const isWeight = p.product_type === 'weight';
    const origPrice = isWeight ? Math.round(Number(p.price) * 1000) : Number(p.price);
    const origCost = isWeight ? Math.round(Number(p.purchasePrice) * 1000) : Number(p.purchasePrice);
    const origStock = isWeight ? Math.round(Number(p.stock)) : Number(p.stock);

    return Number(edits[p.id].price) !== origPrice || 
           Number(edits[p.id].purchasePrice) !== origCost || 
           Number(edits[p.id].stock) !== origStock;
  };

    return (
        <div className="flex flex-col h-full gap-4 overflow-hidden">

      {/* HEADER Y FILTROS */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 shrink-0 space-y-4 z-10">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
            <Percent className="text-fuchsia-600" /> Edición Masiva (Debug Mode)
          </h2>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Buscar producto..." 
              className="w-full pl-10 pr-4 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-fuchsia-500 outline-none text-sm font-bold"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select 
            className="px-4 py-2 border rounded-lg bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-fuchsia-500 text-sm cursor-pointer"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            <option value="Todas">Todas las Categorías</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* PANEL DE HERRAMIENTAS MASIVAS */}
      <div className="bg-fuchsia-50 p-4 rounded-xl shadow-sm border border-fuchsia-100 shrink-0 flex flex-wrap gap-4 items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <span className="text-sm font-black text-fuchsia-800">Acción Masiva:</span>
          <select 
            className="p-2 border border-fuchsia-200 rounded-lg text-sm font-bold outline-none"
            value={bulkAction.field}
            onChange={(e) => setBulkAction({...bulkAction, field: e.target.value})}
          >
            <option value="price">Aumentar Precio</option>
            <option value="purchasePrice">Aumentar Costo</option>
          </select>
          <div className="relative">
            <input 
              type="number" 
              placeholder="Ej: 15" 
              className="w-24 pl-3 pr-6 py-2 border border-fuchsia-200 rounded-lg text-sm font-black outline-none"
              value={bulkAction.percentage}
              onChange={(e) => setBulkAction({...bulkAction, percentage: e.target.value})}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">%</span>
          </div>
          <button 
            onClick={applyBulkPercentage}
            disabled={selectedIds.length === 0 || !bulkAction.percentage}
            className="bg-fuchsia-600 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-fuchsia-700 disabled:opacity-50 transition-colors flex items-center gap-2"
          >
            <ArrowRight size={16} /> Aplicar a {selectedIds.length} ítems
          </button>
        </div>

        <button 
          onClick={handleSaveBulk}
          disabled={selectedIds.length === 0 || isSaving}
          className="bg-slate-900 text-white px-6 py-2 rounded-lg font-black text-sm shadow-lg hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Guardar {selectedIds.length} Seleccionados
        </button>
      </div>

      {/* TABLA ESTILO EXCEL */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative z-0">
        <div className="overflow-y-auto custom-scrollbar flex-1 relative">
          <table className="w-full text-left border-collapse relative">
            <thead className="bg-slate-800 text-white sticky top-0 z-20 shadow-md">
              <tr>
                <th className="p-3 w-10 text-center">
                  <button onClick={toggleSelectAll} className="hover:text-fuchsia-300">
                    {selectedIds.length === filteredProducts.length && filteredProducts.length > 0 ? <CheckSquare size={18} /> : <Square size={18} />}
                  </button>
                </th>
                <th className="p-3 text-xs uppercase font-black">Producto</th>
                <th className="p-3 text-xs uppercase font-black w-32">Costo ($)</th>
                <th className="p-3 text-xs uppercase font-black w-32">Precio ($)</th>
                <th className="p-3 text-xs uppercase font-black w-32">Stock</th>
                <th className="p-3 text-xs uppercase font-black text-center w-28">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredProducts.map(p => {
                const isSelected = selectedIds.includes(p.id);
                const isWeight = p.product_type === 'weight';
                const rowChanged = hasChanges(p);
                const editVals = edits[p.id] || {};

                return (
                  <tr key={p.id} className={`transition-colors ${isSelected ? 'bg-fuchsia-50/50' : isWeight ? 'bg-amber-50/30' : 'hover:bg-slate-50'}`}>
                    <td className="p-3 text-center border-r border-slate-100">
                      <button onClick={() => toggleSelect(p.id)} className={`transition-colors ${isSelected ? 'text-fuchsia-600' : 'text-slate-300 hover:text-slate-500'}`}>
                        {isSelected ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>
                    </td>
                    <td className="p-3 border-r border-slate-100">
                      <div className="flex items-center gap-2">
                        {isWeight ? <Scale size={14} className="text-amber-500 shrink-0" /> : <Package size={14} className="text-blue-500 shrink-0" />}
                        <div>
                          <p className="font-bold text-slate-800 text-sm line-clamp-1">{p.title}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase">{isWeight ? 'Por Peso (kg/g)' : 'Por Unidad'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-2 border-r border-slate-100 relative group">
                      <input 
                        type="number" 
                        value={editVals.purchasePrice ?? ''} 
                        onChange={(e) => handleEditChange(p.id, 'purchasePrice', e.target.value)}
                        className={`w-full p-2 text-sm font-bold border rounded outline-none transition-all ${Number(editVals.purchasePrice) !== (isWeight ? Math.round(Number(p.purchasePrice)*1000) : Number(p.purchasePrice)) ? 'bg-amber-100 border-amber-300 text-amber-900' : 'border-transparent hover:border-slate-300 bg-transparent focus:bg-white'}`}
                      />
                    </td>
                    <td className="p-2 border-r border-slate-100 relative group">
                      <input 
                        type="number" 
                        value={editVals.price ?? ''} 
                        onChange={(e) => handleEditChange(p.id, 'price', e.target.value)}
                        className={`w-full p-2 text-sm font-black border rounded outline-none transition-all ${Number(editVals.price) !== (isWeight ? Math.round(Number(p.price)*1000) : Number(p.price)) ? 'bg-green-100 border-green-400 text-green-900' : 'border-transparent hover:border-slate-300 bg-transparent focus:bg-white text-slate-900'}`}
                      />
                    </td>
                    <td className="p-2 border-r border-slate-100 relative group">
                      <div className="flex items-center">
                        <input 
                          type="number" 
                          value={editVals.stock ?? ''} 
                          onChange={(e) => handleEditChange(p.id, 'stock', e.target.value)}
                          className={`w-full p-2 text-sm font-bold border rounded outline-none transition-all ${Number(editVals.stock) !== (isWeight ? Math.round(Number(p.stock)) : Number(p.stock)) ? 'bg-blue-100 border-blue-300 text-blue-900' : 'border-transparent hover:border-slate-300 bg-transparent focus:bg-white text-slate-700'}`}
                        />
                        {isWeight && <span className="text-[10px] font-bold text-amber-600 ml-1">g</span>}
                      </div>
                    </td>
                    <td className="p-2 text-center">
                      {rowChanged ? (
                        <button 
                          onClick={() => handleSaveSingle(p)}
                          disabled={isSaving}
                          className="w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors flex justify-center items-center gap-1 shadow-sm"
                        >
                          <Save size={14} /> Guardar
                        </button>
                      ) : (
                        <span className="text-[10px] font-bold text-slate-300 uppercase block mt-2">Sin cambios</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-10 text-center text-slate-400 font-bold">No hay productos que coincidan con la búsqueda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}