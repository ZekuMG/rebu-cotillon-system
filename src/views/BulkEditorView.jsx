import React, { useState, useEffect } from 'react';
import { 
  Search, Save, Percent, CheckSquare, Square, 
  Scale, Package, ArrowRight, Loader2, RotateCcw
} from 'lucide-react';
import { formatPrice } from '../utils/helpers';

export default function BulkEditorView({ inventory: realInventory, categories }) {
  // --- SANDBOX (Inventario Clonado) ---
  const [sandboxInventory, setSandboxInventory] = useState([]);

  // --- Filtros ---
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  
  // --- Estado de Edición Local ---
  const [edits, setEdits] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  
  // --- Herramienta de Ajuste Masivo ---
  const [bulkAction, setBulkAction] = useState({ field: 'price', percentage: '' });
  const [isSaving, setIsSaving] = useState(false);

  // 1. Iniciar Sandbox clonando el inventario real (Sin modificar la base de datos)
  useEffect(() => {
    // Clon profundo para no mutar el inventario original de la app
    const clonedData = JSON.parse(JSON.stringify(realInventory || []));
    setSandboxInventory(clonedData);
    
    const initialEdits = {};
    clonedData.forEach(p => {
      const isWeight = p.product_type === 'weight';
      initialEdits[p.id] = {
        price: isWeight ? Math.round((Number(p.price) || 0) * 1000) : (Number(p.price) || 0),
        purchasePrice: isWeight ? Math.round((Number(p.purchasePrice) || 0) * 1000) : (Number(p.purchasePrice) || 0),
        stock: Number(p.stock) || 0, // FIX: El stock no se multiplica por 1000
      };
    });
    setEdits(initialEdits);
  }, [realInventory]);

  const filteredProducts = sandboxInventory.filter((product) => {
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
  };

  const handleResetRow = (p) => {
    const isWeight = p.product_type === 'weight';
    setEdits(prev => ({
      ...prev,
      [p.id]: {
        price: isWeight ? Math.round((Number(p.price) || 0) * 1000) : (Number(p.price) || 0),
        purchasePrice: isWeight ? Math.round((Number(p.purchasePrice) || 0) * 1000) : (Number(p.purchasePrice) || 0),
        stock: Number(p.stock) || 0,
      }
    }));
  };

  const handleSaveSingle = async (product) => {
    setIsSaving(true);
    await new Promise(resolve => setTimeout(resolve, 300)); // Simular demora de guardado
    
    const editData = edits[product.id];
    const isWeight = product.product_type === 'weight';
    const finalPrice = isWeight ? Number(editData.price) / 1000 : Number(editData.price);
    const finalCost = isWeight ? Number(editData.purchasePrice) / 1000 : Number(editData.purchasePrice);
    const finalStock = Number(editData.stock);

    setSandboxInventory(sandboxInventory.map(p => 
      p.id === product.id ? { ...p, price: finalPrice, purchasePrice: finalCost, stock: finalStock } : p
    ));
    setIsSaving(false);
  };

  const handleSaveBulk = async () => {
    if (selectedIds.length === 0) return;
    setIsSaving(true);
    await new Promise(resolve => setTimeout(resolve, 800));

    setSandboxInventory(prev => prev.map(p => {
      if (selectedIds.includes(p.id)) {
        const editData = edits[p.id];
        const isWeight = p.product_type === 'weight';
        return {
          ...p,
          price: isWeight ? Number(editData.price) / 1000 : Number(editData.price),
          purchasePrice: isWeight ? Number(editData.purchasePrice) / 1000 : Number(editData.purchasePrice),
          stock: Number(editData.stock)
        };
      }
      return p;
    }));
    
    setSelectedIds([]); 
    setIsSaving(false);
  };

  // --- FIX: Cálculo de Diferencias ---
  const getOriginalVal = (p, field) => {
    const isWeight = p.product_type === 'weight';
    if (field === 'stock') return Number(p[field]) || 0; // El stock nunca se multiplica
    return isWeight ? Math.round((Number(p[field]) || 0) * 1000) : (Number(p[field]) || 0);
  };

  const hasChanges = (p) => {
    if (!edits[p.id]) return false;
    return Number(edits[p.id].price) !== getOriginalVal(p, 'price') || 
           Number(edits[p.id].purchasePrice) !== getOriginalVal(p, 'purchasePrice') || 
           Number(edits[p.id].stock) !== getOriginalVal(p, 'stock');
  };

  const calculateDiffPercent = (oldVal, newVal) => {
    if (oldVal === 0) return newVal > 0 ? '+100%' : null;
    const diff = ((newVal - oldVal) / oldVal) * 100;
    if (diff === 0) return null;
    return diff > 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`;
  };

  return (
    <div className="flex flex-col h-full gap-3 overflow-hidden">
      
      {/* OCULTAR FLECHAS (Spinners) */}
      <style>{`
        .no-spinners::-webkit-outer-spin-button,
        .no-spinners::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .no-spinners { -moz-appearance: textfield; }
      `}</style>

      {/* HEADER: 1 Línea Perfecta */}
      <div className="bg-white p-2 rounded-xl shadow-sm border border-amber-200 shrink-0 flex items-center justify-between gap-3 z-10 relative overflow-hidden pl-3 pr-2">
        <div className="absolute top-0 left-0 w-1 bg-amber-400 h-full"></div>
        
        {/* Acción Masiva (Izquierda) */}
        <div className="flex items-center gap-2 border-r border-slate-200 pr-3">
          <span className="text-[11px] font-black text-fuchsia-800 uppercase tracking-wider hidden md:block">Acción:</span>
          <select 
            className="px-2 py-1.5 border border-fuchsia-200 rounded-md text-xs font-bold outline-none bg-fuchsia-50/50 focus:ring-2 focus:ring-fuchsia-500 cursor-pointer text-fuchsia-900"
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
              className="no-spinners w-16 pl-2 pr-5 py-1.5 border border-fuchsia-200 rounded-md text-xs font-black outline-none bg-white focus:ring-2 focus:ring-fuchsia-500 text-center"
              value={bulkAction.percentage}
              onChange={(e) => setBulkAction({...bulkAction, percentage: e.target.value})}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-fuchsia-400 font-bold text-xs">%</span>
          </div>
          <button 
            onClick={applyBulkPercentage}
            disabled={selectedIds.length === 0 || !bulkAction.percentage}
            className="bg-fuchsia-600 text-white px-3 py-1.5 rounded-md font-bold text-xs hover:bg-fuchsia-700 disabled:opacity-50 transition-colors flex items-center gap-1 shadow-sm whitespace-nowrap"
          >
            <ArrowRight size={14} /> Aplicar a {selectedIds.length}
          </button>
        </div>

        {/* Buscador y Filtro (Centro) */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Buscar producto de prueba..." 
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-400 outline-none text-xs font-bold transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select 
            className="px-3 py-1.5 border border-slate-200 rounded-lg bg-slate-50 font-bold outline-none focus:ring-2 focus:ring-amber-400 text-xs cursor-pointer w-48 transition-all shrink-0"
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
          >
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Botón Guardar (Derecha) */}
        <div className="pl-3 border-l border-slate-200">
          <button 
            onClick={handleSaveBulk}
            disabled={selectedIds.length === 0 || isSaving}
            className="bg-slate-900 text-white px-4 py-1.5 rounded-md font-black text-xs shadow-md hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Simular Guardado ({selectedIds.length})
          </button>
        </div>
      </div>

      {/* TABLA ANALÍTICA */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative z-0">
        <div className="overflow-y-auto custom-scrollbar flex-1 relative">
          <table className="w-full text-left border-collapse relative">
            <thead className="bg-slate-800 text-white sticky top-0 z-20 shadow-md">
              <tr>
                <th className="p-1.5 w-8 text-center">
                  <button onClick={toggleSelectAll} className="hover:text-fuchsia-300 transition-colors">
                    {selectedIds.length === filteredProducts.length && filteredProducts.length > 0 ? <CheckSquare size={14} /> : <Square size={14} />}
                  </button>
                </th>
                <th className="p-1.5 text-[10px] uppercase font-black tracking-wider">Producto</th>
                <th className="p-1.5 text-[10px] uppercase font-black tracking-wider w-28">Costo</th>
                <th className="p-1.5 text-[10px] uppercase font-black tracking-wider w-28">Precio</th>
                <th className="p-1.5 text-[10px] uppercase font-black tracking-wider w-20">Stock</th>
                <th className="p-1.5 text-[10px] uppercase font-black text-center w-[75px]">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map(p => {
                const isSelected = selectedIds.includes(p.id);
                const isWeight = p.product_type === 'weight';
                const rowChanged = hasChanges(p);
                const editVals = edits[p.id] || {};

                const origCost = getOriginalVal(p, 'purchasePrice');
                const origPrice = getOriginalVal(p, 'price');
                const newCost = Number(editVals.purchasePrice) || 0;
                const newPrice = Number(editVals.price) || 0;
                
                const costDiff = calculateDiffPercent(origCost, newCost);
                const priceDiff = calculateDiffPercent(origPrice, newPrice);

                return (
                  <tr key={p.id} className={`transition-colors ${isSelected ? 'bg-fuchsia-50/70' : isWeight ? 'bg-amber-50/20' : 'hover:bg-slate-50'}`}>
                    <td className="p-1.5 text-center border-r border-slate-100">
                      <button onClick={() => toggleSelect(p.id)} className={`transition-colors ${isSelected ? 'text-fuchsia-600' : 'text-slate-300 hover:text-slate-500'}`}>
                        {isSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                      </button>
                    </td>
                    <td className="p-1.5 border-r border-slate-100">
                      <div className="flex items-center gap-1.5">
                        {isWeight ? <Scale size={12} className="text-amber-500 shrink-0" /> : <Package size={12} className="text-blue-500 shrink-0" />}
                        <div className="min-w-0">
                          <p className="font-bold text-slate-800 text-[11px] truncate" title={p.title}>{p.title}</p>
                          <p className="text-[8px] text-slate-400 font-bold uppercase">{isWeight ? 'Por Peso (kg/g)' : 'Por Unidad'}</p>
                        </div>
                      </div>
                    </td>
                    
                    <td className="p-1 border-r border-slate-100 align-top">
                      <div className="flex flex-col gap-0.5">
                        {costDiff ? (
                          <div className="flex items-center justify-between text-[9px] text-slate-400 font-medium px-1">
                            <span className="line-through">${formatPrice(origCost)}</span>
                            <span className={`font-black ${costDiff.includes('+') ? 'text-emerald-500' : 'text-red-500'}`}>
                              ({costDiff})
                            </span>
                          </div>
                        ) : (
                          <div className="h-[13px]"></div>
                        )}
                        <div className="relative">
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-bold">$</span>
                          <input 
                            type="number" 
                            value={editVals.purchasePrice ?? ''} 
                            onChange={(e) => handleEditChange(p.id, 'purchasePrice', e.target.value)}
                            className={`no-spinners w-full pl-4 pr-1 py-1 text-[11px] font-bold border rounded outline-none transition-all ${costDiff ? 'bg-amber-100 border-amber-300 text-amber-900' : 'border-transparent hover:border-slate-300 bg-transparent focus:bg-white focus:border-slate-300'}`}
                          />
                        </div>
                      </div>
                    </td>

                    <td className="p-1 border-r border-slate-100 align-top">
                      <div className="flex flex-col gap-0.5">
                        {priceDiff ? (
                          <div className="flex items-center justify-between text-[9px] text-slate-400 font-medium px-1">
                            <span className="line-through">${formatPrice(origPrice)}</span>
                            <span className={`font-black ${priceDiff.includes('+') ? 'text-emerald-500' : 'text-red-500'}`}>
                              ({priceDiff})
                            </span>
                          </div>
                        ) : (
                          <div className="h-[13px]"></div>
                        )}
                        <div className="relative">
                          <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-bold">$</span>
                          <input 
                            type="number" 
                            value={editVals.price ?? ''} 
                            onChange={(e) => handleEditChange(p.id, 'price', e.target.value)}
                            className={`no-spinners w-full pl-4 pr-1 py-1 text-[11px] font-black border rounded outline-none transition-all ${priceDiff ? 'bg-green-100 border-green-400 text-green-900' : 'border-transparent hover:border-slate-300 bg-transparent focus:bg-white focus:border-slate-300 text-slate-900'}`}
                          />
                        </div>
                      </div>
                    </td>

                    <td className="p-1 border-r border-slate-100 align-bottom pb-[5px]">
                      <div className="flex items-center">
                        <input 
                          type="number" 
                          value={editVals.stock ?? ''} 
                          onChange={(e) => handleEditChange(p.id, 'stock', e.target.value)}
                          className={`no-spinners w-full p-1 text-[11px] font-bold border rounded outline-none transition-all text-center ${Number(editVals.stock) !== getOriginalVal(p, 'stock') ? 'bg-blue-100 border-blue-300 text-blue-900' : 'border-transparent hover:border-slate-300 bg-transparent focus:bg-white text-slate-700'}`}
                        />
                        {isWeight && <span className="text-[8px] font-bold text-amber-600 ml-0.5">g</span>}
                      </div>
                    </td>

                    {/* COLUMNA ACCIÓN: Íconos fijos uno al lado del otro */}
                    <td className="p-1 align-middle">
                      <div className="flex items-center justify-center gap-1.5 min-h-[28px] w-full">
                        {rowChanged ? (
                          <>
                            <button 
                              onClick={() => handleSaveSingle(p)}
                              disabled={isSaving}
                              title="Guardar Cambio"
                              className="w-7 h-7 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex justify-center items-center shadow-sm disabled:opacity-50"
                            >
                              <Save size={14} />
                            </button>
                            <button 
                              onClick={() => handleResetRow(p)}
                              disabled={isSaving}
                              title="Deshacer"
                              className="w-7 h-7 bg-slate-200 text-slate-600 rounded hover:bg-slate-300 transition-colors flex justify-center items-center disabled:opacity-50"
                            >
                              <RotateCcw size={14} />
                            </button>
                          </>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wider">--</span>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-400 font-bold text-xs">No hay productos que coincidan con la búsqueda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}