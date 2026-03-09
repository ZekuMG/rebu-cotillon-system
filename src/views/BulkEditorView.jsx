import React, { useState, useEffect } from 'react';
import { 
  Search, Save, CheckSquare, Square, 
  Scale, Package, ArrowRight, Loader2, RotateCcw,
  FileText, X, User, Edit3, ChevronDown, Plus, Trash2
} from 'lucide-react';
import { FancyPrice } from '../components/FancyPrice';

export default function BulkEditorView({ inventory: realInventory, categories, onSaveSingle, onSaveBulk, onExportProducts }) {
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

  // --- Estado de Vista Previa de Exportación ---
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportItems, setExportItems] = useState([]);
  const [exportConfig, setExportConfig] = useState({
    isForClient: true,
    clientName: '',
    clientPhone: '',
    clientEvent: '',
    columns: { cost: false, price: true, newPrice: false, stock: false },
    clientColumns: { showQty: true, showUnitPrice: true, showSubtotal: false, showTotal: true }
  });

  // --- LÍMITES DE CARGA DIFERIDA ---
  const ITEMS_PER_CHUNK = 30;
  const [mainLimit, setMainLimit] = useState(ITEMS_PER_CHUNK);
  const [previewLimit, setPreviewLimit] = useState(ITEMS_PER_CHUNK);

  useEffect(() => {
    const clonedData = JSON.parse(JSON.stringify(realInventory || []));
    setSandboxInventory(clonedData);
    
    const initialEdits = {};
    clonedData.forEach(p => {
      const isWeight = p.product_type === 'weight';
      initialEdits[p.id] = {
        price: isWeight ? Math.round((Number(p.price) || 0) * 1000) : (Number(p.price) || 0),
        purchasePrice: isWeight ? Math.round((Number(p.purchasePrice) || 0) * 1000) : (Number(p.purchasePrice) || 0),
        stock: Number(p.stock) || 0,
      };
    });
    setEdits(initialEdits);
  }, [realInventory]);

  useEffect(() => {
    setMainLimit(ITEMS_PER_CHUNK);
  }, [searchTerm, selectedCategory]);

  const filteredProducts = sandboxInventory.filter((product) => {
    const searchString = searchTerm.toLowerCase().trim();
    const isSearchingTest = searchString === 'test';
    
    const titleLower = (product.title || '').toLowerCase();
    const catLower = (product.category || '').toLowerCase();
    const isTestProduct = titleLower.includes('test') || catLower.includes('test');

    if (isTestProduct && !isSearchingTest) return false;
    if (!isTestProduct && isSearchingTest) return false;

    const searchWords = searchString && !isSearchingTest ? searchString.split(/\s+/) : [];
    const matchesSearch = searchWords.length === 0 || searchWords.every(word =>
      titleLower.includes(word) ||
      String(product.id).toLowerCase().includes(word) ||
      (product.barcode && String(product.barcode).toLowerCase().includes(word))
    );
    
    const matchesCategory = selectedCategory === 'Todas' || 
      (Array.isArray(product.categories) ? product.categories.includes(selectedCategory) : product.category === selectedCategory);
      
    return matchesSearch && matchesCategory;
  });

  const handleMainScroll = (e) => {
    const { scrollTop, clientHeight, scrollHeight } = e.target;
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      if (mainLimit < filteredProducts.length) {
        setMainLimit(prev => prev + ITEMS_PER_CHUNK);
      }
    }
  };

  const handlePreviewScroll = (e) => {
    const { scrollTop, clientHeight, scrollHeight } = e.target;
    if (scrollHeight - scrollTop <= clientHeight + 100) {
      if (previewLimit < exportItems.length) {
        setPreviewLimit(prev => prev + ITEMS_PER_CHUNK);
      }
    }
  };

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
    const editData = edits[product.id];
    
    if (onSaveSingle) {
      await onSaveSingle(product, editData);
    }
    
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
    
    if (onSaveBulk) {
      const bulkData = selectedIds.map(id => ({
        product: sandboxInventory.find(p => p.id === id),
        edits: edits[id]
      }));
      await onSaveBulk(bulkData);
    }

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

  const openExportPreview = () => {
    const itemsToExport = sandboxInventory
      .filter(p => selectedIds.includes(p.id))
      .map(p => {
         let cat = 'Otros';
         if (Array.isArray(p.categories) && p.categories.length > 0) {
           cat = p.categories[0];
         } else if (p.category) {
           cat = p.category.split(',')[0].trim();
         }

         return {
           id: p.id,
           title: p.title,
           category: cat, 
           cost: getOriginalVal(p, 'purchasePrice'),
           price: getOriginalVal(p, 'price'),
           newPrice: Number(edits[p.id]?.price) || getOriginalVal(p, 'price'),
           stock: Number(edits[p.id]?.stock) || getOriginalVal(p, 'stock'),
           qty: 1, 
           product_type: p.product_type,
           isTemporary: false
         };
      });
    
    setExportItems(itemsToExport);
    setPreviewLimit(ITEMS_PER_CHUNK);
    setIsExportModalOpen(true);
  };

  const handleAddTemporaryItem = () => {
    const newItem = {
      id: `temp-${Date.now()}`,
      title: '',
      category: 'Adicionales',
      cost: 0,
      price: 0,
      newPrice: 0,
      stock: 0,
      qty: 1,
      product_type: 'quantity',
      isTemporary: true
    };
    setExportItems(prev => [newItem, ...prev]);
  };

  const updateExportItemField = (id, field, value) => {
    setExportItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const removeExportItem = (id) => {
    setExportItems(prev => prev.filter(item => item.id !== id));
  };

  const updateExportItemQty = (id, newQty) => {
    const qty = parseInt(newQty);
    if (isNaN(qty) || qty < 1) return;
    setExportItems(prev => prev.map(item => item.id === id ? { ...item, qty } : item));
  };

  const handleConfirmExport = () => {
    if (onExportProducts) {
      const cleanItems = exportItems.filter(item => item.title && item.title.trim() !== '');
      onExportProducts(exportConfig, cleanItems);
    }
    setIsExportModalOpen(false);
  };

  const getOriginalVal = (p, field) => {
    const isWeight = p.product_type === 'weight';
    if (field === 'stock') return Number(p[field]) || 0;
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
      
      <style>{`
        .no-spinners::-webkit-outer-spin-button,
        .no-spinners::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .no-spinners { -moz-appearance: textfield; }
      `}</style>

      {/* HEADER PRINCIPAL */}
      <div className="bg-white p-2 rounded-xl shadow-sm border border-amber-200 shrink-0 flex items-center justify-between gap-3 z-10 relative overflow-hidden pl-3 pr-2">
        <div className="absolute top-0 left-0 w-1 bg-amber-400 h-full"></div>
        
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

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="Buscar producto..." 
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

        <div className="pl-3 border-l border-slate-200 flex items-center gap-2">
          <button 
            onClick={openExportPreview}
            disabled={selectedIds.length === 0}
            className="bg-indigo-600 text-white px-3 py-1.5 rounded-md font-bold text-xs shadow-md hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 whitespace-nowrap"
          >
            <FileText size={14} />
            Generar PDF ({selectedIds.length})
          </button>

          <button 
            onClick={handleSaveBulk}
            disabled={selectedIds.length === 0 || isSaving}
            className="bg-slate-900 text-white px-4 py-1.5 rounded-md font-black text-xs shadow-md hover:bg-slate-800 disabled:opacity-50 transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar Cambios ({selectedIds.length})
          </button>
        </div>
      </div>

      {/* TABLA PRINCIPAL CON SCROLL LAZY LOAD */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col relative z-0">
        <div className="overflow-y-auto custom-scrollbar flex-1 relative" onScroll={handleMainScroll}>
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
              {filteredProducts.slice(0, mainLimit).map(p => {
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
                            <span className="line-through"><FancyPrice amount={origCost} /></span>
                            <span className={`font-black ${costDiff.includes('+') ? 'text-red-500' : 'text-emerald-500'}`}>
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
                            <span className="line-through"><FancyPrice amount={origPrice} /></span>
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
                          className={`no-spinners w-full p-1 text-[11px] font-bold border rounded outline-none transition-all text-center ${Number(editVals.stock) !== getOriginalVal(p, 'stock') ? 'bg-blue-100 border-blue-300 text-blue-900' : 'border-transparent hover:border-slate-300 bg-transparent text-slate-700'}`}
                        />
                        {isWeight && <span className="text-[8px] font-bold text-amber-600 ml-0.5">g</span>}
                      </div>
                    </td>

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
              
              {mainLimit < filteredProducts.length && (
                <tr>
                  <td colSpan="6" className="p-3 text-center text-slate-400 text-[10px] font-bold bg-slate-50 flex items-center justify-center gap-2">
                    <ChevronDown size={14} className="animate-bounce" /> Sigue bajando para cargar más...
                  </td>
                </tr>
              )}
              
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan="6" className="p-8 text-center text-slate-400 font-bold text-xs">No hay productos que coincidan con la búsqueda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* INTERFAZ DE VISTA PREVIA Y EDICIÓN DE CANTIDADES */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6">
          <div className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-6xl h-full max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-300">
            
            {/* Modal Header */}
            <div className="bg-indigo-700 px-6 py-4 flex justify-between items-center text-white shrink-0">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  <FileText size={20} /> Asistente de Exportación PDF
                </h3>
                <p className="text-indigo-200 text-xs mt-0.5">Revisa la configuración y ajusta las cantidades antes de generar el documento.</p>
              </div>
              <button onClick={() => setIsExportModalOpen(false)} className="text-indigo-300 hover:text-white transition-colors bg-indigo-800/50 p-2 rounded-lg">
                <X size={20} />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="flex flex-1 overflow-hidden">
              
              {/* COLUMNA IZQUIERDA: Configuración */}
              <div className="w-1/3 bg-white border-r border-slate-200 p-6 flex flex-col overflow-y-auto custom-scrollbar">
                
                <h4 className="font-black text-slate-800 uppercase tracking-wider text-xs mb-4 flex items-center gap-2">
                  <User size={16} className="text-indigo-600"/> Tipo de Documento
                </h4>
                
                <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl mb-6">
                  <div>
                    <p className="font-bold text-sm text-slate-800">Presupuesto a Cliente</p>
                    <p className="text-[11px] text-slate-500 leading-tight mt-1">Habilita edición de columnas visuales.</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={exportConfig.isForClient} onChange={(e) => setExportConfig({...exportConfig, isForClient: e.target.checked})} />
                    <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>

                {exportConfig.isForClient ? (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4">
                      <label className="block text-[10px] font-bold text-indigo-800 mb-1.5 uppercase tracking-wider">Nombre del Cliente (Max 40 letras)</label>
                      <input 
                        type="text" 
                        maxLength={40} 
                        placeholder="Ej: Cumpleaños de Sofía" 
                        className="w-full p-2.5 border border-indigo-200 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white" 
                        value={exportConfig.clientName} 
                        onChange={(e) => setExportConfig({...exportConfig, clientName: e.target.value})} 
                      />
                    </div>
                    
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Teléfono (Max 10 números)</label>
                        <input 
                          type="text" 
                          maxLength={10} 
                          placeholder="Ej: 1112345678" 
                          className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white" 
                          value={exportConfig.clientPhone} 
                          onChange={(e) => setExportConfig({...exportConfig, clientPhone: e.target.value})} 
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-1.5 uppercase tracking-wider">Detalle del Evento (Max 40 letras)</label>
                        <input 
                          type="text" 
                          maxLength={40} 
                          placeholder="Ej: 15 Años, Temática Neón" 
                          className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 bg-white" 
                          value={exportConfig.clientEvent} 
                          onChange={(e) => setExportConfig({...exportConfig, clientEvent: e.target.value})} 
                        />
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-200">
                      <label className="block text-[10px] font-bold text-slate-600 mb-3 uppercase tracking-wider">Información a mostrar en el PDF:</label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 bg-white shadow-sm transition-colors">
                          <input type="checkbox" className="accent-indigo-600 w-4 h-4" checked={exportConfig.clientColumns.showQty} onChange={(e) => setExportConfig({...exportConfig, clientColumns: {...exportConfig.clientColumns, showQty: e.target.checked}})} />
                          <span className="text-xs font-bold text-slate-700">Cantidades</span>
                        </label>
                        <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 bg-white shadow-sm transition-colors">
                          <input type="checkbox" className="accent-indigo-600 w-4 h-4" checked={exportConfig.clientColumns.showUnitPrice} onChange={(e) => setExportConfig({...exportConfig, clientColumns: {...exportConfig.clientColumns, showUnitPrice: e.target.checked}})} />
                          <span className="text-xs font-bold text-slate-700">Precio Unitario</span>
                        </label>
                        <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 bg-white shadow-sm transition-colors">
                          <input type="checkbox" className="accent-indigo-600 w-4 h-4" checked={exportConfig.clientColumns.showSubtotal} onChange={(e) => setExportConfig({...exportConfig, clientColumns: {...exportConfig.clientColumns, showSubtotal: e.target.checked}})} />
                          <span className="text-xs font-bold text-slate-700">Subtotales</span>
                        </label>
                        <label className="flex items-center gap-2 p-2 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 bg-white shadow-sm transition-colors">
                          <input type="checkbox" className="accent-indigo-600 w-4 h-4" checked={exportConfig.clientColumns.showTotal} onChange={(e) => setExportConfig({...exportConfig, clientColumns: {...exportConfig.clientColumns, showTotal: e.target.checked}})} />
                          <span className="text-xs font-bold text-slate-700">Total Final</span>
                        </label>
                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="space-y-4 animate-in fade-in duration-300">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                      <p className="text-amber-800 text-xs font-medium">Estás exportando un <strong>Reporte Interno</strong>. Solo mostrará la información de catálogo sin agrupar por cliente.</p>
                    </div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-2 uppercase tracking-wider">Columnas Visibles en PDF:</label>
                    <div className="space-y-2">
                      <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors bg-white shadow-sm">
                        <input type="checkbox" className="accent-indigo-600 w-4 h-4" checked={exportConfig.columns.cost} onChange={(e) => setExportConfig({...exportConfig, columns: {...exportConfig.columns, cost: e.target.checked}})} />
                        <span className="text-sm font-bold text-slate-700">Costo Original</span>
                      </label>
                      <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors bg-white shadow-sm">
                        <input type="checkbox" className="accent-indigo-600 w-4 h-4" checked={exportConfig.columns.price} onChange={(e) => setExportConfig({...exportConfig, columns: {...exportConfig.columns, price: e.target.checked}})} />
                        <span className="text-sm font-bold text-slate-700">Precio Original</span>
                      </label>
                      <label className="flex items-center gap-3 p-3 border border-indigo-200 rounded-lg cursor-pointer hover:bg-indigo-50 transition-colors bg-indigo-50/30 shadow-sm">
                        <input type="checkbox" className="accent-indigo-600 w-4 h-4" checked={exportConfig.columns.newPrice} onChange={(e) => setExportConfig({...exportConfig, columns: {...exportConfig.columns, newPrice: e.target.checked}})} />
                        <span className="text-sm font-bold text-indigo-900">Precio Editado (Recomendado)</span>
                      </label>
                      <label className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors bg-white shadow-sm">
                        <input type="checkbox" className="accent-indigo-600 w-4 h-4" checked={exportConfig.columns.stock} onChange={(e) => setExportConfig({...exportConfig, columns: {...exportConfig.columns, stock: e.target.checked}})} />
                        <span className="text-sm font-bold text-slate-700">Stock Físico Actual</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>

              {/* COLUMNA DERECHA: Vista Previa */}
              <div className="w-2/3 bg-slate-100 flex flex-col p-6 overflow-hidden">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="font-black text-slate-800 uppercase tracking-wider text-xs flex items-center gap-2">
                    <Edit3 size={16} className="text-indigo-600"/> 
                    {exportConfig.isForClient ? 'Ajustar Cantidades del Presupuesto' : 'Resumen de Productos a Exportar'}
                  </h4>
                  {exportConfig.isForClient && (
                    <button 
                      onClick={handleAddTemporaryItem}
                      className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-bold text-[10px] px-2.5 py-1.5 rounded flex items-center gap-1 transition-colors uppercase tracking-wider border border-indigo-200 shadow-sm"
                    >
                      <Plus size={12} strokeWidth={3} /> Producto Extra
                    </button>
                  )}
                </div>

                <div className="bg-white border border-slate-200 rounded-xl flex-1 overflow-hidden flex flex-col shadow-sm">
                  {/* SCROLL CONTAINER */}
                  <div className="overflow-y-auto custom-scrollbar flex-1 relative" onScroll={handlePreviewScroll}>
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-800 text-white sticky top-0 z-10">
                        <tr>
                          <th className="py-3 px-4 font-bold text-[10px] uppercase tracking-wider">Producto</th>
                          {exportConfig.isForClient ? (
                            <>
                              {exportConfig.clientColumns.showUnitPrice && <th className="py-3 px-4 font-bold text-[10px] uppercase tracking-wider text-right w-28">Precio Ud.</th>}
                              {exportConfig.clientColumns.showQty && <th className="py-3 px-4 font-bold text-[10px] uppercase tracking-wider text-center w-28">Cantidad</th>}
                              {exportConfig.clientColumns.showSubtotal && <th className="py-3 px-4 font-bold text-[10px] uppercase tracking-wider text-right w-32">Subtotal Visual</th>}
                              <th className="w-10"></th>
                            </>
                          ) : (
                            <>
                              <th className="py-3 px-4 font-bold text-[10px] uppercase tracking-wider text-right w-28">Precio Ud.</th>
                              <th className="w-10"></th>
                            </>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {exportItems.slice(0, previewLimit).map(item => {
                          const isWeight = item.product_type === 'weight';
                          const subtotal = isWeight ? item.newPrice * (item.qty / 1000) : item.newPrice * item.qty;

                          return (
                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                              <td className="py-2.5 px-4">
                                <div className="flex flex-col gap-1">
                                  {item.isTemporary ? (
                                    <input 
                                      type="text"
                                      className="w-full p-1 text-xs font-bold border border-slate-300 rounded focus:border-indigo-500 outline-none"
                                      value={item.title}
                                      onChange={(e) => updateExportItemField(item.id, 'title', e.target.value)}
                                      placeholder="Nombre del producto o servicio..."
                                      autoFocus
                                    />
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <p className="font-bold text-slate-800 text-xs">{item.title}</p>
                                      {isWeight && <span className="bg-amber-100 text-amber-700 text-[8px] px-1 rounded font-bold uppercase tracking-widest border border-amber-200 whitespace-nowrap">Por Peso</span>}
                                    </div>
                                  )}
                                  
                                  {item.isTemporary ? (
                                    <input 
                                      type="text"
                                      className="w-full max-w-[150px] p-1 text-[9px] font-bold border border-slate-200 rounded outline-none text-slate-500 uppercase"
                                      value={item.category}
                                      onChange={(e) => updateExportItemField(item.id, 'category', e.target.value)}
                                      placeholder="Categoría..."
                                    />
                                  ) : (
                                    <p className="text-[9px] text-slate-400 font-bold uppercase">{item.category}</p>
                                  )}
                                </div>
                              </td>

                              {exportConfig.isForClient ? (
                                <>
                                  {exportConfig.clientColumns.showUnitPrice && (
                                    <td className="py-2.5 px-4 text-right">
                                      {item.isTemporary ? (
                                        <div className="relative inline-block w-24">
                                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">$</span>
                                          <input 
                                            type="number"
                                            className="no-spinners w-full pl-5 pr-2 py-1 text-xs font-bold border border-slate-300 rounded focus:border-indigo-500 outline-none text-right"
                                            value={item.newPrice}
                                            onChange={(e) => updateExportItemField(item.id, 'newPrice', Number(e.target.value) || 0)}
                                          />
                                        </div>
                                      ) : (
                                        <>
                                          <span className="font-medium text-slate-600 text-xs"><FancyPrice amount={item.newPrice} /></span>
                                          {isWeight && <span className="block text-[9px] text-slate-400 -mt-0.5">por Kg</span>}
                                        </>
                                      )}
                                    </td>
                                  )}
                                  {exportConfig.clientColumns.showQty && (
                                    <td className="py-2.5 px-4">
                                      <div className="flex justify-center items-center">
                                        <input 
                                          type="number"
                                          min="1"
                                          className="no-spinners w-16 p-1.5 text-center text-xs font-bold border border-slate-300 rounded focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                                          value={item.qty}
                                          onChange={(e) => updateExportItemQty(item.id, e.target.value)}
                                        />
                                        {isWeight && <span className="ml-1 text-[10px] font-bold text-amber-600">g</span>}
                                      </div>
                                    </td>
                                  )}
                                  {exportConfig.clientColumns.showSubtotal && (
                                    <td className="py-2.5 px-4 text-right">
                                      <span className="font-black text-indigo-700 text-sm"><FancyPrice amount={subtotal} /></span>
                                    </td>
                                  )}
                                </>
                              ) : (
                                <td className="py-2.5 px-4 text-right">
                                  <span className="font-medium text-slate-600 text-xs"><FancyPrice amount={item.newPrice} /></span>
                                  {isWeight && <span className="block text-[9px] text-slate-400 -mt-0.5">por Kg</span>}
                                </td>
                              )}
                              
                              <td className="py-2.5 px-2 text-center">
                                <button 
                                  onClick={() => removeExportItem(item.id)} 
                                  className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                  title="Quitar de este PDF"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        
                        {previewLimit < exportItems.length && (
                          <tr>
                            <td colSpan="5" className="p-3 text-center text-slate-400 text-[10px] font-bold bg-slate-50 flex items-center justify-center gap-2">
                              <ChevronDown size={14} className="animate-bounce" /> Mostrando {previewLimit} de {exportItems.length}. Baja para ver el resto.
                            </td>
                          </tr>
                        )}
                        
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Fila de Total */}
                  {exportConfig.isForClient && exportConfig.clientColumns.showTotal && (
                    <div className="bg-slate-50 border-t border-slate-200 p-4 flex justify-between items-center shrink-0">
                      <span className="font-black text-slate-500 uppercase tracking-widest text-xs">Total del Presupuesto:</span>
                      <span className="text-2xl font-black text-emerald-600">
                        <FancyPrice amount={exportItems.reduce((acc, item) => acc + (item.product_type === 'weight' ? item.newPrice * (item.qty / 1000) : item.newPrice * item.qty), 0)} />
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-white border-t border-slate-200 p-4 flex justify-between items-center shrink-0">
              <span className="text-xs font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                {exportItems.length} ítems listos para el PDF
              </span>
              <div className="flex gap-3">
                <button 
                  onClick={() => setIsExportModalOpen(false)}
                  className="px-5 py-2.5 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleConfirmExport}
                  disabled={exportItems.length === 0}
                  className="px-6 py-2.5 rounded-lg text-sm font-black bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg shadow-indigo-200 hover:shadow-indigo-300 transform hover:-translate-y-0.5"
                >
                  <FileText size={18} /> IMPRIMIR / GUARDAR PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}