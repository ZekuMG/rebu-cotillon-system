import React, { useState } from 'react';
import {
  Search,
  Plus,
  Filter,
  Package,
  X,
  DollarSign,
  BarChart3,
  ScanBarcode,
  Edit,
  Trash2,
  AlertTriangle,
  SlidersHorizontal,
  LayoutGrid,
  List
} from 'lucide-react';

export default function InventoryView({
  inventory,
  categories,
  inventorySearch,
  setInventorySearch,
  inventoryCategoryFilter,
  setInventoryCategoryFilter,
  setIsModalOpen,
  setEditingProduct,
  handleDeleteProduct,
  inventoryViewMode,     
  setInventoryViewMode,
  gridColumns,
  setGridColumns,
  currentUser // [REQUERIDO] Prop añadida para validar permisos
}) {
  // --- ESTADOS LOCALES ---
  const [selectedProduct, setSelectedProduct] = useState(null); 
  const [showGridMenu, setShowGridMenu] = useState(false);

// --- FILTROS ---
  const filteredInventory = inventory.filter((item) => {
    // EDICIÓN QUIRÚRGICA: Se agrega soporte para barcode e ID
    const term = inventorySearch.toLowerCase();
    const matchesSearch = 
      item.title.toLowerCase().includes(term) ||
      (item.barcode && item.barcode.toString().toLowerCase().includes(term)) ||
      item.id.toString().includes(term);

    const matchesCategory =
      inventoryCategoryFilter === 'Todas' ||
      (Array.isArray(item.categories)
        ? item.categories.includes(inventoryCategoryFilter)
        : item.category === inventoryCategoryFilter);
    return matchesSearch && matchesCategory;
  });

  // Manejador de selección para el panel lateral
  const handleCardClick = (product) => {
    if (selectedProduct && selectedProduct.id === product.id) {
        setSelectedProduct(null);
    } else {
        setSelectedProduct(product);
    }
  };

  // --- AYUDANTE DE COLOR DE STOCK (SEMÁFORO) ---
  const getStockColorClass = (stock) => {
    if (stock === 0) return 'text-slate-400'; // Gris (Sin stock)
    if (stock <= 5) return 'text-red-600';    // Rojo (Crítico)
    if (stock <= 10) return 'text-amber-600'; // Amarillo (Alerta)
    return 'text-green-600';                  // Verde (Bien)
  };

  return (
    <div className="flex h-full overflow-hidden bg-slate-100">
      
      {/* ================================================= */}
      {/* COLUMNA IZQUIERDA: LISTA O CUADRÍCULA             */}
      {/* ================================================= */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-300">
        
        {/* Header de Filtros y Controles */}
        <div className="p-4 bg-white border-b shrink-0 flex flex-wrap gap-3 justify-between items-center z-30 relative">
          
          {/* Parte Izquierda: Buscador y Categoría */}
          <div className="flex items-center gap-2 flex-1 min-w-[200px]">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Buscar producto..."
                className="w-full pl-10 pr-4 py-2 border rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-fuchsia-500 outline-none transition-all"
                value={inventorySearch}
                onChange={(e) => setInventorySearch(e.target.value)}
              />
            </div>
            
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <select
                className="pl-9 pr-8 py-2 border rounded-lg bg-slate-50 text-sm focus:ring-2 focus:ring-fuchsia-500 outline-none appearance-none cursor-pointer"
                value={inventoryCategoryFilter}
                onChange={(e) => setInventoryCategoryFilter(e.target.value)}
              >
                <option value="Todas">Todas</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Parte Derecha: Controles */}
          <div className="flex items-center gap-3">
            
            {/* 1. CONTROL DESLIZANTE (Ubicado a la IZQUIERDA de los botones de vista) */}
            {inventoryViewMode === 'grid' && (
              <div className="relative">
                <button
                  onClick={() => setShowGridMenu(!showGridMenu)}
                  className={`p-2 rounded-lg border transition-all ${
                    showGridMenu ? 'bg-slate-100 ring-2 ring-slate-200' : 'bg-white hover:bg-slate-50'
                  }`}
                  title="Ajustar densidad"
                >
                  <SlidersHorizontal size={20} className="text-slate-600" />
                </button>

                {/* Popover del Slider */}
                {showGridMenu && (
                  <>
                    {/* Overlay invisible para cerrar al hacer click fuera */}
                    <div className="fixed inset-0 z-40" onClick={() => setShowGridMenu(false)}></div>
                    
                    <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50 animate-in fade-in zoom-in-95">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-bold text-slate-500 uppercase">Densidad</span>
                        <span className="text-xs font-bold text-fuchsia-600 bg-fuchsia-50 px-2 py-0.5 rounded-full border border-fuchsia-100">
                          {gridColumns} columnas
                        </span>
                      </div>
                      
                      {/* El Input Slider */}
                      <div className="relative h-6 flex items-center">
                          <input
                              type="range"
                              min="4"
                              max="10"
                              step="1"
                              value={gridColumns}
                              onChange={(e) => setGridColumns(Number(e.target.value))}
                              className="custom-range w-full"
                          />
                      </div>
                      
                      <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                        <span>Grande (4x)</span>
                        <span>Pequeño (10x)</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 2. SWITCH DE VISTA (LISTA vs CUADRÍCULA) */}
            <div className="flex bg-slate-100 p-1 rounded-lg border">
              <button
                onClick={() => setInventoryViewMode('grid')}
                className={`p-1.5 rounded-md transition-all ${
                  inventoryViewMode === 'grid'
                    ? 'bg-white text-fuchsia-600 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Vista Cuadrícula"
              >
                <LayoutGrid size={18} />
              </button>
              <button
                onClick={() => setInventoryViewMode('list')}
                className={`p-1.5 rounded-md transition-all ${
                  inventoryViewMode === 'list'
                    ? 'bg-white text-fuchsia-600 shadow-sm'
                    : 'text-slate-400 hover:text-slate-600'
                }`}
                title="Vista Lista"
              >
                <List size={18} />
              </button>
            </div>

            {/* 3. BOTÓN NUEVO PRODUCTO (RESTRICCIÓN: SOLO ADMIN) */}
            {currentUser?.role === 'admin' && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 transition-colors shadow-lg shadow-slate-900/20"
              >
                <Plus size={18} /> <span className="hidden sm:inline">Nuevo</span>
              </button>
            )}
          </div>
        </div>

        {/* Área de Scroll de Productos */}
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
          {filteredInventory.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <Package size={64} className="mb-4 text-slate-300" />
              <p className="text-lg font-medium">No se encontraron productos</p>
              <p className="text-sm">Intenta con otra búsqueda o categoría</p>
            </div>
          ) : (
            <>
              {/* --- VISTA CUADRÍCULA (GRID) --- */}
              {inventoryViewMode === 'grid' ? (
                <div
                  className="grid gap-3 transition-all duration-300"
                  style={{
                    gridTemplateColumns: `repeat(${gridColumns}, minmax(0, 1fr))`
                  }}
                >
                  {filteredInventory.map((product) => {
                    const isSelected = selectedProduct?.id === product.id;
                    const stockColor = getStockColorClass(product.stock);
                    const isOutOfStock = product.stock === 0;

                    return (
                      <div
                        key={product.id}
                        onClick={() => handleCardClick(product)}
                        className={`bg-white rounded-xl border overflow-hidden flex flex-col cursor-pointer transition-all hover:shadow-lg group ${
                          isSelected ? 'ring-2 ring-fuchsia-500 border-fuchsia-500 transform scale-[0.98]' : 'hover:border-fuchsia-200'
                        } ${isOutOfStock ? 'grayscale opacity-75' : ''}`}
                      >
                        <div className="aspect-square bg-slate-50 relative overflow-hidden">
                          {product.image ? (
                            <img
                              src={product.image}
                              alt={product.title}
                              className="w-full h-full object-cover transition-transform group-hover:scale-110 duration-500"
                            />
                          ) : (
                            // NOMBRE EN VEZ DE ICONO (Fallback)
                            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-200/50 p-2 text-center group-hover:bg-slate-200 transition-colors">
                              <span className={`font-bold text-slate-500 uppercase leading-tight ${gridColumns > 6 ? 'text-[10px]' : 'text-xs'}`}>
                                {product.title}
                              </span>
                            </div>
                          )}
                          
                          {/* OVERLAY SIN STOCK */}
                          {isOutOfStock && (
                            <div className="absolute inset-0 bg-white/60 backdrop-blur-[1px] flex items-center justify-center z-10">
                                <span className="bg-slate-800 text-white text-[10px] font-bold px-2 py-1 rounded shadow-sm border border-slate-600">AGOTADO</span>
                            </div>
                          )}

                          {/* Badge de Stock Bajo (Si no es 0) */}
                          {!isOutOfStock && product.stock <= 5 && (
                            <div className={`absolute top-1 right-1 bg-red-500 text-white font-bold rounded-full shadow-sm flex items-center justify-center ${gridColumns > 6 ? 'w-3 h-3 p-0' : 'px-2 py-0.5 text-[10px] gap-1'}`}>
                              {gridColumns > 6 ? '' : <AlertTriangle size={10} />}
                              {gridColumns > 6 ? '' : 'BAJO'}
                            </div>
                          )}
                        </div>
                        
                        <div className={`flex-1 flex flex-col ${gridColumns > 7 ? 'p-1.5' : 'p-3'}`}>
                          {gridColumns <= 7 && (
                            <div className="mb-1">
                              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider truncate block">
                                {Array.isArray(product.categories) ? product.categories[0] : product.category || 'Gral'}
                              </span>
                            </div>
                          )}
                          
                          <h3 className={`font-bold text-slate-800 leading-tight mb-1 flex-1 ${gridColumns > 7 ? 'text-[10px] line-clamp-1' : 'text-sm line-clamp-2'}`}>
                            {product.title}
                          </h3>
                          
                          <div className={`flex justify-between items-end mt-auto ${gridColumns > 7 ? 'pt-1' : 'pt-2 border-t border-slate-100'}`}>
                            <div>
                              {gridColumns <= 6 && <p className="text-[10px] text-slate-400">Precio</p>}
                              <p className={`font-bold text-slate-900 ${gridColumns > 7 ? 'text-xs' : 'text-lg'}`}>${product.price}</p>
                            </div>
                            {gridColumns <= 8 && (
                              <div className="text-right">
                                {gridColumns <= 6 && <p className="text-[10px] text-slate-400">Stock</p>}
                                <p className={`font-bold ${stockColor} ${gridColumns > 7 ? 'text-xs' : 'text-sm'}`}>
                                  {product.stock}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* --- VISTA LISTA (LIST) --- */
                <div className="flex flex-col gap-2">
                  {filteredInventory.map((product) => {
                    const isSelected = selectedProduct?.id === product.id;
                    const stockColor = getStockColorClass(product.stock);
                    const isOutOfStock = product.stock === 0;

                    return (
                      <div
                        key={product.id}
                        onClick={() => handleCardClick(product)}
                        className={`bg-white rounded-lg border p-3 flex items-center gap-4 cursor-pointer transition-all hover:shadow-md ${
                          isSelected ? 'ring-2 ring-fuchsia-500 border-fuchsia-500 bg-fuchsia-50' : 'hover:border-fuchsia-200'
                        } ${isOutOfStock ? 'grayscale opacity-75' : ''}`}
                      >
                        <div className="w-12 h-12 rounded-md bg-slate-100 flex items-center justify-center overflow-hidden shrink-0 border relative">
                          {product.image ? (
                            <img src={product.image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-slate-200 text-[8px] font-bold text-center text-slate-500 leading-none p-1">
                                {product.title.slice(0,10)}...
                            </div>
                          )}
                          {isOutOfStock && (
                            <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                                <X size={16} className="text-red-500"/>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-slate-800 truncate">{product.title}</h4>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-bold border border-slate-200">
                                {Array.isArray(product.categories) ? product.categories[0] : product.category}
                            </span>
                            <span className="text-xs text-slate-400 flex items-center gap-1">
                                <ScanBarcode size={10} /> {product.barcode || '-'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 mr-2">
                            <div className="text-right">
                                <p className="text-[10px] text-slate-400 uppercase font-bold">Stock</p>
                                <p className={`font-bold ${stockColor}`}>
                                    {isOutOfStock ? 'AGOTADO' : `${product.stock} u.`}
                                </p>
                            </div>
                            <div className="text-right w-20">
                                <p className="text-[10px] text-slate-400 uppercase font-bold">Precio</p>
                                <p className="font-bold text-lg text-fuchsia-600">${product.price}</p>
                            </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ================================================= */}
      {/* COLUMNA DERECHA: PANEL DE GESTIÓN (HUD)           */}
      {/* ================================================= */}
      {selectedProduct && (
        <div className="w-[320px] bg-white border-l shadow-2xl flex flex-col shrink-0 animate-in slide-in-from-right duration-300 relative z-20">
          
          <div className="p-4 border-b flex justify-between items-start bg-slate-50">
            <div>
              <h3 className="font-bold text-slate-800 text-lg">Gestión de Stock</h3>
              <p className="text-xs text-slate-500">ID: {String(selectedProduct.id).padStart(6, '0')}</p>
            </div>
            <button 
              onClick={() => setSelectedProduct(null)}
              className="text-slate-400 hover:text-slate-700 hover:bg-slate-200 p-1 rounded-full transition"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            
            {/* 1. Preview Producto */}
            <div className="text-center">
              <div className="w-32 h-32 bg-slate-100 rounded-xl mx-auto mb-3 overflow-hidden border shadow-sm relative group">
                {selectedProduct.image ? (
                  <img src={selectedProduct.image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-500 font-bold p-2 text-sm">
                    {selectedProduct.title}
                  </div>
                )}
                
                {/* RESTRICCIÓN: Solo Admin puede cambiar imagen */}
                {currentUser?.role === 'admin' && (
                  <button 
                    onClick={() => setEditingProduct(selectedProduct)} 
                    className="absolute inset-0 bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity font-bold text-xs"
                  >
                    <Edit size={16} className="mr-1" /> Cambiar
                  </button>
                )}
              </div>
              <h2 className="font-bold text-xl text-slate-800 leading-tight mb-1">{selectedProduct.title}</h2>
              <div className="flex justify-center gap-2 flex-wrap">
                {(selectedProduct.categories || []).map(cat => (
                  <span key={cat} className="px-2 py-0.5 bg-fuchsia-100 text-fuchsia-700 text-[10px] font-bold rounded-full border border-fuchsia-200">
                    {cat}
                  </span>
                ))}
              </div>
            </div>

            {/* 2. Estadísticas Rápidas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-blue-50 rounded-xl border border-blue-100">
                <div className="flex items-center gap-2 text-blue-600 mb-1">
                  <Package size={16} />
                  <span className="text-xs font-bold uppercase">Stock</span>
                </div>
                <p className={`text-2xl font-bold ${getStockColorClass(selectedProduct.stock)}`}>
                    {selectedProduct.stock}
                </p>
              </div>
              <div className="p-3 bg-green-50 rounded-xl border border-green-100">
                <div className="flex items-center gap-2 text-green-600 mb-1">
                  <DollarSign size={16} />
                  <span className="text-xs font-bold uppercase">Precio</span>
                </div>
                <p className="text-2xl font-bold text-green-900">${selectedProduct.price}</p>
              </div>
            </div>

            {/* 3. Datos Informativos (CON RESTRICCIÓN DE VISIBILIDAD) */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-3 border">
              <div className="flex justify-between items-center text-sm border-b border-slate-200 pb-2">
                <span className="text-slate-500 flex items-center gap-2"><ScanBarcode size={14} /> Código</span>
                <span className="font-mono font-bold text-slate-700">{selectedProduct.barcode || '-'}</span>
              </div>
              
              {/* RESTRICCIÓN: El vendedor no ve costos ni márgenes */}
              {currentUser?.role === 'admin' && (
                <>
                  <div className="flex justify-between items-center text-sm border-b border-slate-200 pb-2">
                    <span className="text-slate-500 flex items-center gap-2"><DollarSign size={14} /> Costo</span>
                    <span className="font-bold text-slate-700">${selectedProduct.purchasePrice || 0}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-slate-500 flex items-center gap-2"><BarChart3 size={14} /> Margen</span>
                    <span className="font-bold text-green-600">
                      {selectedProduct.price && selectedProduct.purchasePrice 
                        ? `${Math.round(((selectedProduct.price - selectedProduct.purchasePrice) / selectedProduct.purchasePrice) * 100)}%`
                        : '0%'}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* 4. Acciones Principales (RESTRICCIÓN: Solo Admin) */}
            {currentUser?.role === 'admin' ? (
              <div className="space-y-3 pt-2">
                <button
                  onClick={() => setEditingProduct(selectedProduct)}
                  className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition flex items-center justify-center gap-2 shadow-lg"
                >
                  <Edit size={18} /> Editar Detalles
                </button>
                
                <button
                  onClick={() => {
                      handleDeleteProduct(selectedProduct.id);
                      setSelectedProduct(null); 
                  }}
                  className="w-full py-3 bg-white text-red-600 border border-red-200 rounded-xl font-bold hover:bg-red-50 transition flex items-center justify-center gap-2"
                >
                  <Trash2 size={18} /> Eliminar Producto
                </button>
              </div>
            ) : (
              // Mensaje para el Vendedor
              <div className="p-4 bg-slate-100 rounded-lg text-center text-xs text-slate-500 border border-dashed border-slate-300">
                <p className="font-bold text-slate-600 mb-1">Modo Lectura</p>
                <p>Contacta al dueño para realizar cambios.</p>
              </div>
            )}

          </div>
        </div>
      )}

    </div>
  );
}